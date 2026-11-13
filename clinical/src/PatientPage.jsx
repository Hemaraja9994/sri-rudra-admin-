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
import { templatesFor } from '../../shared/reports.js';
import { PER_WEEK, defaultPlanTitle, scheduleLine } from '../../shared/plans.js';
import { api, fileUrl, linkTo, navigate, uploadFile } from './api.js';
import PatientForm from './PatientForm.jsx';
import { readForAi } from './readfile.js';
import { AsyncButton, Field, Icon, Input, Modal, Notice, PriorityTag, ReviewText, Select, TextArea, whatsappHref } from './ui.jsx';

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

  const { patient: p, entries, linked, files = [], reports = [], plans = [], documentsReady = true } = data;
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
          <ReportsPlans patient={p} reports={reports} plans={plans} documentsReady={documentsReady} today={today} onChange={load} />
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

          <FilesCard patient={p} files={files} session={session} onChange={load} />

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

const REPORT_STATUS = { draft: 'Draft', final: 'Final' };
const PLAN_STATUS = { draft: 'Draft', active: 'In progress', completed: 'Completed' };

function ReportsPlans({ patient, reports, plans, documentsReady, today, onChange }) {
  const [newReport, setNewReport] = useState(false);
  const [newPlan, setNewPlan] = useState(false);
  const templates = templatesFor(patient.division);

  if (!documentsReady) {
    return (
      <section className="card">
        <h3>Reports &amp; therapy plans</h3>
        <Notice kind="warn">Reports and plans need a one-time database step. Ask your administrator to run the update in the README (migrations 0002).</Notice>
      </section>
    );
  }

  return (
    <section className="card clin-docs">
      <div className="clin-docs__head">
        <h3>Diagnostic reports</h3>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setNewReport(true)}><Icon name="plus" size={15} />New report</button>
      </div>
      {reports.length === 0 ? (
        <p className="muted">No reports yet. Start one from a template — the AI can draft the impression and recommendations for you to check.</p>
      ) : (
        <ul className="clin-doclist">
          {reports.map((r) => (
            <li key={r.id}>
              <a {...linkTo(`/clinical/${patient.division}/patients/${patient.id}/reports/${r.id}`)}>
                <Icon name="report" size={18} />
                <span className="clin-doclist__main">
                  <b>{r.title}</b>
                  <span className="muted">{r.report_no} · {prettyDate(r.report_date)}</span>
                </span>
                <span className={`tag ${r.status === 'final' ? 'tag--ok' : ''}`}>{REPORT_STATUS[r.status]}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="clin-docs__head clin-docs__head--sep">
        <h3>Therapy plans</h3>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setNewPlan(true)}><Icon name="plus" size={15} />New plan</button>
      </div>
      {plans.length === 0 ? (
        <p className="muted">No therapy plans yet. Build a session-by-session plan; the AI drafts the goals, activities and home practice.</p>
      ) : (
        <ul className="clin-doclist">
          {plans.map((pl) => (
            <li key={pl.id}>
              <a {...linkTo(`/clinical/${patient.division}/patients/${patient.id}/plans/${pl.id}`)}>
                <Icon name="plan" size={18} />
                <span className="clin-doclist__main">
                  <b>{pl.title}</b>
                  <span className="muted">{scheduleLine(pl) || `${pl.sessions_count} sessions`} · {pl.done}/{pl.sessions_count} done</span>
                </span>
                <span className={`tag ${pl.status === 'completed' ? 'tag--ok' : ''}`}>{PLAN_STATUS[pl.status]}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {newReport && <NewReport patient={patient} templates={templates} today={today} onClose={(id) => { setNewReport(false); if (id) navigate(`/clinical/${patient.division}/patients/${patient.id}/reports/${id}`); }} />}
      {newPlan && <NewPlan patient={patient} reports={reports} today={today} onClose={(id) => { setNewPlan(false); if (id) navigate(`/clinical/${patient.division}/patients/${patient.id}/plans/${id}`); }} />}
    </section>
  );
}

function NewReport({ patient, templates, today, onClose }) {
  const [template, setTemplate] = useState(templates[0]?.id || '');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  return (
    <Modal title="New diagnostic report" onClose={() => onClose(null)}>
      <Field label="Report type"><Select value={template} onChange={setTemplate} options={templates.map((t) => [t.id, t.name])} /></Field>
      <Field label="Report date"><Input type="date" value={date} onChange={setDate} max={addDays(today, 1)} /></Field>
      <Notice>{error}</Notice>
      <div className="modal__foot">
        <span className="spacer" />
        <button type="button" className="btn btn--secondary" onClick={() => onClose(null)}>Cancel</button>
        <AsyncButton busyLabel="Creating…" onClick={async () => {
          try { const { id } = await api(`/patients/${patient.id}/reports`, { method: 'POST', body: { template, report_date: date } }); onClose(id); } catch (e) { setError(e.message); }
        }}>Create report</AsyncButton>
      </div>
    </Modal>
  );
}

function NewPlan({ patient, reports, today, onClose }) {
  const dx = DIVISIONS[patient.division].diagnoses.find(([k]) => k === patient.diagnosis);
  const [form, setForm] = useState({
    title: defaultPlanTitle(12, dx?.[1]), sessions_count: 12, minutes: 45, per_week: 2, start_date: today,
    report_id: reports[0]?.id ? String(reports[0].id) : '', focus: '',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState('');
  return (
    <Modal title="New therapy plan" sub="Set the shape of the plan; the AI then drafts the goals, sessions and home practice for you to edit." onClose={() => onClose(null)} wide>
      <Field label="Plan title"><Input value={form.title} onChange={set('title')} /></Field>
      <div className="grid3">
        <Field label="Number of sessions"><Input value={form.sessions_count} onChange={set('sessions_count')} inputMode="numeric" /></Field>
        <Field label="Minutes per session"><Input value={form.minutes} onChange={set('minutes')} inputMode="numeric" /></Field>
        <Field label="How often"><Select value={String(form.per_week)} onChange={set('per_week')} options={PER_WEEK.map(([v, l]) => [String(v), l])} /></Field>
      </div>
      <div className="grid2">
        <Field label="Start date"><Input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
        {reports.length > 0 && <Field label="Base on report" hint="The AI uses this report's findings."><Select value={form.report_id} onChange={set('report_id')} options={reports.map((r) => [String(r.id), `${r.title} · ${prettyDate(r.report_date)}`])} placeholder="None" /></Field>}
      </div>
      <Field label="Approach / focus (optional)" hint="Anything the AI should keep in mind — technique, language of stimuli, constraints."><TextArea value={form.focus} onChange={set('focus')} rows={2} /></Field>
      <Notice>{error}</Notice>
      <div className="modal__foot">
        <span className="spacer" />
        <button type="button" className="btn btn--secondary" onClick={() => onClose(null)}>Cancel</button>
        <AsyncButton busyLabel="Creating…" onClick={async () => {
          try {
            const body = { ...form, sessions_count: Number(form.sessions_count), minutes: Number(form.minutes), per_week: Number(form.per_week), report_id: form.report_id || null };
            const { id } = await api(`/patients/${patient.id}/plans`, { method: 'POST', body });
            onClose(id);
          } catch (e) { setError(e.message); }
        }}>Create plan</AsyncButton>
      </div>
    </Modal>
  );
}

function FilesCard({ patient, files, session, onChange }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const ref = React.useRef(null);

  async function add(list) {
    setError('');
    const picked = Array.from(list).slice(0, 10);
    for (const file of picked) {
      setBusy(`Uploading ${file.name}…`);
      try {
        await uploadFile(patient.id, file, { name: file.name }); // eslint-disable-line no-await-in-loop
      } catch (e) { setError(e.message); }
    }
    setBusy('');
    onChange();
  }

  return (
    <section className="card clin-files">
      <div className="clin-docs__head">
        <h3>Files</h3>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => ref.current?.click()}><Icon name="upload" size={15} />Add file</button>
        <input ref={ref} type="file" accept="image/*,application/pdf,.pdf,.txt,.doc,.docx" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {busy && <p className="clin-aistatus"><span className="clin-spin" />{busy}</p>}
      <Notice>{error}</Notice>
      {files.length === 0 ? (
        <p className="muted">No files yet. Upload case sheets, reports or photos — they stay with this patient.</p>
      ) : (
        <ul className="clin-filelist clin-filelist--saved">
          {files.map((f) => (
            <li key={f.id}>
              <Icon name="file" size={16} />
              <a className="clin-filelist__name" href={fileUrl(f.id)} target="_blank" rel="noreferrer" title={f.file_name}>{f.file_name}</a>
              <a className="clin-filelist__act" href={fileUrl(f.id, { download: true })} aria-label="Download" title="Download"><Icon name="download" size={15} /></a>
              {(session.user.canManageUsers || f.uploaded_by === session.user.id) && (
                <button type="button" aria-label="Delete file" title="Delete"
                  onClick={async () => { if (!window.confirm(`Delete ${f.file_name}?`)) return; try { await api(`/files/${f.id}`, { method: 'DELETE' }); onChange(); } catch (e) { setError(e.message); } }}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
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
