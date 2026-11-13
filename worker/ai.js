// AI for the clinical dashboards, on Cloudflare Workers AI (binding AI, free daily allowance).
// 1. read:   uploaded records (photos / PDF pages / text) -> patient details for the Add patient form
// 2. report: drafts the narrative parts of a diagnostic report from what the clinician has entered
// 3. plan:   drafts a therapy plan (outline first, then sessions in small batches)
// Every result is a draft: nothing is saved until a clinician checks it and saves.
// Each use is written to the portal's audit log (AI use is recorded internally, not printed).
// Local development: set AI_MOCK=1 to get fixed sample answers without calling Cloudflare.
import { DEGREES, DIVISIONS, EARS, SEXES, cleanPhone, indiaToday, isIsoDate, labelOf } from '../shared/clinical.js';
import { checkpoints, cleanPlan, frequencyText, weeksFor } from '../shared/plans.js';
import { aiSectionKeys, cleanReportData, reportAsText, template } from '../shared/reports.js';
import { HttpError, audit, clinicScope, json, loadPatient, nowSql, parseJson, readJson } from './common.js';
import { ageText, loadPlan, loadReport, planRow } from './documents.js';

export const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 1_600_000; // about 1.2 MB of JPEG per page
const MAX_TEXT_CHARS = 24_000;

// ---------- calling the model ----------

function parseLoose(text) {
  const t = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return parseJson(t.slice(start, end + 1), null);
}

async function runModel(env, { system, content, schema, maxTokens }) {
  if (!env.AI) throw new HttpError(503, 'The AI is not switched on for this portal yet.');
  let res;
  try {
    res = await env.AI.run(MODEL, {
      messages: [{ role: 'system', content: system }, { role: 'user', content }],
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: schema },
    });
  } catch (err) {
    const msg = String(err?.message || err);
    console.error('workers ai', msg);
    if (/3036|neuron|daily|allocation|quota|rate limit|429/i.test(msg)) {
      throw new HttpError(429, 'Today’s free AI allowance is used up. It resets at 5:30 AM. You can still fill this in by hand.');
    }
    if (/too large|payload|context|token/i.test(msg)) throw new HttpError(413, 'That is too much for the AI in one go. Try fewer pages.');
    throw new HttpError(502, 'The AI could not answer just now. Please try again, or fill this in by hand.');
  }
  const out = res && typeof res === 'object' && 'response' in res ? res.response : res;
  const data = out && typeof out === 'object' ? out : parseLoose(out);
  if (!data || typeof data !== 'object') throw new HttpError(502, 'The AI’s answer could not be read. Please try again.');
  return data;
}

// ---------- 1. reading uploaded records ----------

const READ_SYSTEM = `You read clinical documents for Sri Rudra Speech & Hearing Clinic, an audiology and speech-language pathology clinic in Visakhapatnam, India.
Documents may be hospital case sheets, ENT notes, audiograms, referral letters, prescriptions or earlier reports, printed or handwritten.
Rules:
- Copy information exactly as written. Never guess, infer or invent. If something is not clearly written, give an empty string.
- name: the patient's name as written, without Mr., Mrs., Ms., Smt., Sri, Kum. or Master.
- dob: YYYY-MM-DD only when a full date of birth is written. age_years: whole years as written (e.g. "55").
- sex: female, male or other, only if written (M/F counts).
- phone: the patient's mobile number, digits only.
- file_no: hospital, MR, UHID or OP number as written. referred_by: the referring doctor or place.
- diagnosis: one key from the allowed list that matches the diagnosis or impression written in the document; empty if none is written.
- diagnosis_detail: the diagnosis or impression in the document's own words (short).
- complaint: the presenting complaint in a few words.
- findings: short lines with examination findings and impressions as written.
- test_results: short lines, one per test, with values exactly as written (e.g. "PTA right ear 48 dB HL", "Tympanogram: A type both ears", "MPD /a/ 8 s").
Reply with JSON only.`;

const READ_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' }, age_years: { type: 'string' }, dob: { type: 'string' }, sex: { type: 'string' },
    phone: { type: 'string' }, file_no: { type: 'string' }, referred_by: { type: 'string' }, languages: { type: 'string' },
    diagnosis: { type: 'string' }, diagnosis_detail: { type: 'string' }, ear: { type: 'string' }, degree: { type: 'string' },
    complaint: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    test_results: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'age_years', 'sex', 'phone', 'diagnosis', 'findings', 'test_results'],
};

function divisionGuide(divisionId) {
  const div = DIVISIONS[divisionId];
  const lines = [`Division: ${div.label}.`, `Allowed diagnosis keys: ${div.diagnoses.map(([k, l]) => `${k} = ${l}`).join('; ')}.`];
  if (divisionId === 'audiology') {
    lines.push(`ear: ${EARS.map(([k]) => k).join(' | ')} (which ear(s) have the hearing loss).`);
    lines.push(`degree: ${DEGREES.map(([k, l]) => `${k} = ${l}`).join('; ')} (the worse ear, as written).`);
  }
  return lines.join('\n');
}

// Only values that pass the same rules as the Add patient form; anything doubtful is left out.
function cleanRead(divisionId, raw) {
  const div = DIVISIONS[divisionId];
  const t = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => t(x, 300)).filter(Boolean).slice(0, 25);
  const fields = {};
  const name = t(raw.name, 120).replace(/^(mr|mrs|ms|smt|sri|shri|kum|master|miss)\.?\s+/i, '');
  if (name) fields.name = name;
  const age = Number.parseInt(t(raw.age_years, 6), 10);
  if (Number.isInteger(age) && age >= 0 && age <= 120) fields.age_years = String(age);
  if (isIsoDate(t(raw.dob, 10)) && t(raw.dob, 10) <= indiaToday()) fields.dob = t(raw.dob, 10);
  const sex = t(raw.sex, 10).toLowerCase();
  const sexKey = { m: 'male', f: 'female' }[sex] || sex;
  if (SEXES.some(([k]) => k === sexKey)) fields.sex = sexKey;
  const phone = cleanPhone(raw.phone);
  if (phone.length >= 10 && phone.length <= 12) fields.phone = phone.slice(-10);
  if (t(raw.file_no, 40)) fields.file_no = t(raw.file_no, 40);
  if (t(raw.referred_by, 120)) fields.referred_by = t(raw.referred_by, 120);
  const dx = t(raw.diagnosis, 40).toLowerCase();
  if (div.diagnoses.some(([k]) => k === dx)) fields.diagnosis = dx;
  if (t(raw.diagnosis_detail, 300)) fields.diagnosis_detail = t(raw.diagnosis_detail, 300);
  if (divisionId === 'audiology') {
    const ear = t(raw.ear, 10).toLowerCase();
    if (EARS.some(([k]) => k === ear)) fields.ear = ear;
    const degree = t(raw.degree, 20).toLowerCase().replace(/[\s-]+/g, '_').replace('moderately_severe', 'mod_severe');
    if (DEGREES.some(([k]) => k === degree)) fields.degree = degree;
  }
  return {
    fields,
    complaint: t(raw.complaint, 300),
    languages: t(raw.languages, 120),
    findings: list(raw.findings),
    tests: list(raw.test_results),
  };
}

// Patients who may be the same person (same phone, or same name), so no duplicate is created.
async function possibleMatches(ctx, fields) {
  const where = [];
  const args = [];
  if (fields.phone) { where.push("substr(replace(replace(p.phone, ' ', ''), '-', ''), -10) = ?"); args.push(fields.phone.slice(-10)); }
  if (fields.name) { where.push('lower(trim(p.name)) = lower(?)'); args.push(fields.name); }
  if (!where.length) return [];
  const scope = clinicScope(ctx.user);
  const { results } = await ctx.db.prepare(
    `SELECT p.id, p.name, p.reg_no, p.phone, p.division, p.diagnosis FROM clin_patients p
      WHERE (${where.join(' OR ')})${scope ? ' AND (p.clinic_id = ? OR p.clinic_id IS NULL)' : ''} ORDER BY p.updated_at DESC LIMIT 4`,
  ).bind(...args, ...(scope ? [scope] : [])).all();
  return results;
}

async function aiRead(ctx) {
  const body = await readJson(ctx.request);
  const divisionId = body.division;
  if (!DIVISIONS[divisionId]) throw new HttpError(400, 'Choose a division.');
  const docs = Array.isArray(body.documents) ? body.documents.slice(0, 10) : [];
  const content = [{ type: 'text', text: `${divisionGuide(divisionId)}\nRead these documents and fill in the details.` }];
  let images = 0;
  let textChars = 0;
  docs.forEach((doc, i) => {
    const name = String(doc?.name || `Document ${i + 1}`).slice(0, 120);
    const text = String(doc?.text || '').slice(0, Math.max(0, MAX_TEXT_CHARS - textChars));
    textChars += text.length;
    content.push({ type: 'text', text: `--- Document ${i + 1}: ${name} ---${text ? `\n${text}` : ''}` });
    for (const url of Array.isArray(doc?.images) ? doc.images : []) {
      if (images >= MAX_IMAGES) break;
      if (typeof url !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(url) || url.length > MAX_IMAGE_CHARS) continue;
      content.push({ type: 'image_url', image_url: { url } });
      images += 1;
    }
  });
  if (!images && !textChars) throw new HttpError(400, 'Nothing readable was found in these files.');
  const message = images ? content : content.map((part) => part.text).join('\n\n'); // text-only: one plain message

  const raw = ctx.env.AI_MOCK === '1' ? mockRead(divisionId) : await runModel(ctx.env, { system: READ_SYSTEM, content: message, schema: READ_SCHEMA, maxTokens: 1400 });
  const result = cleanRead(divisionId, raw);
  const matches = await possibleMatches(ctx, result.fields);
  await audit(ctx, 'clinical.ai.read', 'ai', null, { division: divisionId, documents: docs.length, images, model: MODEL });
  return json({ ...result, matches });
}

// ---------- 2. drafting report sections ----------

const REPORT_SYSTEM = `You are a senior audiologist and speech-language pathologist in India (RCI registered) writing parts of a clinical evaluation report for Sri Rudra Speech & Hearing Clinic, Visakhapatnam.
Write formal, concise clinical English in the third person, as in Indian hospital reports.
Base every statement only on the information provided. Never invent test scores, dates, names, history or findings. If something needed is missing, say it was not recorded or recommend obtaining it.
Use standard terminology where it applies: GRBAS, CAPE-V, MPD, s/z ratio, SSI-4, WAB, IDDSI, FOIS, Clark (1981) degrees of hearing loss.
Paragraph sections: two to five sentences. List sections: one specific, practical item per entry (type and frequency of therapy, referrals, reviews, home measures), without numbering.
Reply with JSON only.`;

function patientSummary(patient, today) {
  const div = DIVISIONS[patient.division];
  return [
    `Division: ${div.label}`,
    `Diagnosis on record: ${labelOf(div.diagnoses, patient.diagnosis)}${patient.diagnosis_detail ? ` (${patient.diagnosis_detail})` : ''}`,
    ageText(patient, today) && `Age: ${ageText(patient, today)}`,
    patient.sex && `Sex: ${labelOf(SEXES, patient.sex)}`,
    patient.division === 'audiology' && (patient.ear || patient.degree) && `Hearing on record: ${[labelOf(EARS, patient.ear), labelOf(DEGREES, patient.degree)].filter(Boolean).join(', ')}`,
    patient.referred_by && `Referred by: ${patient.referred_by}`,
    patient.notes && `Clinician notes: ${patient.notes}`,
  ].filter(Boolean).join('\n');
}

async function recordContext(ctx, patient) {
  const [files, entries] = await ctx.db.batch([
    ctx.db.prepare('SELECT file_name, ai_summary FROM clin_files WHERE patient_id = ? AND ai_summary IS NOT NULL ORDER BY id DESC LIMIT 6').bind(patient.id),
    ctx.db.prepare("SELECT entry_date, kind, title, body FROM clin_entries WHERE patient_id = ? AND kind <> 'stage' ORDER BY entry_date DESC, id DESC LIMIT 10").bind(patient.id),
  ]).catch(() => [{ results: [] }, { results: [] }]);
  const parts = [];
  if (files.results.length) parts.push(`From uploaded records:\n${files.results.map((f) => `- ${f.file_name}: ${f.ai_summary}`).join('\n')}`);
  if (entries.results.length) parts.push(`Recent record entries:\n${entries.results.map((e) => `- ${e.entry_date} ${e.kind}: ${[e.title, e.body].filter(Boolean).join(' – ')}`).join('\n')}`);
  return parts.join('\n\n');
}

async function aiReport(ctx, id) {
  const { row, patient } = await loadReport(ctx, id);
  if (row.status === 'final') throw new HttpError(409, 'This report is final. Reopen it to change it.');
  const tpl = template(row.template);
  const body = await readJson(ctx.request);
  const allowed = aiSectionKeys(tpl);
  const keys = (Array.isArray(body.sections) && body.sections.length ? body.sections : allowed).filter((k) => allowed.includes(k));
  if (!keys.length) throw new HttpError(400, 'Choose a section the AI can draft.');
  const data = cleanReportData(tpl, body.data || parseJson(row.data_json, {}));
  const today = indiaToday();
  const sections = keys.map((k) => tpl.sections.find((s) => s.key === k));
  const schema = {
    type: 'object',
    properties: Object.fromEntries(sections.map((s) => [s.key, s.kind === 'list' ? { type: 'array', items: { type: 'string' } } : { type: 'string' }])),
    required: keys,
  };
  const want = sections.map((s) => `- ${s.key}: "${s.title}" (${s.kind === 'list' ? 'list of items' : 'paragraph'})${s.hint ? ` – ${s.hint}` : ''}`).join('\n');
  const content = `Report: ${tpl.title}\n\nPatient\n${patientSummary(patient, today)}\n\nWhat the clinician has entered so far:\n${reportAsText(tpl, data) || '(nothing yet)'}\n\n${await recordContext(ctx, patient)}\n\nDraft these sections:\n${want}`;

  const raw = ctx.env.AI_MOCK === '1' ? mockReport(sections) : await runModel(ctx.env, { system: REPORT_SYSTEM, content, schema, maxTokens: 2200 });
  const drafts = {};
  for (const s of sections) {
    const v = raw[s.key];
    if (s.kind === 'list') {
      const items = (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => String(x).replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean).slice(0, 15);
      if (items.length) drafts[s.key] = items;
    } else if (String(v || '').trim()) {
      drafts[s.key] = String(v).trim().slice(0, 4000);
    }
  }
  await ctx.db.prepare('UPDATE clin_reports SET ai_used = 1 WHERE id = ?').bind(row.id).run();
  await audit(ctx, 'clinical.ai.report', 'clin_reports', row.id, { patient: patient.id, sections: Object.keys(drafts), model: MODEL });
  return json({ drafts });
}

// ---------- 3. drafting a therapy plan ----------

const PLAN_SYSTEM = `You are a senior speech-language pathologist and audiologist in India planning evidence-based therapy for one patient at Sri Rudra Speech & Hearing Clinic, Visakhapatnam.
Plans are practical, measurable and suited to an Indian clinic. Use the patient's languages for stimuli (for example Telugu, Hindi, Odia or English words and phrases).
Base the plan only on the information provided; never invent test scores or history.
Use established approaches suited to the diagnosis, for example: vocal hygiene, semi-occluded vocal tract exercises, resonant voice therapy and vocal function exercises for voice; fluency shaping and stuttering modification for stuttering; auditory training, hearing-aid orientation and communication strategies for hearing loss; naming, semantic feature analysis and functional communication for aphasia; oral motor, compensatory strategies, swallowing exercises and IDDSI diet levels for dysphagia; play-based, parent-mediated language stimulation for children.
Reply with JSON only.`;

const OUTLINE_SCHEMA = (n) => ({
  type: 'object',
  properties: {
    framework_intro: { type: 'string' },
    framework_points: { type: 'array', items: { type: 'string' } },
    long_term_goals: { type: 'array', items: { type: 'string' } },
    session_structure: { type: 'array', items: { type: 'string' } },
    home_practice_note: { type: 'string' },
    session_titles: { type: 'array', items: { type: 'string' }, minItems: n, maxItems: n },
    discharge_criteria: { type: 'array', items: { type: 'string' } },
    if_not_met: { type: 'string' },
    progress_measures: { type: 'array', items: { type: 'string' } },
    home_card: { type: 'array', items: { type: 'string' } },
  },
  required: ['framework_intro', 'framework_points', 'long_term_goals', 'session_structure', 'session_titles', 'discharge_criteria', 'progress_measures', 'home_card'],
});

const SESSIONS_SCHEMA = {
  type: 'object',
  properties: {
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' }, title: { type: 'string' },
          goals: { type: 'array', items: { type: 'string' } },
          baseline: { type: 'array', items: { type: 'string' } },
          activities: { type: 'array', items: { type: 'string' } },
          home_practice: { type: 'array', items: { type: 'string' } },
        },
        required: ['n', 'title', 'goals', 'baseline', 'activities', 'home_practice'],
      },
    },
  },
  required: ['sessions'],
};

async function planContext(ctx, row, patient) {
  const today = indiaToday();
  const parts = [`Patient\n${patientSummary(patient, today)}`];
  if (row.report_id) {
    const report = await ctx.db.prepare('SELECT template, data_json FROM clin_reports WHERE id = ?').bind(row.report_id).first();
    const tpl = report && template(report.template);
    if (tpl) parts.push(`Evaluation report (${tpl.title}):\n${reportAsText(tpl, cleanReportData(tpl, parseJson(report.data_json, {})))}`);
  }
  const record = await recordContext(ctx, patient);
  if (record) parts.push(record);
  const sched = [`${row.sessions_count} sessions`, row.minutes && `${row.minutes} minutes each`, row.per_week && `${frequencyText(row.per_week)} for ${weeksFor(row.sessions_count, row.per_week)} weeks`].filter(Boolean).join(', ');
  parts.push(`Plan: ${row.title}. ${sched}. Progress is measured at sessions ${checkpoints(row.sessions_count).join(', ')}.`);
  if (row.focus) parts.push(`Clinician's instructions for this plan: ${row.focus}`);
  return parts.join('\n\n');
}

async function aiPlan(ctx, id) {
  const { row, patient } = await loadPlan(ctx, id);
  const body = await readJson(ctx.request);
  const n = row.sessions_count;
  const plan = cleanPlan(parseJson(row.plan_json, {}), n);
  const context = await planContext(ctx, row, patient);

  if (body.part === 'outline') {
    const ask = `${context}\n\nWrite the plan outline:\n- framework_intro: one line introducing the approach; framework_points: 3–6 components of the programme.\n- long_term_goals: 3–6 measurable goals for the end of the plan.\n- session_structure: 4–6 timed parts of each session that add up to ${row.minutes || 45} minutes (e.g. "Warm-up and review – 5 minutes"); home_practice_note: one line.\n- session_titles: exactly ${n} short titles, progressing from education and baseline to independence and review.\n- discharge_criteria: 3–6 measurable criteria; if_not_met: what to do if they are not met.\n- progress_measures: 4–8 outcome measures to record at the checkpoints.\n- home_card: 4–8 short daily instructions in plain words for the patient.`;
    const raw = ctx.env.AI_MOCK === '1' ? mockOutline(n) : await runModel(ctx.env, { system: PLAN_SYSTEM, content: ask, schema: OUTLINE_SCHEMA(n), maxTokens: 2400 });
    const titles = Array.isArray(raw.session_titles) ? raw.session_titles : [];
    const next = cleanPlan({
      ...plan,
      framework: { intro: raw.framework_intro, points: raw.framework_points },
      goals: raw.long_term_goals,
      structure: { items: raw.session_structure, home_note: raw.home_practice_note },
      sessions: plan.sessions.map((s, i) => ({ ...s, title: s.title || titles[i] || '' })),
      discharge: { criteria: raw.discharge_criteria, otherwise: raw.if_not_met },
      measures: raw.progress_measures,
      home_card: raw.home_card,
    }, n);
    return savePlanDraft(ctx, row, patient, next, 'outline');
  }

  if (body.part === 'sessions') {
    const from = Math.max(1, Number.parseInt(body.from, 10) || 1);
    const to = Math.min(n, Number.parseInt(body.to, 10) || from, from + 3);
    const outline = [
      plan.goals.length && `Long-term goals:\n${plan.goals.map((g) => `- ${g}`).join('\n')}`,
      plan.structure.items.length && `Session structure:\n${plan.structure.items.map((g) => `- ${g}`).join('\n')}`,
      `Session titles:\n${plan.sessions.map((s) => `${s.n}. ${s.title || '(not set)'}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');
    const ask = `${context}\n\n${outline}\n\nWrite sessions ${from} to ${to} in full. For each session: n and title; goals (1–3, measurable); baseline (1–3 measures to record at the start); activities (3–8, each saying what to do, with cues and dosage; a line may start with "– " for a sub-point); home_practice (1–3 items).`;
    const raw = ctx.env.AI_MOCK === '1' ? mockSessions(from, to) : await runModel(ctx.env, { system: PLAN_SYSTEM, content: ask, schema: SESSIONS_SCHEMA, maxTokens: 3000 });
    const got = Array.isArray(raw.sessions) ? raw.sessions : [];
    const sessions = plan.sessions.map((s) => {
      if (s.n < from || s.n > to) return s;
      const g = got.find((x) => Number(x?.n) === s.n) || got[s.n - from];
      if (!g) return s;
      return { n: s.n, title: s.title || g.title, goals: g.goals, baseline: g.baseline, activities: g.activities, home: g.home_practice || g.home };
    });
    return savePlanDraft(ctx, row, patient, cleanPlan({ ...plan, sessions }, n), `sessions ${from}-${to}`);
  }

  throw new HttpError(400, 'Ask for the outline or a batch of sessions.');
}

async function savePlanDraft(ctx, row, patient, plan, part) {
  await ctx.db.prepare('UPDATE clin_plans SET plan_json = ?, ai_used = 1, updated_at = ? WHERE id = ?').bind(JSON.stringify(plan), nowSql(), row.id).run();
  await audit(ctx, 'clinical.ai.plan', 'clin_plans', row.id, { patient: patient.id, part, model: MODEL });
  const fresh = await ctx.db.prepare('SELECT * FROM clin_plans WHERE id = ?').bind(row.id).first();
  return json({ plan: planRow(fresh) });
}

// ---------- sample answers for local development (AI_MOCK=1) ----------

function mockRead(divisionId) {
  const audiology = divisionId === 'audiology';
  return {
    name: 'Mr. Test Patient One', age_years: '55', dob: '', sex: 'M', phone: '+91 90000 11111', file_no: 'OP-12345',
    referred_by: 'Dr. Sample (ENT)', languages: 'Telugu, English',
    diagnosis: audiology ? 'snhl' : 'voice', diagnosis_detail: audiology ? 'Bilateral moderate SNHL' : 'Bilateral vocal nodules',
    ear: audiology ? 'both' : '', degree: audiology ? 'moderate' : '', complaint: audiology ? 'Reduced hearing, both ears' : 'Hoarseness of voice',
    findings: ['Sample finding one (mock)', 'Sample finding two (mock)'],
    test_results: audiology ? ['PTA right 48 dB HL (mock)', 'Tympanogram A type both ears (mock)'] : ['MPD /a/ 8 s (mock)'],
  };
}

function mockReport(sections) {
  return Object.fromEntries(sections.map((s) => [s.key, s.kind === 'list'
    ? [`Sample AI draft item one for ${s.title.toLowerCase()} (mock).`, 'Sample AI draft item two (mock).']
    : `Sample AI draft for ${s.title.toLowerCase()} (mock). The clinician reviews and edits this text before saving.`]));
}

function mockOutline(n) {
  return {
    framework_intro: 'An eclectic programme is recommended (mock):',
    framework_points: ['Education and hygiene (mock)', 'Core exercises (mock)', 'Carry-over to daily speaking (mock)'],
    long_term_goals: ['Measurable goal one (mock)', 'Measurable goal two (mock)', 'Measurable goal three (mock)'],
    session_structure: ['Check-in and review – 5 minutes', 'Core exercises – 25 minutes', 'Carry-over – 10 minutes', 'Home practice – 5 minutes'],
    home_practice_note: 'Daily home practice, 10 minutes twice a day (mock).',
    session_titles: Array.from({ length: n }, (_, i) => `Session focus ${i + 1} (mock)`),
    discharge_criteria: ['Criterion one (mock)', 'Criterion two (mock)'],
    if_not_met: 'Review with the ENT and extend therapy (mock).',
    progress_measures: ['Measure A (mock)', 'Measure B (mock)', 'Measure C (mock)'],
    home_card: ['Drink water through the day (mock)', 'Practise the exercises twice daily (mock)'],
  };
}

function mockSessions(from, to) {
  const sessions = [];
  for (let n = from; n <= to; n += 1) {
    sessions.push({
      n, title: `Session focus ${n} (mock)`,
      goals: [`Goal for session ${n} (mock)`],
      baseline: [`Baseline measure for session ${n} (mock)`],
      activities: ['Activity one with cues and dosage (mock)', '– sub-point (mock)', 'Activity two (mock)'],
      home_practice: ['Home practice item (mock)'],
    });
  }
  return { sessions };
}

export const AI_ROUTES = [
  ['POST', /^\/ai\/read$/, aiRead],
  ['POST', /^\/reports\/(\d+)\/ai$/, aiReport],
  ['POST', /^\/plans\/(\d+)\/ai$/, aiPlan],
];
