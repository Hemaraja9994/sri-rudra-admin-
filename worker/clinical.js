// API for the Audiology and SLP clinician dashboards.
// Sign-in is the admin portal's own: every request is checked against the portal's /api/session.
// Data lives in new tables (clin_*) of the portal database; existing tables are only read
// (appointments, test reports, HA trials and sales matched by phone number).
// Files, reports and therapy plans: worker/documents.js. AI reading and drafting: worker/ai.js.
import {
  DIVISION_IDS,
  cleanPhone,
  indiaToday,
  normalizeEntry,
  normalizePatient,
  regNo,
  stageNote,
} from '../shared/clinical.js';
import { AI_ROUTES } from './ai.js';
import { HttpError, audit as auditLog, check, clinicScope, json, loadPatient, nowSql, readJson } from './common.js';
import { DOCUMENT_ROUTES, documentLists, removePatientDocuments } from './documents.js';

const audit = (ctx, action, entityId, meta) => auditLog(ctx, action, 'clin_patients', entityId, meta);

// The portal decides who is signed in; we only ask it.
// Asks the portal whether this visitor is signed in. On the live address the question goes to that
// same address (Cloudflare sends a Worker's own-route request straight to the portal, not back through
// the Worker); during local development it goes to PORTAL_ORIGIN (the stand-in portal).
export async function portalSession(request, env) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const here = new URL(request.url);
  const origin = here.hostname === env.PRODUCTION_HOST ? here.origin : env.PORTAL_ORIGIN;
  const res = await fetch(new URL('/api/session', origin), {
    headers: { cookie, accept: 'application/json', 'user-agent': request.headers.get('user-agent') || 'portal-plus' },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && data.user ? data : null;
}

const PATIENT_FIELDS = ['division', 'name', 'phone', 'sex', 'dob', 'age_years', 'file_no', 'clinic_id', 'diagnosis', 'diagnosis_detail', 'ear', 'degree', 'stage', 'priority', 'next_review', 'referred_by', 'clinician', 'notes', 'status'];

// ---------- handlers ----------

function me(ctx) {
  const u = ctx.user;
  return json({
    user: { id: u.id, full_name: u.full_name, username: u.username, role: u.role, clinic_id: u.clinic_id ?? null, canManageUsers: !!u.canManageUsers, canSeeAllClinics: !!u.canSeeAllClinics },
    clinics: (ctx.session.clinics || []).map((c) => ({ id: c.id, name: c.name })),
    today: indiaToday(),
  });
}

async function listPatients(ctx) {
  const division = ctx.url.searchParams.get('division');
  if (!DIVISION_IDS.includes(division)) throw new HttpError(400, 'Choose a division.');
  const where = ['p.division = ?'];
  const args = [division];
  const status = ctx.url.searchParams.get('status') || 'active';
  if (status === 'active' || status === 'discharged') { where.push('p.status = ?'); args.push(status); }
  const scope = clinicScope(ctx.user);
  if (scope) { where.push('(p.clinic_id = ? OR p.clinic_id IS NULL)'); args.push(scope); }
  const { results } = await ctx.db.prepare(
    `SELECT p.*, c.name AS clinic_name,
            (SELECT MAX(e.entry_date) FROM clin_entries e WHERE e.patient_id = p.id AND e.kind <> 'stage') AS last_seen
       FROM clin_patients p LEFT JOIN clinics c ON c.id = p.clinic_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.updated_at DESC
      LIMIT 2000`,
  ).bind(...args).all();
  return json({ patients: results });
}

async function createPatient(ctx) {
  const body = await readJson(ctx.request);
  const p = check(normalizePatient, body);
  const scope = clinicScope(ctx.user);
  if (scope) p.clinic_id = scope;
  if (p.clinic_id && !(ctx.session.clinics || []).some((c) => Number(c.id) === p.clinic_id)) throw new HttpError(400, 'Choose a valid clinic.');
  const now = nowSql();
  const result = await ctx.db.prepare(
    `INSERT INTO clin_patients (${PATIENT_FIELDS.join(', ')}, created_by, created_by_name, created_at, updated_at)
     VALUES (${PATIENT_FIELDS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
  ).bind(...PATIENT_FIELDS.map((f) => p[f]), ctx.user.id ?? null, ctx.user.full_name ?? null, now, now).run();
  const id = result.meta.last_row_id;
  await ctx.db.batch([
    ctx.db.prepare('UPDATE clin_patients SET reg_no = ? WHERE id = ?').bind(regNo(p.division, id, now), id),
    ctx.db.prepare("INSERT INTO clin_entries (patient_id, kind, title, stage_to, entry_date, created_by, created_by_name) VALUES (?, 'stage', ?, ?, ?, ?, ?)")
      .bind(id, stageNote(p.division, null, p.stage), p.stage, indiaToday(), ctx.user.id ?? null, ctx.user.full_name ?? null),
  ]);
  await audit(ctx, 'clinical.patient.create', id, { division: p.division });
  return json({ id }, 201);
}

async function getPatient(ctx, id) {
  const patient = await loadPatient(ctx, id);
  const clinic = patient.clinic_id ? await ctx.db.prepare('SELECT name FROM clinics WHERE id = ?').bind(patient.clinic_id).first() : null;
  const { results: entries } = await ctx.db.prepare(
    'SELECT * FROM clin_entries WHERE patient_id = ? ORDER BY entry_date DESC, id DESC LIMIT 500',
  ).bind(patient.id).all();
  const [linked, documents] = await Promise.all([linkedRecords(ctx, patient), documentLists(ctx, patient)]);
  return json({ patient: { ...patient, clinic_name: clinic?.name ?? null }, entries, linked, ...documents });
}

// The portal's own records for the same phone number (last 10 digits), newest first.
async function linkedRecords(ctx, patient) {
  const phone = cleanPhone(patient.phone);
  const empty = { appointments: [], reports: [], trials: [], sales: [] };
  if (phone.length < 10) return empty;
  const last10 = phone.slice(-10);
  const norm = (col) => `substr(replace(replace(replace(replace(${col}, ' ', ''), '-', ''), '+', ''), '(', ''), -10)`;
  const scope = clinicScope(ctx.user);
  const clinicFilter = (alias) => (scope ? ` AND ${alias}.clinic_id = ${scope}` : '');
  try {
    const [appointments, reports, trials, sales] = await ctx.db.batch([
      ctx.db.prepare(`SELECT a.id, a.scheduled_for, a.service, a.status, a.notes, c.name AS clinic_name FROM appointments a LEFT JOIN clinics c ON c.id = a.clinic_id
                       WHERE a.patient_phone IS NOT NULL AND ${norm('a.patient_phone')} = ?${clinicFilter('a')} ORDER BY a.scheduled_for DESC LIMIT 25`).bind(last10),
      ctx.db.prepare(`SELECT r.id, r.performed_at, r.kind, r.clinician, c.name AS clinic_name FROM test_reports r LEFT JOIN clinics c ON c.id = r.clinic_id
                       WHERE r.patient_phone IS NOT NULL AND ${norm('r.patient_phone')} = ?${clinicFilter('r')} ORDER BY r.performed_at DESC LIMIT 25`).bind(last10),
      ctx.db.prepare(`SELECT t.id, t.trial_date, t.model_name, t.ear, t.outcome, t.follow_up_on, b.name AS brand_name FROM ha_trials t LEFT JOIN brands b ON b.id = t.brand_id
                       WHERE t.patient_phone IS NOT NULL AND ${norm('t.patient_phone')} = ?${clinicFilter('t')} ORDER BY t.trial_date DESC LIMIT 25`).bind(last10),
      ctx.db.prepare(`SELECT s.id, s.sale_date, s.model_name, s.qty, b.name AS brand_name FROM ha_sales s LEFT JOIN brands b ON b.id = s.brand_id
                       WHERE s.patient_phone IS NOT NULL AND ${norm('s.patient_phone')} = ?${clinicFilter('s')} ORDER BY s.sale_date DESC LIMIT 25`).bind(last10),
    ]);
    return { appointments: appointments.results, reports: reports.results, trials: trials.results, sales: sales.results };
  } catch (err) {
    console.error('linked records', err?.message);
    return empty;
  }
}

async function updatePatient(ctx, id) {
  const current = await loadPatient(ctx, id);
  const body = await readJson(ctx.request);
  const p = check(normalizePatient, { ...current, ...body, division: current.division });
  const scope = clinicScope(ctx.user);
  if (scope) p.clinic_id = scope;
  if (p.clinic_id && p.clinic_id !== current.clinic_id && !(ctx.session.clinics || []).some((c) => Number(c.id) === p.clinic_id)) {
    throw new HttpError(400, 'Choose a valid clinic.');
  }
  const now = nowSql();
  const statements = [
    ctx.db.prepare(`UPDATE clin_patients SET ${PATIENT_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...PATIENT_FIELDS.map((f) => p[f]), now, current.id),
  ];
  if (p.stage !== current.stage) {
    statements.push(
      ctx.db.prepare("INSERT INTO clin_entries (patient_id, kind, title, stage_from, stage_to, entry_date, created_by, created_by_name) VALUES (?, 'stage', ?, ?, ?, ?, ?, ?)")
        .bind(current.id, stageNote(current.division, current.stage, p.stage), current.stage, p.stage, indiaToday(), ctx.user.id ?? null, ctx.user.full_name ?? null),
    );
  }
  await ctx.db.batch(statements);
  await audit(ctx, 'clinical.patient.update', current.id, p.stage !== current.stage ? { stage: `${current.stage}->${p.stage}` } : null);
  return json({ ok: true });
}

async function deletePatient(ctx, id) {
  if (!ctx.user.canManageUsers) throw new HttpError(403, 'Only the clinic owner or an admin can delete a patient.');
  const current = await loadPatient(ctx, id);
  await removePatientDocuments(ctx, current.id);
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM clin_entries WHERE patient_id = ?').bind(current.id),
    ctx.db.prepare('DELETE FROM clin_patients WHERE id = ?').bind(current.id),
  ]);
  await audit(ctx, 'clinical.patient.delete', current.id, { division: current.division });
  return json({ ok: true });
}

async function addEntry(ctx, id) {
  const patient = await loadPatient(ctx, id);
  const body = await readJson(ctx.request);
  const e = check(normalizeEntry, body);
  const statements = [
    ctx.db.prepare('INSERT INTO clin_entries (patient_id, kind, title, body, entry_date, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(patient.id, e.kind, e.title, e.body, e.entry_date, ctx.user.id ?? null, ctx.user.full_name ?? null),
  ];
  if (body.next_review !== undefined) {
    const next = body.next_review || null;
    if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new HttpError(400, 'Pick a valid review date.');
    statements.push(ctx.db.prepare("UPDATE clin_patients SET next_review = ?, updated_at = datetime('now') WHERE id = ?").bind(next, patient.id));
  } else {
    statements.push(ctx.db.prepare("UPDATE clin_patients SET updated_at = datetime('now') WHERE id = ?").bind(patient.id));
  }
  await ctx.db.batch(statements);
  await audit(ctx, 'clinical.entry.create', patient.id, { kind: e.kind });
  return json({ ok: true }, 201);
}

async function deleteEntry(ctx, id) {
  const entry = await ctx.db.prepare('SELECT * FROM clin_entries WHERE id = ?').bind(Number(id)).first();
  if (!entry) throw new HttpError(404, 'Entry not found.');
  await loadPatient(ctx, entry.patient_id);
  if (entry.kind === 'stage') throw new HttpError(400, 'Stage history cannot be deleted.');
  if (!ctx.user.canManageUsers && entry.created_by !== ctx.user.id) throw new HttpError(403, 'Only the person who wrote this entry, or an admin, can delete it.');
  await ctx.db.prepare('DELETE FROM clin_entries WHERE id = ?').bind(entry.id).run();
  await audit(ctx, 'clinical.entry.delete', entry.patient_id, { entry: entry.id });
  return json({ ok: true });
}

// ---------- routing ----------

const ROUTES = [
  ['GET', /^\/me$/, me],
  ['GET', /^\/patients$/, listPatients],
  ['POST', /^\/patients$/, createPatient],
  ['GET', /^\/patients\/(\d+)$/, getPatient],
  ['PATCH', /^\/patients\/(\d+)$/, updatePatient],
  ['DELETE', /^\/patients\/(\d+)$/, deletePatient],
  ['POST', /^\/patients\/(\d+)\/entries$/, addEntry],
  ['DELETE', /^\/entries\/(\d+)$/, deleteEntry],
  ...DOCUMENT_ROUTES,
  ...AI_ROUTES,
];

export async function handleClinicalApi(request, env, url) {
  try {
    const path = url.pathname.replace(/^\/clinical\/api/, '');
    const route = ROUTES.find(([method, re]) => method === request.method && re.test(path));
    if (!route) throw new HttpError(404, 'Not found.');
    const session = await portalSession(request, env);
    if (!session) throw new HttpError(401, 'Please sign in to the portal first.');
    const ctx = { request, env, url, session, user: session.user, db: env.DB };
    const match = path.match(route[1]);
    return await route[2](ctx, ...match.slice(1));
  } catch (err) {
    if (err instanceof HttpError) return json({ error: { message: err.message } }, err.status);
    if (/no such table/i.test(String(err?.message))) {
      return json({ error: { message: 'The clinical tables are not set up yet. Run the database step in the README (migrations/0001 and 0002).' } }, 503);
    }
    console.error(err);
    return json({ error: { message: 'Something went wrong. Please try again.' } }, 500);
  }
}
