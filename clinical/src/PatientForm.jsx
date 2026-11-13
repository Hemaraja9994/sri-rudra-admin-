import React, { useState } from 'react';

import { DEGREES, DIVISIONS, EARS, PRIORITIES, SEXES, addDays } from '../../shared/clinical.js';
import { api } from './api.js';
import { Field, Input, Modal, Notice, Select, TextArea } from './ui.jsx';

const REVIEW_PICKS = [['1 week', 7], ['2 weeks', 14], ['1 month', 30], ['3 months', 91], ['6 months', 182]];

// Add a patient, or edit one (patient given). Closes with the new id, true after an edit, or nothing.
// `initial` pre-fills the form (e.g. from a file the AI read); `highlight` is the set of those fields.
export default function PatientForm({ divisionId, session, patient, onClose, initial, highlight }) {
  const div = DIVISIONS[divisionId];
  const isNew = !patient;
  const today = session.today;
  const lit = highlight instanceof Set ? highlight : new Set(highlight || []);
  const [form, setForm] = useState(() => (patient
    ? { ...patient, clinic_id: patient.clinic_id ? String(patient.clinic_id) : '', age_years: patient.age_years ?? '' }
    : {
      stage: div.stages[0][0],
      priority: 'routine',
      diagnosis: '',
      clinician: session.user.full_name || '',
      clinic_id: session.clinics.length === 1 ? String(session.clinics[0].id) : (session.user.clinic_id ? String(session.user.clinic_id) : ''),
      next_review: addDays(today, 14),
      ...(initial || {}),
    }));
  const [useDob, setUseDob] = useState(Boolean(patient?.dob) || Boolean(initial?.dob));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const fromFile = (k) => (lit.has(k) ? 'from file' : undefined);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.diagnosis) { setError('Choose a diagnosis (or “Other / not yet diagnosed”).'); return; }
    setBusy(true);
    const body = {
      ...form,
      division: divisionId,
      dob: useDob ? form.dob || null : null,
      age_years: useDob ? null : form.age_years,
    };
    try {
      if (isNew) {
        const { id } = await api('/patients', { method: 'POST', body });
        onClose(id);
      } else {
        await api(`/patients/${patient.id}`, { method: 'PATCH', body });
        onClose(true);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const showClinic = session.clinics.length > 1 && session.user.canSeeAllClinics;

  return (
    <Modal title={isNew ? `Add ${div.label.toLowerCase()} patient` : `Edit ${patient.name}`} sub={isNew ? 'Name and diagnosis are enough to start; the rest can be filled in later.' : null} onClose={() => onClose(null)} wide>
      <form onSubmit={save}>
        {lit.size > 0 && (
          <div className="notice notice--ok" role="status">
            Filled in from the file. Please check the highlighted fields before saving — the AI can misread handwriting and numbers.
          </div>
        )}
        <fieldset className="clin-fs">
          <legend>Patient</legend>
          <div className="grid2">
            <Field label="Full name *" badge={fromFile('name')}><Input value={form.name} onChange={set('name')} required autoFocus autoComplete="off" /></Field>
            <Field label="Phone" hint="Links their appointments, test reports, trials and sales." badge={fromFile('phone')}><Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="off" /></Field>
          </div>
          <div className="grid3">
            <Field label="Sex" badge={fromFile('sex')}><Select value={form.sex} onChange={set('sex')} options={SEXES} placeholder="Not recorded" /></Field>
            {useDob ? (
              <Field label="Date of birth" badge={fromFile('dob')}><Input type="date" value={form.dob} onChange={set('dob')} max={today} /></Field>
            ) : (
              <Field label="Age (years)" badge={fromFile('age_years')}><Input value={form.age_years} onChange={set('age_years')} inputMode="numeric" placeholder="e.g. 7 or 64" /></Field>
            )}
            <Field label="File no. / UHID" badge={fromFile('file_no')}><Input value={form.file_no} onChange={set('file_no')} /></Field>
          </div>
          <button type="button" className="btn btn--ghost btn--sm clin-switch" onClick={() => setUseDob(!useDob)}>
            {useDob ? 'Enter age in years instead' : 'Enter date of birth instead (better for children)'}
          </button>
        </fieldset>

        <fieldset className="clin-fs">
          <legend>Diagnosis</legend>
          <div className="grid2">
            <Field label="Diagnosis *" badge={fromFile('diagnosis')}><Select value={form.diagnosis} onChange={set('diagnosis')} options={div.diagnoses} placeholder="Choose…" /></Field>
            <Field label="Details" badge={fromFile('diagnosis_detail')}><Input value={form.diagnosis_detail} onChange={set('diagnosis_detail')} placeholder={divisionId === 'audiology' ? 'e.g. Bilateral sloping SNHL, presbycusis' : 'e.g. Moderate stuttering, SSI-4 = 24'} /></Field>
          </div>
          {divisionId === 'audiology' && (
            <div className="grid2">
              <Field label="Ear" badge={fromFile('ear')}><Select value={form.ear} onChange={set('ear')} options={EARS} placeholder="Not recorded" /></Field>
              <Field label="Degree of hearing loss" badge={fromFile('degree')}><Select value={form.degree} onChange={set('degree')} options={DEGREES} placeholder="Not recorded" /></Field>
            </div>
          )}
        </fieldset>

        <fieldset className="clin-fs">
          <legend>Care</legend>
          <div className="grid3">
            <Field label="Care stage"><Select value={form.stage} onChange={set('stage')} options={div.stages} /></Field>
            <Field label="Priority"><Select value={form.priority} onChange={set('priority')} options={PRIORITIES} /></Field>
            <Field label="Next review"><Input type="date" value={form.next_review} onChange={set('next_review')} /></Field>
          </div>
          <div className="clin-picks" role="group" aria-label="Set next review">
            {REVIEW_PICKS.map(([label, days]) => {
              const date = addDays(today, days);
              return <button key={label} type="button" className={form.next_review === date ? 'active' : ''} onClick={() => set('next_review')(date)}>In {label}</button>;
            })}
            <button type="button" className={!form.next_review ? 'active' : ''} onClick={() => set('next_review')('')}>No review date</button>
          </div>
          <div className={showClinic ? 'grid3' : 'grid2'}>
            <Field label="Clinician"><Input value={form.clinician} onChange={set('clinician')} /></Field>
            <Field label="Referred by" badge={fromFile('referred_by')}><Input value={form.referred_by} onChange={set('referred_by')} placeholder="Doctor, school, self…" /></Field>
            {showClinic && (
              <Field label="Clinic"><Select value={form.clinic_id} onChange={set('clinic_id')} options={session.clinics.map((c) => [String(c.id), c.name])} placeholder="Not set" /></Field>
            )}
          </div>
          <Field label="Notes"><TextArea value={form.notes} onChange={set('notes')} rows={3} placeholder="History, concerns, family goals…" /></Field>
        </fieldset>

        <Notice>{error}</Notice>
        <div className="modal__foot">
          <span className="spacer" />
          <button type="button" className="btn btn--secondary" onClick={() => onClose(null)}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add patient' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
