import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIVISIONS,
  ageFrom,
  ageGroup,
  ageLabel,
  groupPatients,
  indiaToday,
  normalizeEntry,
  normalizePatient,
  patientsToCsv,
  priorityLane,
  regNo,
  reviewBucket,
  reviewLabel,
  stageNote,
  summarize,
} from './clinical.js';

const today = '2026-11-13';

test('both divisions have the agreed care stages, ending in Discharged', () => {
  assert.deepEqual(DIVISIONS.audiology.stages.map(([id]) => id), ['assessment', 'hat', 'fitting', 'rehab', 'follow_up', 'discharged']);
  assert.deepEqual(DIVISIONS.slp.stages.map(([id]) => id), ['assessment', 'therapy', 'home_programme', 'review', 'discharged']);
});

test('a patient needs a division and a name; lists are checked', () => {
  assert.throws(() => normalizePatient({ name: 'Ravi' }), /Audiology or Speech-Language/);
  assert.throws(() => normalizePatient({ division: 'slp' }), /name/);
  assert.throws(() => normalizePatient({ division: 'slp', name: 'A', diagnosis: 'snhl' }), /valid diagnosis/);
  assert.throws(() => normalizePatient({ division: 'audiology', name: 'A', stage: 'therapy' }), /care stage/);
  assert.throws(() => normalizePatient({ division: 'audiology', name: 'A', age_years: '7.5' }), /whole years/);
  assert.throws(() => normalizePatient({ division: 'audiology', name: 'A', dob: '2026-02-30' }), /date of birth/);
});

test('audiology keeps ear and degree; SLP drops them; discharged stage closes the case', () => {
  const a = normalizePatient({ division: 'audiology', name: ' Lakshmi ', phone: '+91 98765 43210', diagnosis: 'snhl', ear: 'both', degree: 'moderate', age_years: '64' });
  assert.equal(a.name, 'Lakshmi');
  assert.equal(a.phone, '9876543210');
  assert.equal(a.stage, 'assessment');
  assert.equal(a.priority, 'routine');
  assert.equal(a.status, 'active');
  assert.equal(a.age_years, 64);
  const s = normalizePatient({ division: 'slp', name: 'Arjun', diagnosis: 'fluency', ear: 'both', degree: 'mild', stage: 'discharged' });
  assert.equal(s.ear, null);
  assert.equal(s.degree, null);
  assert.equal(s.status, 'discharged');
});

test('age comes from date of birth when given, else from the age typed', () => {
  assert.equal(ageFrom({ dob: '2020-11-14' }, today), 5);
  assert.equal(ageFrom({ dob: '2020-11-13' }, today), 6);
  assert.equal(ageFrom({ age_years: 64 }, today), 64);
  assert.equal(ageFrom({}, today), null);
  assert.equal(ageGroup(4), 'child');
  assert.equal(ageGroup(18), 'adult');
  assert.equal(ageGroup(60), 'older');
  assert.equal(ageGroup(null), 'unknown');
  assert.equal(ageLabel({ dob: '2026-01-10' }, today), '10 mo');
});

test('review dates read plainly and drive the priority lanes', () => {
  assert.equal(reviewBucket('2026-11-10', today), 'overdue');
  assert.equal(reviewBucket('2026-11-13', today), 'today');
  assert.equal(reviewBucket('2026-11-19', today), 'week');
  assert.equal(reviewBucket('2026-12-30', today), 'later');
  assert.equal(reviewLabel('2026-11-11', today), 'Overdue by 2 days');
  assert.equal(reviewLabel('2026-11-14', today), 'Review tomorrow');
  assert.equal(priorityLane({ status: 'active', next_review: '2026-11-01', priority: 'routine' }, today), 'overdue');
  assert.equal(priorityLane({ status: 'active', next_review: null, priority: 'urgent' }, today), 'urgent');
  assert.equal(priorityLane({ status: 'active', next_review: '2026-11-15', priority: 'routine' }, today), 'due');
  assert.equal(priorityLane({ status: 'active', next_review: null, priority: 'high' }, today), 'high');
});

test('the caseload is segregated by stage, diagnosis, age group and priority', () => {
  const patients = [
    { id: 1, division: 'slp', stage: 'therapy', diagnosis: 'fluency', age_years: 9, priority: 'routine', status: 'active', next_review: '2026-11-20' },
    { id: 2, division: 'slp', stage: 'therapy', diagnosis: 'voice', age_years: 42, priority: 'high', status: 'active', next_review: '2026-11-15' },
    { id: 3, division: 'slp', stage: 'assessment', diagnosis: 'fluency', age_years: 67, priority: 'urgent', status: 'active', next_review: null },
  ];
  const byStage = groupPatients(patients, 'stage', 'slp', today);
  assert.deepEqual(byStage.find((g) => g.id === 'therapy').patients.map((p) => p.id), [2, 1]); // soonest review first
  const byDx = groupPatients(patients, 'diagnosis', 'slp', today);
  assert.equal(byDx.find((g) => g.id === 'fluency').patients.length, 2);
  const byAge = groupPatients(patients, 'age', 'slp', today);
  assert.deepEqual(byAge.map((g) => g.patients.length), [1, 1, 1, 0]);
  const byPriority = groupPatients(patients, 'priority', 'slp', today);
  assert.deepEqual(byPriority.find((g) => g.id === 'urgent').patients.map((p) => p.id), [3]);
});

test('summary counts active caseload, new this month, due and overdue', () => {
  const s = summarize([
    { status: 'active', created_at: '2026-11-02 10:00:00', next_review: '2026-11-12', priority: 'high' },
    { status: 'active', created_at: '2026-10-02 10:00:00', next_review: '2026-11-16', priority: 'routine' },
    { status: 'discharged', created_at: '2026-11-05 10:00:00', next_review: '2026-11-01', priority: 'urgent' },
  ], today);
  assert.deepEqual(s, { active: 2, newThisMonth: 2, dueThisWeek: 1, overdue: 1, highPriority: 1 });
});

test('entries need a date and some words', () => {
  assert.throws(() => normalizeEntry({ kind: 'session', body: 'x' }), /date/);
  assert.throws(() => normalizeEntry({ kind: 'session', entry_date: today }), /what was done/);
  assert.throws(() => normalizeEntry({ kind: 'stage', entry_date: today, body: 'x' }), /entry type/);
  assert.equal(normalizeEntry({ kind: 'test', entry_date: today, title: 'PTA' }).kind, 'test');
});

test('registration numbers, stage notes, India date and CSV', () => {
  assert.equal(regNo('audiology', 7, '2026-11-13 04:00:00'), 'AUD-2026-0007');
  assert.equal(regNo('slp', 123, '2026-11-13 04:00:00'), 'SLP-2026-0123');
  assert.equal(stageNote('audiology', 'hat', 'fitting'), 'Moved from HA trial (HAT) to Fitting & verification');
  assert.equal(stageNote('slp', null, 'assessment'), 'Registered at Assessment');
  assert.equal(indiaToday(Date.parse('2026-11-12T20:00:00Z')), '2026-11-13');
  const csv = patientsToCsv([{ reg_no: 'AUD-2026-0001', name: 'Rao, K', phone: '9849848516', age_years: 70, sex: 'male', diagnosis: 'snhl', ear: 'both', degree: 'moderate', stage: 'hat', priority: 'routine', status: 'active' }], 'audiology', today);
  const [head, row] = csv.trim().split('\n');
  assert.ok(head.includes('Ear,Degree,Care stage'));
  assert.ok(row.startsWith('AUD-2026-0001,"Rao, K",9849848516,70 y,Male,Sensorineural hearing loss,,Both ears,Moderate (41–55 dB HL),HA trial (HAT)'));
});
