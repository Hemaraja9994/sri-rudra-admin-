// Uploaded files, diagnostic reports and therapy plans for each clinical patient.
// File contents live in Workers KV (binding FILES); the clin_files table is the index.
// Reports and plans are stored as JSON shaped by shared/reports.js and shared/plans.js.
import { SEXES, ageFrom, daysBetween, indiaToday, isIsoDate, labelOf } from '../shared/clinical.js';
import { blankPlan, cleanPlan, cleanProgress, normalizePlanInput } from '../shared/plans.js';
import { CLINIC, blankReport, caseInfoFor, cleanReportData, reportNo, template, validityFor } from '../shared/reports.js';
import { HttpError, audit, canManage, check, json, loadPatient, nowSql, parseJson, readJson } from './common.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const FILE_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

// ---------- lists shown on the patient page ----------

export async function documentLists(ctx, patient) {
  try {
    const [files, reports, plans] = await ctx.db.batch([
      ctx.db.prepare('SELECT id, file_name, content_type, size_bytes, ai_summary, uploaded_by, uploaded_by_name, created_at FROM clin_files WHERE patient_id = ? ORDER BY id DESC').bind(patient.id),
      ctx.db.prepare('SELECT id, template, report_no, title, report_date, valid_until, status, clinician, created_by, created_by_name, updated_at FROM clin_reports WHERE patient_id = ? ORDER BY report_date DESC, id DESC').bind(patient.id),
      ctx.db.prepare('SELECT id, report_id, title, sessions_count, minutes, per_week, start_date, status, progress_json, created_by, created_by_name, updated_at FROM clin_plans WHERE patient_id = ? ORDER BY id DESC').bind(patient.id),
    ]);
    return {
      files: files.results,
      reports: reports.results,
      plans: plans.results.map(({ progress_json: progress, ...p }) => ({ ...p, done: Object.keys(parseJson(progress, {}).done || {}).length })),
      documentsReady: true,
    };
  } catch (err) {
    // Before the 0002 tables exist the patient page still works, without these lists.
    if (/no such table/i.test(String(err?.message))) return { files: [], reports: [], plans: [], documentsReady: false };
    throw err;
  }
}

// Used when a whole patient record is deleted.
export async function removePatientDocuments(ctx, patientId) {
  let keys = [];
  try {
    const { results } = await ctx.db.prepare('SELECT kv_key FROM clin_files WHERE patient_id = ?').bind(patientId).all();
    keys = results.map((r) => r.kv_key);
    await ctx.db.batch([
      ctx.db.prepare('DELETE FROM clin_files WHERE patient_id = ?').bind(patientId),
      ctx.db.prepare('DELETE FROM clin_reports WHERE patient_id = ?').bind(patientId),
      ctx.db.prepare('DELETE FROM clin_plans WHERE patient_id = ?').bind(patientId),
    ]);
  } catch (err) {
    if (!/no such table/i.test(String(err?.message))) throw err;
  }
  if (ctx.env.FILES) await Promise.all(keys.map((k) => ctx.env.FILES.delete(k).catch(() => {})));
}

// ---------- files ----------

function cleanFileName(name, ext) {
  const base = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  return base || `file.${ext}`;
}

async function loadFile(ctx, id) {
  const row = await ctx.db.prepare('SELECT * FROM clin_files WHERE id = ?').bind(Number(id)).first();
  if (!row) throw new HttpError(404, 'File not found.');
  await loadPatient(ctx, row.patient_id); // same clinic rules as the patient
  return row;
}

// The browser sends the file itself as the request body (not JSON).
async function uploadFile(ctx, patientId) {
  const patient = await loadPatient(ctx, patientId);
  if (!ctx.env.FILES) throw new HttpError(503, 'File storage is not switched on yet.');
  const type = (ctx.request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = FILE_TYPES[type];
  if (!ext) throw new HttpError(415, 'Add a PDF, a photo (JPG, PNG, WebP or HEIC), a Word file or a text file.');
  const size = Number(ctx.request.headers.get('content-length') || 0);
  if (!size) throw new HttpError(411, 'The file arrived empty. Please try again.');
  if (size > MAX_FILE_BYTES) throw new HttpError(413, 'Files can be up to 15 MB. Take a photo of the page instead, or split the PDF.');
  const name = cleanFileName(ctx.url.searchParams.get('name'), ext);
  const key = `clin/${patient.id}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await ctx.env.FILES.put(key, ctx.request.body, { metadata: { name, type, patient: patient.id } });
  const summary = String(ctx.url.searchParams.get('summary') || '').slice(0, 1500) || null;
  const result = await ctx.db.prepare(
    'INSERT INTO clin_files (patient_id, kv_key, file_name, content_type, size_bytes, ai_summary, uploaded_by, uploaded_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(patient.id, key, name, type, size, summary, ctx.user.id ?? null, ctx.user.full_name ?? null, nowSql()).run();
  const id = result.meta.last_row_id;
  await ctx.db.prepare("UPDATE clin_patients SET updated_at = datetime('now') WHERE id = ?").bind(patient.id).run();
  await audit(ctx, 'clinical.file.upload', 'clin_files', id, { patient: patient.id, type, size });
  return json({ id }, 201);
}

async function openFile(ctx, id) {
  const row = await loadFile(ctx, id);
  if (!ctx.env.FILES) throw new HttpError(503, 'File storage is not switched on yet.');
  const body = await ctx.env.FILES.get(row.kv_key, { type: 'stream' });
  if (!body) throw new HttpError(404, 'This file is missing from storage.');
  const disposition = ctx.url.searchParams.get('download') ? 'attachment' : 'inline';
  return new Response(body, {
    headers: {
      'content-type': row.content_type,
      'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function updateFile(ctx, id) {
  const row = await loadFile(ctx, id);
  const body = await readJson(ctx.request);
  const summary = body.ai_summary === null ? null : String(body.ai_summary ?? row.ai_summary ?? '').slice(0, 1500) || null;
  await ctx.db.prepare('UPDATE clin_files SET ai_summary = ? WHERE id = ?').bind(summary, row.id).run();
  return json({ ok: true });
}

async function deleteFile(ctx, id) {
  const row = await loadFile(ctx, id);
  if (!canManage(ctx.user) && row.uploaded_by !== ctx.user.id) throw new HttpError(403, 'Only the person who added this file, or an admin, can delete it.');
  await ctx.db.prepare('DELETE FROM clin_files WHERE id = ?').bind(row.id).run();
  if (ctx.env.FILES) await ctx.env.FILES.delete(row.kv_key).catch(() => {});
  await audit(ctx, 'clinical.file.delete', 'clin_files', row.id, { patient: row.patient_id, name: row.file_name });
  return json({ ok: true });
}

// ---------- reports ----------

export function ageText(patient, today) {
  const age = ageFrom(patient, today);
  if (age === null) return '';
  if (age < 2 && isIsoDate(patient.dob)) return `${Math.max(0, Math.floor(daysBetween(patient.dob, today) / 30.44))} months`;
  return `${age} ${age === 1 ? 'year' : 'years'}`;
}

function reportRow(row) {
  const { data_json: data, ...rest } = row;
  return { ...rest, data: parseJson(data, {}) };
}

async function loadReport(ctx, id) {
  const row = await ctx.db.prepare('SELECT * FROM clin_reports WHERE id = ?').bind(Number(id)).first();
  if (!row) throw new HttpError(404, 'Report not found.');
  const patient = await loadPatient(ctx, row.patient_id);
  return { row, patient };
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function createReport(ctx, patientId) {
  const patient = await loadPatient(ctx, patientId);
  const body = await readJson(ctx.request);
  const tpl = template(body.template);
  if (!tpl || tpl.division !== patient.division) throw new HttpError(400, 'Choose a report type for this division.');
  const today = indiaToday();
  const reportDate = isIsoDate(body.report_date) ? body.report_date : today;
  const [y, m] = reportDate.split('-');
  const { n } = await ctx.db.prepare('SELECT COUNT(*) AS n FROM clin_reports WHERE report_no LIKE ?')
    .bind(`${CLINIC.prefix}/${tpl.code}/%/${MONTH[Number(m) - 1]}/${y}`).first();
  const caseInfo = caseInfoFor(patient, ageText(patient, today), labelOf(SEXES, patient.sex));
  caseInfo.eval_date = reportDate;
  const data = blankReport(tpl, caseInfo);
  data.referral.source = patient.referred_by || '';
  const now = nowSql();
  const result = await ctx.db.prepare(
    `INSERT INTO clin_reports (patient_id, template, report_no, title, report_date, valid_until, status, data_json, clinician, qualification, rci_no, created_by, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    patient.id, tpl.id, reportNo(tpl.code, Number(n || 0) + 1, reportDate), tpl.title, reportDate, validityFor(reportDate), JSON.stringify(data),
    String(body.clinician || ctx.user.full_name || '').slice(0, 120) || null, String(body.qualification || '').slice(0, 120) || null, String(body.rci_no || '').slice(0, 60) || null,
    ctx.user.id ?? null, ctx.user.full_name ?? null, now, now,
  ).run();
  const id = result.meta.last_row_id;
  await audit(ctx, 'clinical.report.create', 'clin_reports', id, { patient: patient.id, template: tpl.id });
  return json({ id }, 201);
}

async function getReport(ctx, id) {
  const { row, patient } = await loadReport(ctx, id);
  return json({ report: reportRow(row), patient });
}

async function updateReport(ctx, id) {
  const { row, patient } = await loadReport(ctx, id);
  const tpl = template(row.template);
  const body = await readJson(ctx.request);
  const reopening = row.status === 'final' && body.status === 'draft';
  if (row.status === 'final' && !reopening) throw new HttpError(409, 'This report is final. Reopen it to make changes.');
  if (reopening && !canManage(ctx.user) && row.created_by !== ctx.user.id) throw new HttpError(403, 'Only the clinician who wrote this report, or an admin, can reopen it.');
  const next = {
    report_no: body.report_no !== undefined ? String(body.report_no).trim().slice(0, 60) || row.report_no : row.report_no,
    title: body.title !== undefined ? String(body.title).trim().slice(0, 160) || tpl.title : row.title,
    report_date: body.report_date !== undefined ? body.report_date : row.report_date,
    valid_until: body.valid_until !== undefined ? body.valid_until || null : row.valid_until,
    clinician: body.clinician !== undefined ? String(body.clinician).trim().slice(0, 120) || null : row.clinician,
    qualification: body.qualification !== undefined ? String(body.qualification).trim().slice(0, 120) || null : row.qualification,
    rci_no: body.rci_no !== undefined ? String(body.rci_no).trim().slice(0, 60) || null : row.rci_no,
    status: body.status === 'final' || body.status === 'draft' ? body.status : row.status,
    data: body.data !== undefined ? cleanReportData(tpl, body.data) : parseJson(row.data_json, {}),
  };
  if (!isIsoDate(next.report_date)) throw new HttpError(400, 'Pick the report date.');
  if (next.valid_until && !isIsoDate(next.valid_until)) throw new HttpError(400, 'Pick a valid "valid until" date.');
  if (next.status === 'final' && !next.clinician) throw new HttpError(400, 'Add the clinician’s name before marking the report final.');
  const finalizing = next.status === 'final' && row.status !== 'final';
  await ctx.db.prepare(
    `UPDATE clin_reports SET report_no = ?, title = ?, report_date = ?, valid_until = ?, clinician = ?, qualification = ?, rci_no = ?, status = ?, data_json = ?,
       ai_used = MAX(ai_used, ?), updated_at = ?, finalized_at = CASE WHEN ? THEN ? WHEN ? = 'draft' THEN NULL ELSE finalized_at END WHERE id = ?`,
  ).bind(
    next.report_no, next.title, next.report_date, next.valid_until, next.clinician, next.qualification, next.rci_no, next.status, JSON.stringify(next.data),
    body.ai_used ? 1 : 0, nowSql(), finalizing ? 1 : 0, nowSql(), next.status, row.id,
  ).run();
  if (finalizing || reopening) await audit(ctx, finalizing ? 'clinical.report.finalize' : 'clinical.report.reopen', 'clin_reports', row.id, { patient: patient.id });
  else await audit(ctx, 'clinical.report.update', 'clin_reports', row.id, { patient: patient.id });
  const fresh = await ctx.db.prepare('SELECT * FROM clin_reports WHERE id = ?').bind(row.id).first();
  return json({ report: reportRow(fresh) });
}

async function deleteReport(ctx, id) {
  const { row, patient } = await loadReport(ctx, id);
  const own = row.created_by === ctx.user.id;
  if (!canManage(ctx.user) && !(own && row.status === 'draft')) throw new HttpError(403, 'Only an admin can delete a final report; you can delete your own drafts.');
  await ctx.db.prepare('DELETE FROM clin_reports WHERE id = ?').bind(row.id).run();
  await audit(ctx, 'clinical.report.delete', 'clin_reports', row.id, { patient: patient.id, report_no: row.report_no });
  return json({ ok: true });
}

// ---------- therapy plans ----------

function planRow(row) {
  const { plan_json: plan, progress_json: progress, ...rest } = row;
  return { ...rest, plan: cleanPlan(parseJson(plan, {}), row.sessions_count), progress: cleanProgress(parseJson(progress, {}), row.sessions_count) };
}

export async function loadPlan(ctx, id) {
  const row = await ctx.db.prepare('SELECT * FROM clin_plans WHERE id = ?').bind(Number(id)).first();
  if (!row) throw new HttpError(404, 'Therapy plan not found.');
  const patient = await loadPatient(ctx, row.patient_id);
  return { row, patient };
}

async function createPlan(ctx, patientId) {
  const patient = await loadPatient(ctx, patientId);
  const body = await readJson(ctx.request);
  const p = check(normalizePlanInput, body);
  let reportId = null;
  if (body.report_id) {
    const report = await ctx.db.prepare('SELECT id FROM clin_reports WHERE id = ? AND patient_id = ?').bind(Number(body.report_id), patient.id).first();
    if (!report) throw new HttpError(400, 'That report belongs to another patient.');
    reportId = report.id;
  }
  const now = nowSql();
  const result = await ctx.db.prepare(
    `INSERT INTO clin_plans (patient_id, report_id, title, sessions_count, minutes, per_week, start_date, focus, status, plan_json, progress_json, created_by, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, '{}', ?, ?, ?, ?)`,
  ).bind(patient.id, reportId, p.title, p.sessions_count, p.minutes, p.per_week, p.start_date, p.focus, JSON.stringify(blankPlan(p.sessions_count)),
    ctx.user.id ?? null, ctx.user.full_name ?? null, now, now).run();
  const id = result.meta.last_row_id;
  await audit(ctx, 'clinical.plan.create', 'clin_plans', id, { patient: patient.id, sessions: p.sessions_count });
  return json({ id }, 201);
}

async function getPlan(ctx, id) {
  const { row, patient } = await loadPlan(ctx, id);
  const report = row.report_id ? await ctx.db.prepare('SELECT id, report_no, title, report_date FROM clin_reports WHERE id = ?').bind(row.report_id).first() : null;
  return json({ plan: planRow(row), patient, report });
}

// Saves the plan. Sessions newly ticked as done are also written to the patient's timeline.
async function updatePlan(ctx, id) {
  const { row, patient } = await loadPlan(ctx, id);
  const body = await readJson(ctx.request);
  const settings = check(normalizePlanInput, {
    title: body.title ?? row.title,
    sessions_count: body.sessions_count ?? row.sessions_count,
    minutes: body.minutes !== undefined ? body.minutes : row.minutes,
    per_week: body.per_week !== undefined ? body.per_week : row.per_week,
    start_date: body.start_date !== undefined ? body.start_date : row.start_date,
    focus: body.focus !== undefined ? body.focus : row.focus,
  });
  const n = settings.sessions_count;
  const plan = cleanPlan(body.plan !== undefined ? body.plan : parseJson(row.plan_json, {}), n);
  const before = cleanProgress(parseJson(row.progress_json, {}), row.sessions_count);
  const progress = cleanProgress(body.progress !== undefined ? body.progress : before, n);
  const status = ['draft', 'active', 'completed'].includes(body.status) ? body.status : row.status;
  const statements = [
    ctx.db.prepare(
      `UPDATE clin_plans SET title = ?, sessions_count = ?, minutes = ?, per_week = ?, start_date = ?, focus = ?, status = ?, plan_json = ?, progress_json = ?,
         ai_used = MAX(ai_used, ?), updated_at = ? WHERE id = ?`,
    ).bind(settings.title, n, settings.minutes, settings.per_week, settings.start_date, settings.focus, status, JSON.stringify(plan), JSON.stringify(progress),
      body.ai_used ? 1 : 0, nowSql(), row.id),
  ];
  const today = indiaToday();
  for (const [k, v] of Object.entries(progress.done)) {
    if (before.done[k]) continue;
    const s = plan.sessions[Number(k) - 1];
    statements.push(ctx.db.prepare("INSERT INTO clin_entries (patient_id, kind, title, body, entry_date, created_by, created_by_name) VALUES (?, 'session', ?, ?, ?, ?, ?)")
      .bind(patient.id, `Session ${k} of ${n}${s?.title ? `: ${s.title}` : ''}`, v.note || null, v.date || today, ctx.user.id ?? null, ctx.user.full_name ?? null));
  }
  statements.push(ctx.db.prepare("UPDATE clin_patients SET updated_at = datetime('now') WHERE id = ?").bind(patient.id));
  await ctx.db.batch(statements);
  await audit(ctx, 'clinical.plan.update', 'clin_plans', row.id, { patient: patient.id });
  const fresh = await ctx.db.prepare('SELECT * FROM clin_plans WHERE id = ?').bind(row.id).first();
  return json({ plan: planRow(fresh) });
}

async function deletePlan(ctx, id) {
  const { row, patient } = await loadPlan(ctx, id);
  if (!canManage(ctx.user) && row.created_by !== ctx.user.id) throw new HttpError(403, 'Only the clinician who made this plan, or an admin, can delete it.');
  await ctx.db.prepare('DELETE FROM clin_plans WHERE id = ?').bind(row.id).run();
  await audit(ctx, 'clinical.plan.delete', 'clin_plans', row.id, { patient: patient.id });
  return json({ ok: true });
}

export { planRow, reportRow, loadReport };

export const DOCUMENT_ROUTES = [
  ['POST', /^\/patients\/(\d+)\/files$/, uploadFile],
  ['GET', /^\/files\/(\d+)$/, openFile],
  ['PATCH', /^\/files\/(\d+)$/, updateFile],
  ['DELETE', /^\/files\/(\d+)$/, deleteFile],
  ['POST', /^\/patients\/(\d+)\/reports$/, createReport],
  ['GET', /^\/reports\/(\d+)$/, getReport],
  ['PATCH', /^\/reports\/(\d+)$/, updateReport],
  ['DELETE', /^\/reports\/(\d+)$/, deleteReport],
  ['POST', /^\/patients\/(\d+)\/plans$/, createPlan],
  ['GET', /^\/plans\/(\d+)$/, getPlan],
  ['PATCH', /^\/plans\/(\d+)$/, updatePlan],
  ['DELETE', /^\/plans\/(\d+)$/, deletePlan],
];
