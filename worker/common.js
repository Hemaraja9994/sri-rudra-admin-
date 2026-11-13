// Small helpers shared by the clinical API modules (patients, files, reports, plans, AI).

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Send JSON.');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'That request could not be read.');
  }
}

// Runs one of the shared/ checkers and turns its message into a 400 for the browser.
export function check(fn, ...args) {
  try {
    return fn(...args);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
}

// Staff limited to one clinic only see that clinic's patients.
export function clinicScope(user) {
  return user.canSeeAllClinics || !user.clinic_id ? null : Number(user.clinic_id);
}

export function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function canManage(user) {
  return !!user.canManageUsers;
}

// The portal's audit log. Never stops the request when it fails.
export async function audit(ctx, action, entity, entityId, meta) {
  try {
    await ctx.db.prepare('INSERT INTO audit_log (user_id, clinic_id, action, entity, entity_id, meta_json, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(ctx.user.id ?? null, ctx.user.clinic_id ?? null, action, entity, String(entityId ?? ''), meta ? JSON.stringify(meta) : null, ctx.request.headers.get('cf-connecting-ip'))
      .run();
  } catch (err) {
    console.error('audit failed', err?.message);
  }
}

export async function loadPatient(ctx, id) {
  const row = await ctx.db.prepare('SELECT * FROM clin_patients WHERE id = ?').bind(Number(id)).first();
  if (!row) throw new HttpError(404, 'Patient not found.');
  const scope = clinicScope(ctx.user);
  if (scope && row.clinic_id && row.clinic_id !== scope) throw new HttpError(404, 'Patient not found.');
  return row;
}

export function parseJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
