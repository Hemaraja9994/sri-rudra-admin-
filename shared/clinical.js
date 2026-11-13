// Clinical vocabulary and rules for the Audiology and Speech-Language Pathology divisions.
// Used by the Cloudflare Worker (worker/clinical.js) and the clinician dashboard (clinical/src).
// Plain JavaScript with no imports, so it also runs under `node --test`.

export const DIVISIONS = {
  audiology: {
    id: 'audiology',
    label: 'Audiology',
    short: 'AUD',
    diagnoses: [
      ['normal', 'Normal hearing'],
      ['conductive', 'Conductive hearing loss'],
      ['snhl', 'Sensorineural hearing loss'],
      ['mixed', 'Mixed hearing loss'],
      ['ansd', 'Auditory neuropathy spectrum disorder'],
      ['apd', 'Auditory processing disorder'],
      ['tinnitus', 'Tinnitus / hyperacusis'],
      ['vestibular', 'Vestibular / balance disorder'],
      ['implant', 'Implant candidate or user (CI, BAHA)'],
      ['other', 'Other / not yet diagnosed'],
    ],
    stages: [
      ['assessment', 'Assessment'],
      ['hat', 'HA trial (HAT)'],
      ['fitting', 'Fitting & verification'],
      ['rehab', 'Aural rehabilitation'],
      ['follow_up', 'Follow-up'],
      ['discharged', 'Discharged'],
    ],
  },
  slp: {
    id: 'slp',
    label: 'Speech-Language Pathology',
    short: 'SLP',
    diagnoses: [
      ['speech_sound', 'Speech sound disorder'],
      ['fluency', 'Fluency (stuttering / cluttering)'],
      ['voice', 'Voice disorder'],
      ['child_language', 'Child language disorder / delay'],
      ['autism', 'Autism / social communication'],
      ['adult_language', 'Aphasia / adult language'],
      ['motor_speech', 'Motor speech (dysarthria / apraxia)'],
      ['dysphagia', 'Dysphagia'],
      ['resonance', 'Cleft / resonance'],
      ['hearing_impaired', 'Speech & language with hearing loss'],
      ['cognitive', 'Cognitive-communication'],
      ['other', 'Other / not yet diagnosed'],
    ],
    stages: [
      ['assessment', 'Assessment'],
      ['therapy', 'Active therapy'],
      ['home_programme', 'Home programme'],
      ['review', 'Review'],
      ['discharged', 'Discharged'],
    ],
  },
};
export const DIVISION_IDS = Object.keys(DIVISIONS);

// Degree of hearing loss (Clark, 1981), as used on Indian audiology reports.
export const DEGREES = [
  ['normal', 'Normal (≤15 dB HL)'],
  ['minimal', 'Minimal (16–25 dB HL)'],
  ['mild', 'Mild (26–40 dB HL)'],
  ['moderate', 'Moderate (41–55 dB HL)'],
  ['mod_severe', 'Moderately severe (56–70 dB HL)'],
  ['severe', 'Severe (71–90 dB HL)'],
  ['profound', 'Profound (>90 dB HL)'],
];
export const EARS = [['both', 'Both ears'], ['right', 'Right ear'], ['left', 'Left ear']];
export const SEXES = [['female', 'Female'], ['male', 'Male'], ['other', 'Other']];
export const PRIORITIES = [['routine', 'Routine'], ['high', 'High'], ['urgent', 'Urgent']];
export const AGE_GROUPS = [
  ['child', 'Children (0–17)'],
  ['adult', 'Adults (18–59)'],
  ['older', 'Older adults (60+)'],
  ['unknown', 'Age not recorded'],
];
// Kinds of timeline entries staff can add. 'stage' is written by the server when the stage changes.
export const ENTRY_KINDS = [
  ['session', 'Session / visit'],
  ['test', 'Test or assessment'],
  ['plan', 'Goals / plan'],
  ['note', 'Note'],
];
export const GROUPINGS = [
  ['stage', 'Care stage'],
  ['diagnosis', 'Diagnosis'],
  ['age', 'Age group'],
  ['priority', 'Priority & reviews'],
];

export function labelOf(list, id) {
  const hit = list.find(([value]) => value === id);
  return hit ? hit[1] : id || '';
}

export function division(id) {
  return DIVISIONS[id] || null;
}

// ---------- dates ----------

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 864e5);
}

// India date (UTC+5:30); Cloudflare runs on UTC.
export function indiaToday(now = Date.now()) {
  return new Date(now + 330 * 60000).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function prettyDate(iso, withYear = true) {
  if (!isIsoDate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ''}`;
}

// ---------- age ----------

export function ageFrom({ dob, age_years: ageYears }, today) {
  if (isIsoDate(dob)) {
    const [y, m, d] = dob.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    let age = ty - y;
    if (tm < m || (tm === m && td < d)) age -= 1;
    return age >= 0 ? age : null;
  }
  const n = Number(ageYears);
  return ageYears === null || ageYears === undefined || ageYears === '' || !Number.isFinite(n) ? null : n;
}

export function ageGroup(age) {
  if (age === null || age === undefined) return 'unknown';
  if (age < 18) return 'child';
  if (age < 60) return 'adult';
  return 'older';
}

export function ageLabel(patient, today) {
  const age = ageFrom(patient, today);
  if (age === null) return '';
  if (age < 2 && isIsoDate(patient.dob)) {
    const months = Math.max(0, Math.floor(daysBetween(patient.dob, today) / 30.44));
    return `${months} mo`;
  }
  return `${age} y`;
}

// ---------- reviews and priority ----------

export function reviewBucket(nextReview, today) {
  if (!nextReview) return 'none';
  if (nextReview < today) return 'overdue';
  if (nextReview === today) return 'today';
  if (nextReview <= addDays(today, 7)) return 'week';
  return 'later';
}

export function reviewLabel(nextReview, today) {
  if (!nextReview) return 'No review date';
  const diff = daysBetween(today, nextReview);
  if (diff < 0) return `Overdue by ${-diff} ${diff === -1 ? 'day' : 'days'}`;
  if (diff === 0) return 'Review today';
  if (diff === 1) return 'Review tomorrow';
  return `Review ${prettyDate(nextReview, nextReview.slice(0, 4) !== today.slice(0, 4))}`;
}

// Which "priority & reviews" lane a patient belongs to: overdue first, then urgent, due soon, high, routine.
export function priorityLane(patient, today) {
  const bucket = reviewBucket(patient.next_review, today);
  if (patient.status === 'active' && bucket === 'overdue') return 'overdue';
  if (patient.priority === 'urgent') return 'urgent';
  if (bucket === 'today' || bucket === 'week') return 'due';
  if (patient.priority === 'high') return 'high';
  return 'routine';
}
export const PRIORITY_LANES = [
  ['overdue', 'Overdue reviews'],
  ['urgent', 'Urgent'],
  ['due', 'Review due this week'],
  ['high', 'High priority'],
  ['routine', 'Routine'],
];

// ---------- grouping (segregating the caseload) ----------

export function groupPatients(patients, grouping, divisionId, today) {
  const div = division(divisionId);
  let lanes;
  let keyOf;
  if (grouping === 'diagnosis') {
    lanes = div.diagnoses;
    keyOf = (p) => p.diagnosis;
  } else if (grouping === 'age') {
    lanes = AGE_GROUPS;
    keyOf = (p) => ageGroup(ageFrom(p, today));
  } else if (grouping === 'priority') {
    lanes = PRIORITY_LANES;
    keyOf = (p) => priorityLane(p, today);
  } else {
    lanes = div.stages;
    keyOf = (p) => p.stage;
  }
  const groups = lanes.map(([id, label]) => ({ id, label, patients: [] }));
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  for (const p of patients) {
    const g = byId[keyOf(p)] || byId.other || byId.unknown;
    if (g) g.patients.push(p);
  }
  for (const g of groups) g.patients.sort((a, b) => sortForQueue(a, b, today));
  return groups;
}

// Soonest review first; patients without a review date last, newest first.
export function sortForQueue(a, b, today) {
  const ra = a.next_review || '9999-12-31';
  const rb = b.next_review || '9999-12-31';
  if (ra !== rb) return ra < rb ? -1 : 1;
  const pa = PRIORITY_RANK[a.priority] ?? 3;
  const pb = PRIORITY_RANK[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}
const PRIORITY_RANK = { urgent: 0, high: 1, routine: 2 };

export function summarize(patients, today) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const active = patients.filter((p) => p.status === 'active');
  return {
    active: active.length,
    newThisMonth: patients.filter((p) => String(p.created_at || '').slice(0, 10) >= monthStart).length,
    dueThisWeek: active.filter((p) => ['today', 'week'].includes(reviewBucket(p.next_review, today))).length,
    overdue: active.filter((p) => reviewBucket(p.next_review, today) === 'overdue').length,
    highPriority: active.filter((p) => p.priority === 'high' || p.priority === 'urgent').length,
  };
}

// ---------- phone ----------

export function cleanPhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

// ---------- checking what staff type in ----------

function clean(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function pick(list, value, fallback, what) {
  const v = value === undefined || value === null || value === '' ? fallback : value;
  if (v === null) return null;
  if (!list.some(([id]) => id === v)) throw new Error(`Choose a valid ${what}.`);
  return v;
}

export function normalizePatient(input = {}) {
  const div = division(input.division);
  if (!div) throw new Error('Choose Audiology or Speech-Language Pathology.');
  const name = clean(input.name, 120);
  if (!name) throw new Error('Enter the patient’s name.');
  const phone = cleanPhone(input.phone);
  if (phone && (phone.length < 6 || phone.length > 15)) throw new Error('The phone number looks wrong.');
  const dob = input.dob ? String(input.dob) : null;
  if (dob && !isIsoDate(dob)) throw new Error('Pick a valid date of birth.');
  let ageYears = null;
  if (input.age_years !== undefined && input.age_years !== null && input.age_years !== '') {
    ageYears = Number(input.age_years);
    if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120) throw new Error('Enter the age in whole years (0–120).');
  }
  const nextReview = input.next_review ? String(input.next_review) : null;
  if (nextReview && !isIsoDate(nextReview)) throw new Error('Pick a valid review date.');
  const clinicId = input.clinic_id === undefined || input.clinic_id === null || input.clinic_id === '' ? null : Number(input.clinic_id);
  if (clinicId !== null && (!Number.isInteger(clinicId) || clinicId <= 0)) throw new Error('Choose a valid clinic.');
  const stage = pick(div.stages, input.stage, div.stages[0][0], 'care stage');
  const isAudiology = div.id === 'audiology';
  return {
    division: div.id,
    name,
    phone: phone || null,
    sex: pick(SEXES, input.sex, null, 'sex'),
    dob,
    age_years: dob ? null : ageYears,
    file_no: clean(input.file_no, 40),
    clinic_id: clinicId,
    diagnosis: pick(div.diagnoses, input.diagnosis, 'other', 'diagnosis'),
    diagnosis_detail: clean(input.diagnosis_detail, 300),
    ear: isAudiology ? pick(EARS, input.ear, null, 'ear') : null,
    degree: isAudiology ? pick(DEGREES, input.degree, null, 'degree of hearing loss') : null,
    stage,
    priority: pick(PRIORITIES, input.priority, 'routine', 'priority'),
    next_review: nextReview,
    referred_by: clean(input.referred_by, 120),
    clinician: clean(input.clinician, 120),
    notes: clean(input.notes, 3000),
    status: stage === 'discharged' ? 'discharged' : 'active',
  };
}

export function normalizeEntry(input = {}) {
  const kind = pick(ENTRY_KINDS, input.kind, 'session', 'entry type');
  const entryDate = input.entry_date ? String(input.entry_date) : null;
  if (!entryDate || !isIsoDate(entryDate)) throw new Error('Pick the date of this entry.');
  const title = clean(input.title, 160);
  const body = clean(input.body, 4000);
  if (!title && !body) throw new Error('Write what was done or observed.');
  return { kind, entry_date: entryDate, title, body };
}

export function regNo(divisionId, id, createdAt) {
  const div = division(divisionId);
  const year = String(createdAt || '').slice(0, 4) || new Date().getUTCFullYear();
  return `${div ? div.short : 'PT'}-${year}-${String(id).padStart(4, '0')}`;
}

export function stageNote(divisionId, from, to) {
  const div = division(divisionId);
  const name = (id) => labelOf(div.stages, id);
  return from ? `Moved from ${name(from)} to ${name(to)}` : `Registered at ${name(to)}`;
}

// ---------- export ----------

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function patientsToCsv(patients, divisionId, today) {
  const div = division(divisionId);
  const header = ['Reg. no', 'Name', 'Phone', 'Age', 'Sex', 'Diagnosis', 'Details', 'Care stage', 'Priority', 'Next review', 'Clinician', 'Referred by', 'Status'];
  if (div.id === 'audiology') header.splice(7, 0, 'Ear', 'Degree');
  const lines = [header.join(',')];
  for (const p of patients) {
    const row = [
      p.reg_no, p.name, p.phone, ageLabel(p, today), labelOf(SEXES, p.sex), labelOf(div.diagnoses, p.diagnosis), p.diagnosis_detail,
      labelOf(div.stages, p.stage), labelOf(PRIORITIES, p.priority), p.next_review, p.clinician, p.referred_by, p.status,
    ];
    if (div.id === 'audiology') row.splice(7, 0, labelOf(EARS, p.ear), labelOf(DEGREES, p.degree));
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}
