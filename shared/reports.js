// Diagnostic report templates for the Audiology and SLP dashboards, modelled on the clinic's own
// voice evaluation report (letterhead, file number, validity, sections, tables, recommendations).
// Plain JavaScript with no imports from the browser or Workers, so it also runs under `node --test`.
//
// A template is a list of sections. Section kinds:
//   fields     label/value rows                          data[key] = { fieldKey: text }
//   table      fixed row labels x columns               data[key] = [[cell, cell], ...]  (one array per row)
//   freetable  clinician adds rows (first column typed)  data[key] = [[cell, cell, ...], ...]
//   audiogram  pure-tone thresholds, PTA worked out      data[key] = { ac_r: {250: '20', ...}, ... }
//   narrative  paragraph text (AI can draft)             data[key] = 'text'
//   list       one item per line (AI can draft)          data[key] = ['item', ...]

import { DEGREES, addDays, isIsoDate, labelOf } from './clinical.js';

// Letterhead, exactly as on the clinic's printed reports.
export const CLINIC = {
  name: 'Sri Rudra Speech & Hearing Clinic',
  services: ['Audiology', 'Hearing Aids', 'Speech-Language Pathology', 'Voice Therapy'],
  address: ['Flat No. 211 & 212, HIG-207/4, Second Floor, Bhavana Heights,', 'Beside Kotak Mahindra Bank, MVP Double Road, Visakhapatnam – 530017'],
  web: 'www.srirudraspeechandhearing.com',
  phone: '+91 70320 54275',
  hours: 'Mon–Sat 10 AM–9 PM',
  short: 'Sri Rudra Clinic',
  prefix: 'SRC',
};

// ---------- sections shared by every template ----------

export const CASE_FIELDS = [
  ['name', 'Case name'],
  ['age_gender', 'Age / Gender'],
  ['hospital_mr', 'Hospital / MR No.'],
  ['contact', 'Residence / Contact'],
  ['eval_date', 'Date of evaluation'],
  ['languages', 'Languages'],
];

const referral = { key: 'referral', title: 'Referral information', kind: 'fields', fields: [['source', 'Referral source'], ['informant', 'Informant'], ['reason', 'Reason for referral', 'textarea']] };
const background = { key: 'background', title: 'Background information', kind: 'narrative', ai: true, hint: 'Who the patient is, why they came, and the history in two or three sentences.' };
const complaints = { key: 'complaints', title: 'Brief complaint', kind: 'list', ai: true, hint: 'One complaint per line.' };
const diagnosis = { key: 'diagnosis', title: 'Provisional diagnosis', kind: 'narrative', ai: true };
const recommendations = { key: 'recommendations', title: 'Recommendations', kind: 'list', numbered: true, ai: true, hint: 'One recommendation per line.' };
const RL = ['Right', 'Left'];

// ---------- the templates ----------

export const TEMPLATES = [
  {
    id: 'aud_eval',
    division: 'audiology',
    code: 'AUD',
    name: 'Audiological evaluation',
    title: 'Audiological Evaluation Report',
    headerDate: 'Date of testing',
    sections: [
      referral,
      background,
      complaints,
      { key: 'history', title: 'Case history', kind: 'fields', fields: [
        ['onset', 'Onset'], ['duration', 'Duration'], ['ears', 'Ear(s) affected'], ['tinnitus', 'Tinnitus'],
        ['vertigo', 'Vertigo / imbalance'], ['discharge', 'Ear discharge / pain'], ['noise', 'Noise exposure'],
        ['family', 'Family history'], ['medical', 'Medical history'], ['aids', 'Hearing aid use'],
      ] },
      { key: 'otoscopy', title: 'Otoscopic examination', kind: 'table', columns: ['Findings'], rows: ['Right ear', 'Left ear'] },
      { key: 'pta', title: 'Pure-tone audiometry', kind: 'audiogram', hint: 'Thresholds in dB HL. PTA is the average of 500, 1000, 2000 and 4000 Hz; degree follows Clark (1981).' },
      { key: 'pta_notes', title: 'Audiogram interpretation', kind: 'narrative', ai: true, hint: 'Type and degree of loss per ear, configuration, masking used.' },
      { key: 'speech', title: 'Speech audiometry', kind: 'table', columns: RL, rows: ['SRT (dB HL)', 'SDS (%) and level', 'MCL (dB HL)', 'UCL (dB HL)'] },
      { key: 'immittance', title: 'Immittance audiometry', kind: 'table', columns: RL, rows: ['Tympanogram type', 'Peak pressure (daPa)', 'Static compliance (ml)', 'Ear canal volume (ml)', 'Ipsilateral reflexes', 'Contralateral reflexes'] },
      { key: 'special', title: 'Special tests', kind: 'table', columns: [...RL, 'Remarks'], rows: ['OAE (DPOAE / TEOAE)', 'ABR', 'ASSR', 'Tuning fork (Rinne / Weber)', 'Tinnitus evaluation'] },
      { key: 'impression', title: 'Audiological impression', kind: 'narrative', ai: true },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_voice',
    division: 'slp',
    code: 'VT',
    name: 'Voice evaluation',
    title: 'Voice Evaluation Report',
    headerDate: 'Date of ENT examination',
    sections: [
      referral,
      background,
      complaints,
      { key: 'history', title: 'Brief history', kind: 'fields', fields: [
        ['onset', 'Onset of the problem'], ['nature', 'Nature of the problem'], ['noticed', 'When the problem was first noticed'],
        ['pain', 'Throat pain while speaking / swallowing'], ['day_change', 'Voice change during the day'], ['neck', 'Pain in the neck'],
        ['emotion', 'Voice change during emotional overlay'], ['occupation', 'Occupation and daily vocal load'],
      ] },
      { key: 'medical', title: 'Medical history and findings', kind: 'narrative', ai: true },
      { key: 'habits', title: 'Vocal and non-vocal habits', kind: 'table', columns: ['Status'], rows: [
        'Talking in a noisy environment', 'Excessive speaking', 'Shouting / screaming / yelling', 'Coughing', 'Whispering',
        'Clearing throat', 'Caffeine consumption', 'Amount of water intake', 'Intake of spicy food / skipping meals', 'Smoking / passive smoking / alcohol',
      ] },
      { key: 'larynx', title: 'Laryngological findings', kind: 'table', columns: ['Finding as recorded'], rows: [
        'Vocal fold mobility', 'False vocal folds', 'Mucosal lesions', 'Glottic closure', 'Arytenoid position', 'ENT impression',
      ] },
      { key: 'larynx_reading', title: 'Clinical reading for therapy', kind: 'narrative', ai: true },
      { key: 'profile', title: 'Voice profile', kind: 'table', columns: ['Observation'], rows: ['Pitch', 'Loudness', 'Quality', 'Pitch breaks', 'Voice breaks', 'Vocal fatigue'] },
      { key: 'grbas', title: 'Perceptual evaluation (GRBAS)', kind: 'table', columns: ['Score (0–3)', 'Comment'], rows: ['G  Grade', 'R  Roughness', 'B  Breathiness', 'A  Asthenia', 'S  Strain'] },
      { key: 'capev', title: 'CAPE-V', kind: 'table', columns: ['mm (0–100)', 'Consistent / intermittent', 'Note'], rows: ['Overall severity', 'Roughness', 'Breathiness', 'Strain', 'Pitch', 'Loudness', 'Resonance'] },
      { key: 'measures', title: 'Clinical voice measures', kind: 'table', columns: ['Value', 'Remarks'], rows: [
        'MPD /a/ (s)', 'MPD /i/ (s)', 'MPD /u/ (s)', 's/z ratio', 'Mean F0 (Hz)', 'Jitter (%)', 'Shimmer (%)', 'HNR (dB)', 'VHI-30 total',
      ] },
      { key: 'imaging', title: 'Visual imaging', kind: 'narrative' },
      { key: 'observations', title: 'Informal observations', kind: 'list' },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_fluency',
    division: 'slp',
    code: 'FL',
    name: 'Fluency evaluation',
    title: 'Fluency Evaluation Report',
    sections: [
      referral,
      background,
      complaints,
      { key: 'history', title: 'History', kind: 'fields', fields: [
        ['onset_age', 'Age at onset'], ['onset_type', 'Onset (gradual / sudden)'], ['family', 'Family history of stuttering'],
        ['course', 'Course since onset'], ['situations', 'Difficult speaking situations'], ['avoidance', 'Word or situation avoidance'],
        ['previous', 'Previous therapy'], ['languages', 'Languages spoken'],
      ] },
      { key: 'sample', title: 'Speech sample analysis', kind: 'table', columns: ['%SS', 'Main disfluency types', 'Notes'], rows: ['Conversation', 'Reading', 'Monologue'] },
      { key: 'ssi', title: 'Stuttering Severity Instrument (SSI-4)', kind: 'table', columns: ['Score'], rows: ['Frequency', 'Duration', 'Physical concomitants', 'Total score', 'Severity'] },
      { key: 'secondary', title: 'Secondary behaviours', kind: 'list' },
      { key: 'attitude', title: 'Attitudes and feelings', kind: 'fields', fields: [['tool', 'Measure used (e.g. S-24, OASES)'], ['score', 'Score'], ['impression', 'Impression', 'textarea']] },
      { key: 'rate', title: 'Rate of speech', kind: 'fields', fields: [['spm', 'Speech rate (syllables per minute)'], ['ar', 'Articulatory rate']] },
      { key: 'other', title: 'Speech, language and voice', kind: 'narrative' },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_child',
    division: 'slp',
    code: 'CSL',
    name: 'Child speech and language evaluation',
    title: 'Speech and Language Evaluation Report',
    sections: [
      referral,
      background,
      complaints,
      { key: 'development', title: 'Birth and developmental history', kind: 'fields', fields: [
        ['prenatal', 'Prenatal'], ['natal', 'Natal'], ['postnatal', 'Postnatal'], ['motor', 'Motor milestones'],
        ['speech', 'Speech and language milestones'], ['medical', 'Medical history'], ['hearing', 'Hearing status / screening'],
      ] },
      { key: 'ope', title: 'Oral peripheral mechanism examination', kind: 'table', columns: ['Structure', 'Function'], rows: ['Lips', 'Tongue', 'Teeth', 'Hard palate', 'Soft palate', 'Diadochokinetic rate'] },
      { key: 'language', title: 'Language assessment', kind: 'table', columns: ['Test / method', 'Findings', 'Language age'], rows: ['Receptive language', 'Expressive language', 'Pragmatics / social communication', 'Play and cognition'] },
      { key: 'artic', title: 'Speech sound assessment', kind: 'freetable', columns: ['Sound / pattern', 'Initial', 'Medial', 'Final', 'Error type'], minRows: 4 },
      { key: 'tests', title: 'Standardised tests used', kind: 'fields', fields: [['used', 'Tests (e.g. REELS, 3D-LAT, ALD, articulation test)', 'textarea'], ['scores', 'Scores and age equivalents', 'textarea']] },
      { key: 'autism', title: 'Autism / social communication screening', kind: 'fields', fields: [['tool', 'Tool (e.g. ISAA, INCLEN, M-CHAT)'], ['score', 'Score'], ['impression', 'Impression', 'textarea']] },
      { key: 'impression', title: 'Clinical impression', kind: 'narrative', ai: true },
      diagnosis,
      recommendations,
    ],
  },
  {
    id: 'slp_adult',
    division: 'slp',
    code: 'NC',
    name: 'Adult: aphasia, dysarthria and swallowing',
    title: 'Adult Communication and Swallowing Evaluation Report',
    sections: [
      referral,
      background,
      complaints,
      { key: 'medical', title: 'Medical history', kind: 'fields', fields: [
        ['condition', 'Diagnosis / event (e.g. stroke)'], ['onset', 'Date of onset'], ['site', 'Lesion site / imaging'],
        ['comorbid', 'Co-morbidities'], ['medication', 'Current medication'], ['feeding', 'Current feeding (oral / tube)'], ['trach', 'Tracheostomy'],
      ] },
      { key: 'cognition', title: 'Cognitive-communication screening', kind: 'narrative' },
      { key: 'aphasia_test', title: 'Language (aphasia) assessment', kind: 'fields', fields: [['test', 'Test used (e.g. WAB, WAB-K)']] },
      { key: 'language', title: 'Language findings', kind: 'table', columns: ['Score / findings', 'Remarks'], rows: [
        'Spontaneous speech', 'Auditory comprehension', 'Repetition', 'Naming', 'Reading', 'Writing', 'Aphasia quotient / severity',
      ] },
      { key: 'motor', title: 'Motor speech assessment', kind: 'table', columns: ['Findings'], rows: [
        'Respiration', 'Phonation', 'Resonance', 'Articulation', 'Prosody', 'Intelligibility (%)', 'Diadochokinetic rate', 'Dysarthria type', 'Apraxia of speech signs',
      ] },
      { key: 'oralmotor', title: 'Oral motor examination', kind: 'table', columns: ['Findings'], rows: ['Lips', 'Tongue', 'Jaw', 'Velum', 'Larynx (voluntary cough, swallow)'] },
      { key: 'swallow', title: 'Clinical swallowing evaluation', kind: 'table', columns: ['Observations', 'Signs of aspiration'], rows: [
        'Thin liquids (IDDSI 0)', 'Mildly thick (IDDSI 2)', 'Moderately thick (IDDSI 3)', 'Puree (IDDSI 4)', 'Soft & bite-sized (IDDSI 6)', 'Regular (IDDSI 7)',
      ] },
      { key: 'swallow_scales', title: 'Swallowing scales and instrumental findings', kind: 'fields', fields: [
        ['screen', 'Screening tool and score (e.g. MASA, GUSS, EAT-10)'], ['fois', 'FOIS level'], ['instrumental', 'FEES / VFSS findings', 'textarea'],
        ['pas', 'Penetration-Aspiration Scale'], ['diet', 'Recommended diet (IDDSI levels)'],
      ] },
      { key: 'impression', title: 'Clinical impression', kind: 'narrative', ai: true },
      diagnosis,
      recommendations,
    ],
  },
];

export function templatesFor(divisionId) {
  return TEMPLATES.filter((t) => t.division === divisionId);
}

export function template(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

export function aiSectionKeys(tpl) {
  return tpl.sections.filter((s) => s.ai).map((s) => s.key);
}

// ---------- audiogram ----------

export const AUDIOGRAM_FREQS = [250, 500, 1000, 2000, 4000, 8000];
export const AUDIOGRAM_ROWS = [['ac_r', 'AC Right'], ['ac_l', 'AC Left'], ['bc_r', 'BC Right'], ['bc_l', 'BC Left']];
const PTA_FREQS = [500, 1000, 2000, 4000];

// Average of 500, 1000, 2000 and 4000 Hz (needs all four), rounded to one decimal.
export function ptaAverage(row) {
  if (!row) return null;
  const values = PTA_FREQS.map((f) => row[f]);
  if (values.some((v) => v === undefined || v === null || String(v).trim() === '' || !Number.isFinite(Number(v)))) return null;
  const avg = values.reduce((sum, v) => sum + Number(v), 0) / values.length;
  return Math.round(avg * 10) / 10;
}

// Degree of hearing loss for a PTA (Clark, 1981): returns an id from DEGREES.
export function degreeFor(pta) {
  if (pta === null || pta === undefined || !Number.isFinite(pta)) return null;
  if (pta <= 15) return 'normal';
  if (pta <= 25) return 'minimal';
  if (pta <= 40) return 'mild';
  if (pta <= 55) return 'moderate';
  if (pta <= 70) return 'mod_severe';
  if (pta <= 90) return 'severe';
  return 'profound';
}

export function degreeLabel(pta) {
  const id = degreeFor(pta);
  return id ? labelOf(DEGREES, id).replace(/\s*\(.*\)$/, '') : '';
}

// ---------- numbering and dates ----------

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// SRC/VT/3/Nov/2026: clinic prefix, template code, running number in that month, month, year.
export function reportNo(code, serial, isoDate) {
  const [y, m] = String(isoDate).split('-');
  return `${CLINIC.prefix}/${code}/${serial}/${MONTH[Number(m) - 1]}/${y}`;
}

// Same day six months later (end of month when that day does not exist).
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function validityFor(reportDate) {
  return addMonths(reportDate, 6);
}

export function dmy(iso) {
  if (!isIsoDate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------- the blank report, and checking what is saved ----------

function blankSection(section) {
  switch (section.kind) {
    case 'fields': return Object.fromEntries(section.fields.map(([k]) => [k, '']));
    case 'table': return section.rows.map(() => section.columns.map(() => ''));
    case 'freetable': return Array.from({ length: section.minRows || 3 }, () => section.columns.map(() => ''));
    case 'audiogram': return Object.fromEntries(AUDIOGRAM_ROWS.map(([k]) => [k, {}]));
    case 'list': return [];
    default: return '';
  }
}

export function blankReport(tpl, caseInfo = {}) {
  const data = { case: Object.fromEntries(CASE_FIELDS.map(([k]) => [k, caseInfo[k] || ''])), header_date: '' };
  for (const s of tpl.sections) data[s.key] = blankSection(s);
  return data;
}

const text = (v, max = 4000) => String(v ?? '').slice(0, max);

function cleanSection(section, value) {
  switch (section.kind) {
    case 'fields': {
      const v = value && typeof value === 'object' ? value : {};
      return Object.fromEntries(section.fields.map(([k]) => [k, text(v[k], 2000)]));
    }
    case 'table': {
      const rows = Array.isArray(value) ? value : [];
      return section.rows.map((_, r) => section.columns.map((__, c) => text(rows[r]?.[c], 1000)));
    }
    case 'freetable': {
      const rows = Array.isArray(value) ? value.slice(0, 60) : [];
      return rows.map((row) => section.columns.map((_, c) => text(Array.isArray(row) ? row[c] : '', 300)));
    }
    case 'audiogram': {
      const v = value && typeof value === 'object' ? value : {};
      return Object.fromEntries(AUDIOGRAM_ROWS.map(([k]) => {
        const row = v[k] && typeof v[k] === 'object' ? v[k] : {};
        return [k, Object.fromEntries(AUDIOGRAM_FREQS.map((f) => [f, text(row[f], 8)]).filter(([, x]) => x !== ''))];
      }));
    }
    case 'list': {
      const items = Array.isArray(value) ? value : String(value ?? '').split('\n');
      return items.map((i) => text(i, 1200).trim()).filter(Boolean).slice(0, 60);
    }
    default: return text(value, 8000);
  }
}

// Keeps only what the template knows about, with sensible lengths.
export function cleanReportData(tpl, input = {}) {
  const c = input.case && typeof input.case === 'object' ? input.case : {};
  const data = {
    case: Object.fromEntries(CASE_FIELDS.map(([k]) => [k, text(c[k], 300)])),
    header_date: isIsoDate(input.header_date) ? input.header_date : '',
  };
  for (const s of tpl.sections) data[s.key] = cleanSection(s, input[s.key]);
  return data;
}

// Plain-text version of a filled report, for the AI (so it can draft the remaining sections).
export function reportAsText(tpl, data) {
  const lines = [];
  for (const [k, label] of CASE_FIELDS) if (data.case?.[k]) lines.push(`${label}: ${data.case[k]}`);
  for (const s of tpl.sections) {
    const v = data[s.key];
    let body = '';
    if (s.kind === 'fields') body = s.fields.filter(([k]) => v?.[k]).map(([k, label]) => `- ${label}: ${v[k]}`).join('\n');
    else if (s.kind === 'table') body = s.rows.map((r, i) => (v?.[i]?.some(Boolean) ? `- ${r}: ${s.columns.map((c, j) => (v[i][j] ? `${c} ${v[i][j]}` : '')).filter(Boolean).join('; ')}` : '')).filter(Boolean).join('\n');
    else if (s.kind === 'freetable') body = (v || []).filter((row) => row.some(Boolean)).map((row) => `- ${row.map((cell, j) => (cell ? `${s.columns[j]} ${cell}` : '')).filter(Boolean).join('; ')}`).join('\n');
    else if (s.kind === 'audiogram') {
      body = AUDIOGRAM_ROWS.map(([k, label]) => {
        const row = v?.[k] || {};
        const cells = AUDIOGRAM_FREQS.filter((f) => row[f] !== undefined && row[f] !== '').map((f) => `${f} Hz ${row[f]}`);
        if (!cells.length) return '';
        const pta = ptaAverage(row);
        return `- ${label}: ${cells.join(', ')}${pta !== null ? ` (PTA ${pta} dB HL, ${degreeLabel(pta)})` : ''}`;
      }).filter(Boolean).join('\n');
    } else if (s.kind === 'list') body = (v || []).map((i) => `- ${i}`).join('\n');
    else body = v || '';
    if (body) lines.push(`\n## ${s.title}\n${body}`);
  }
  return lines.join('\n').trim();
}

// What to put in the case table when a report is started for a patient.
export function caseInfoFor(patient, ageText, sexText) {
  return {
    name: patient.name || '',
    age_gender: [ageText, sexText].filter(Boolean).join(' / '),
    hospital_mr: patient.file_no || '',
    contact: patient.phone ? `+91 ${String(patient.phone).replace(/^(\d{5})(\d{5})$/, '$1 $2')}` : '',
    eval_date: '',
    languages: '',
  };
}

export const REPORT_STATUSES = [['draft', 'Draft'], ['final', 'Final']];

export function newReportDefaults(today) {
  return { report_date: today, valid_until: validityFor(today) };
}

export { addDays };
