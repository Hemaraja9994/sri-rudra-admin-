import React, { useEffect, useState } from 'react';

import {
  DEGREES,
  DIVISIONS,
  EARS,
  ENTRY_KINDS,
  PRIORITIES,
  SEXES,
  addDays,
  ageLabel,
  labelOf,
  prettyDate,
} from '../../shared/clinical.js';
import { api, linkTo, navigate } from './api.js';
import PatientForm from './PatientForm.jsx';
import { Field, Icon, Input, Notice, PriorityTag, ReviewText, Select, TextArea, whatsappHref } from './ui.jsx';

const REVIEW_PICKS = [['1 week', 7], ['2 weeks', 14], ['1 month', 30], ['3 months', 91]];

// One patient's record: where they are in care, what has been done, and what is next.
export default function PatientPage({ divisionId, id, session }) {
  const today = session.today;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api(`/patients/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = (
    <a className="clin-back" {...linkTo(`/clinical/${divisionId}`)}>
      <Icon name="back" size={18} />{DIVISIONS[divisionId].label} caseload
    </a>
  );
  if (!data) return <>{back}<Notice>{error}</Notice>{!error && <div className="empty">Loading…</div>}</>;

  const { patient: p, entries, linked } = data;
  const div = DIVISIONS[p.division];
  if (p.division !== divisionId) {
    window.history.replaceState({}, '', `/clinical/${p.division}/patients/${p.id}`);
  }

  async function patch(body) {
    setSaving(true);
    setError('');
    try {
      await api(`/patients/${p.id}`, { method: 'PATCH', body });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function moveStage(stage) {
    if (stage === p.stage || saving) return;
    if (stage === 'discharged' && !window.confirm(`Discharge ${p.name}? They move out of the active caseload; their record stays.`)) return;
    patch({ stage });
  }

  async function remove() {
    if (!window.confirm(`Delete ${p.name}'s clinical record, with all sessions and notes? This cannot be undone.`)) return;
    try {
      await api(`/patients/${p.id}`, { method: 'DELETE' });
      navigate(`/clinical/${p.division}`);
    } catch (e) {
      setError(e.message);
    }
  }

  const age = ageLabel(p, today);
  const phoneDigits = String(p.phone || '');

  return (
    <>
      {back}
      <div className="head">
        <div>
          <h1>{p.name}</h1>
          <div className="sub clin-idline">
            {p.reg_no && <span>{p.reg_no}</span>}
            {age && <span>{age}</span>}
            {p.sex && <span>{labelOf(SEXES, p.sex)}</span>}
            {p.clinic_name && <span>{p.clinic_name}</span>}
            {p.status === 'discharged' && <span className="tag">Discharged</span>}
            <PriorityTag priority={p.priority} />
          </div>
        </div>
        <div className="head__actions">
          {phoneDigits && (
            <>
              <a className="btn btn--secondary" href={`tel:${phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneDigits}`}><Icon name="phone" size={16} />Call</a>
              <a className="btn btn--secondary" href={whatsappHref(phoneDigits, `Namaste ${p.name}, this is Sri Rudra Speech & Hearing Clinic. `)} target="_blank" rel="noreferrer"><Icon name="chat" size={16} />WhatsApp</a>
            </>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Edit details</button>
        </div>
      </div>

      <Notice>{error}</Notice>

      <ol className="clin-stepper" aria-label="Care stage">
        {div.stages.map(([sid, label], i) => {
          const currentIndex = div.stages.findIndex(([s]) => s === p.stage);
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'next';
          return (
            <li key={sid} className={`clin-step clin-step--${state}`}>
              <button type="button" onClick={() => moveStage(sid)} disabled={saving} aria-current={state === 'current' ? 'step' : undefined} title={state === 'current' ? 'Current stage' : `Move to ${label}`}>
                <span className="clin-step__n">{state === 'done' ? <Icon name="check" size={15} /> : i + 1}</span>
                <span className="clin-step__label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="clin-cols">
        <div className="clin-col-main">
          <AddEntry patient={p} today={today} onSaved={load} />
          <section className="card clin-timeline">
            <h3>Sessions, tests and notes</h3>
            {entries.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
              <ol>
                {entries.map((e) => (
                  <li key={e.id} className={`clin-entry clin-entry--${e.kind}`}>
                    <div className="clin-entry__when">
                      <b>{prettyDate(e.entry_date, e.entry_date.slice(0, 4) !== today.slice(0, 4))}</b>
                      <span>{e.kind === 'stage' ? 'Care stage' : labelOf(ENTRY_KINDS, e.kind)}</span>
                    </div>
                    <div className="clin-entry__body">
                      {e.title && <p className="clin-entry__title">{e.title}</p>}
                      {e.body && <p className="clin-entry__text">{e.body}</p>}
                      <small>{e.created_by_name || 'Staff'}</small>
                    </div>
                    {e.kind !== 'stage' && (session.user.canManageUsers || e.created_by === session.user.id) && (
                      <button type="button" className="clin-entry__del" title="Delete entry" aria-label="Delete entry"
                        onClick={async () => {
                          if (!window.confirm('Delete this entry?')) return;
                          try { await api(`/entries/${e.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
                        }}>
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="clin-col-side">
          <section className="card clin-summary">
            <h3>Clinical summary</h3>
            <dl>
              <dt>Diagnosis</dt>
              <dd>{labelOf(div.diagnoses, p.diagnosis)}{p.diagnosis_detail && <span className="muted"> — {p.diagnosis_detail}</span>}</dd>
              {p.division === 'audiology' && (p.ear || p.degree) && (
                <>
                  <dt>Hearing</dt>
                  <dd>{[labelOf(EARS, p.ear), labelOf(DEGREES, p.degree)].filter(Boolean).join(', ')}</dd>
                </>
              )}
              <dt>Care stage</dt>
              <dd>{labelOf(div.stages, p.stage)}</dd>
              <dt>Priority</dt>
              <dd>{labelOf(PRIORITIES, p.priority)}</dd>
              {p.clinician && <><dt>Clinician</dt><dd>{p.clinician}</dd></>}
              {p.referred_by && <><dt>Referred by</dt><dd>{p.referred_by}</dd></>}
              {p.file_no && <><dt>File no. / UHID</dt><dd>{p.file_no}</dd></>}
              {p.phone && <><dt>Phone</dt><dd className="num">{p.phone}</dd></>}
              {p.dob && <><dt>Date of birth</dt><dd>{prettyDate(p.dob)}</dd></>}
            </dl>
            {p.notes && <p className="clin-notes">{p.notes}</p>}
          </section>

          <section className="card clin-review">
            <h3>Next review</h3>
            <p className="clin-review__date"><ReviewText date={p.next_review} today={today} status={p.status} /></p>
            <div className="clin-picks" role="group" aria-label="Set next review">
              {REVIEW_PICKS.map(([label, days]) => (
                <button key={label} type="button" disabled={saving} onClick={() => patch({ next_review: addDays(today, days) })}>In {label}</button>
              ))}
              {p.next_review && <button type="button" disabled={saving} onClick={() => patch({ next_review: null })}>Clear</button>}
            </div>
          </section>

          <Linked linked={linked} hasPhone={(p.phone || '').length >= 10} />

          {session.user.canManageUsers && (
            <section className="card clin-danger">
              <h3>Delete record</h3>
              <p className="muted">Removes this clinical record with its sessions and notes. Appointments and test reports in the portal are not touched.</p>
              <button type="button" className="btn btn--danger" onClick={remove}><Icon name="trash" size={16} />Delete patient</button>
            </section>
          )}
        </aside>
      </div>

      {editing && <PatientForm divisionId={p.division} session={session} patient={p} onClose={(changed) => { setEditing(false); if (changed) load(); }} />}
    </>
  );
}

function AddEntry({ patient, today, onSaved }) {
  const blank = { kind: 'session', entry_date: today, title: '', body: '', next_review: undefined };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { kind: form.kind, entry_date: form.entry_date, title: form.title, body: form.body };
      if (form.next_review !== undefined) body.next_review = form.next_review;
      await api(`/patients/${patient.id}/entries`, { method: 'POST', body });
      setForm(blank);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const titleHint = {
    session: 'e.g. Fluency shaping, 40 min',
    test: 'e.g. PTA + immittance',
    plan: 'e.g. Goals for next 8 sessions',
    note: 'e.g. Parent called about schedule',
  }[form.kind];

  return (
    <form className="card clin-add" onSubmit={save}>
      <h3>Add to the record</h3>
      <div className="grid3">
        <Field label="Type"><Select value={form.kind} onChange={set('kind')} options={ENTRY_KINDS} /></Field>
        <Field label="Date"><Input type="date" value={form.entry_date} onChange={set('entry_date')} max={addDays(today, 1)} /></Field>
        <Field label="Title"><Input value={form.title} onChange={set('title')} placeholder={titleHint} /></Field>
      </div>
      <Field label="What was done or observed"><TextArea value={form.body} onChange={set('body')} rows={3} placeholder="Tasks, responses, scores, home practice, next steps…" /></Field>
      <div className="clin-add__foot">
        <div className="clin-picks" role="group" aria-label="Next review">
          <span className="clin-picks__label">Next review</span>
          {REVIEW_PICKS.map(([label, days]) => {
            const date = addDays(today, days);
            return <button key={label} type="button" className={form.next_review === date ? 'active' : ''} onClick={() => set('next_review')(form.next_review === date ? undefined : date)}>In {label}</button>;
          })}
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</button>
      </div>
      <Notice>{error}</Notice>
    </form>
  );
}

function Linked({ linked, hasPhone }) {
  const sections = [
    ['appointments', 'Appointments', '/appointments', (r) => [r.scheduled_for?.replace('T', ' ').slice(0, 16), r.service, r.status]],
    ['reports', 'Test reports', '/reports', (r) => [r.performed_at, r.kind, r.clinician]],
    ['trials', 'HA trials', '/trials', (r) => [r.trial_date, [r.brand_name, r.model_name].filter(Boolean).join(' '), r.ear, r.outcome]],
    ['sales', 'HA sales', '/sales', (r) => [r.sale_date, [r.brand_name, r.model_name].filter(Boolean).join(' '), r.qty ? `${r.qty} unit${r.qty > 1 ? 's' : ''}` : null]],
  ];
  const total = sections.reduce((n, [key]) => n + (linked[key]?.length || 0), 0);
  return (
    <section className="card clin-linked">
      <h3>Clinic records</h3>
      {!hasPhone ? (
        <p className="muted">Add a 10-digit phone number to see this patient’s appointments, test reports, trials and sales.</p>
      ) : total === 0 ? (
        <p className="muted">No appointments, test reports, trials or sales with this phone number yet.</p>
      ) : (
        sections.map(([key, label, href, cells]) => linked[key]?.length ? (
          <div key={key} className="clin-linked__group">
            <a className="clin-linked__head" href={href}>{label} <span className="num">{linked[key].length}</span></a>
            <ul>
              {linked[key].slice(0, 6).map((r) => (
                <li key={r.id}>{cells(r).filter(Boolean).map((c, i) => <span key={i}>{c}</span>)}</li>
              ))}
            </ul>
          </div>
        ) : null)
      )}
    </section>
  );
}
