import React, { useEffect, useMemo, useState } from 'react';

import {
  DIVISIONS,
  GROUPINGS,
  SEXES,
  ageLabel,
  groupPatients,
  labelOf,
  patientsToCsv,
  summarize,
} from '../../shared/clinical.js';
import AddFromFile from './AddFromFile.jsx';
import { api, downloadText, linkTo, navigate } from './api.js';
import PatientForm from './PatientForm.jsx';
import { Icon, Notice, PriorityTag, ReviewText } from './ui.jsx';

const STATUSES = [['active', 'Active'], ['discharged', 'Discharged'], ['all', 'All']];

function remembered(key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function remember(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function matches(p, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  if (digits.length >= 3 && String(p.phone || '').includes(digits)) return true;
  return [p.name, p.reg_no, p.file_no, p.diagnosis_detail, p.clinician, p.referred_by]
    .some((v) => String(v || '').toLowerCase().includes(needle));
}

// One division's caseload: the figures, then patients grouped the way the clinician chooses.
export default function DivisionPage({ divisionId, session }) {
  const div = DIVISIONS[divisionId];
  const today = session.today;
  const [patients, setPatients] = useState(null);
  const [status, setStatus] = useState('active');
  const [grouping, setGrouping] = useState(() => remembered('clin.grouping', 'stage'));
  const [q, setQ] = useState('');
  // A ?clinic=<id> in the address opens the caseload pre-filtered to that centre
  // (used by the per-centre links on Master control).
  const [clinicId, setClinicId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('clinic') || ''; } catch { return ''; }
  });
  const [adding, setAdding] = useState(false);
  const [fromFile, setFromFile] = useState(false);
  const [error, setError] = useState('');

  const load = () => api(`/patients?division=${divisionId}&status=all`)
    .then((d) => setPatients(d.patients))
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const all = patients || [];
  const kpi = summarize(all, today);
  const visible = useMemo(
    () => all.filter((p) => (status === 'all' || p.status === status) && matches(p, q) && (!clinicId || String(p.clinic_id) === clinicId)),
    [all, status, q, clinicId],
  );
  let groups = groupPatients(visible, grouping, divisionId, today);
  const pipeline = grouping === 'stage';
  if (pipeline && status === 'active') groups = groups.filter((g) => g.id !== 'discharged');
  const hiddenEmpty = pipeline ? 0 : groups.filter((g) => !g.patients.length).length;
  if (!pipeline) groups = groups.filter((g) => g.patients.length);

  const chooseGrouping = (id) => { setGrouping(id); remember('clin.grouping', id); };
  const showClinic = (session.user.canSeeAllClinics && session.clinics.length > 1) || !!clinicId;

  return (
    <>
      <div className="head">
        <div>
          <h1>{div.label}</h1>
          <div className="sub">
            {divisionId === 'audiology'
              ? 'Hearing and balance caseload: assessments, hearing-aid trials, fittings and follow-ups.'
              : 'Speech, language, voice, fluency and swallowing caseload: assessments, therapy and reviews.'}
          </div>
        </div>
        <div className="head__actions">
          {visible.length > 0 && (
            <button type="button" className="btn btn--secondary" onClick={() => downloadText(`${div.short.toLowerCase()}-patients-${today}.csv`, patientsToCsv(visible, divisionId, today))}>
              <Icon name="download" size={16} />Export CSV
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => setFromFile(true)}>
            <Icon name="ai" size={16} />Add from file
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} />Add patient
          </button>
        </div>
      </div>

      <nav className="tabs clin-divtabs" aria-label="Division">
        {Object.values(DIVISIONS).map((d) => (
          <a key={d.id} {...linkTo(`/clinical/${d.id}`)} className={d.id === divisionId ? 'active' : ''} aria-current={d.id === divisionId ? 'page' : undefined}>
            <Icon name={d.id === 'audiology' ? 'ear' : 'speech'} size={17} />{d.label}
          </a>
        ))}
      </nav>

      <Notice>{error}</Notice>

      <div className="cards cards--5 clin-kpis">
        <div className="stat stat--dark">
          <div className="stat__lbl">Active caseload</div>
          <div className="stat__val num">{patients ? kpi.active : '–'}</div>
          <div className="stat__meta">patients under care now</div>
        </div>
        <div className="stat">
          <div className="stat__lbl">New this month</div>
          <div className="stat__val num">{patients ? kpi.newThisMonth : '–'}</div>
          <div className="stat__meta">registered since the 1st</div>
        </div>
        <div className="stat">
          <div className="stat__lbl">Reviews this week</div>
          <div className="stat__val num">{patients ? kpi.dueThisWeek : '–'}</div>
          <div className="stat__meta">due in the next 7 days</div>
        </div>
        <div className={`stat ${kpi.overdue ? 'stat--alert' : ''}`}>
          <div className="stat__lbl">Overdue reviews</div>
          <div className="stat__val num">{patients ? kpi.overdue : '–'}</div>
          <div className="stat__meta">{kpi.overdue ? 'call these patients first' : 'none waiting'}</div>
        </div>
        <div className="stat">
          <div className="stat__lbl">High priority</div>
          <div className="stat__val num">{patients ? kpi.highPriority : '–'}</div>
          <div className="stat__meta">marked high or urgent</div>
        </div>
      </div>

      <div className="toolbar clin-toolbar">
        <div className="field grow">
          <label htmlFor="clin-q">Search</label>
          <input id="clin-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, reg. no, file no or clinician" />
        </div>
        <div className="field">
          <label htmlFor="clin-status">Show</label>
          <select id="clin-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {showClinic && (
          <div className="field">
            <label htmlFor="clin-clinic">Clinic</label>
            <select id="clin-clinic" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              <option value="">All clinics</option>
              {session.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="clin-seg" role="group" aria-label="Group patients by">
          {GROUPINGS.map(([id, label]) => (
            <button key={id} type="button" className={grouping === id ? 'active' : ''} aria-pressed={grouping === id} onClick={() => chooseGrouping(id)}>{label}</button>
          ))}
        </div>
      </div>

      {patients === null ? (
        !error && <div className="empty">Loading patients…</div>
      ) : all.length === 0 ? (
        <section className="card clin-empty">
          <h3>No {div.label.toLowerCase()} patients yet</h3>
          <p>Add a patient to start their record. Their care stage, review dates, sessions and notes stay together here, next to their appointments and test reports.</p>
          <div className="head__actions">
            <button type="button" className="btn btn--secondary" onClick={() => setFromFile(true)}><Icon name="ai" size={16} />Add from a file</button>
            <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add the first patient</button>
          </div>
        </section>
      ) : (
        <>
          <Distribution groups={groups} total={visible.length} grouping={grouping} />
          {visible.length === 0 ? (
            <div className="empty">No patients match. Clear the search or choose “All”.</div>
          ) : (
            <div className="clin-board" style={{ '--lanes': groups.length }}>
              {groups.map((g, i) => (
                <section key={g.id} className={`clin-lane clin-lane--${g.id}`} style={{ '--i': i }} aria-label={g.label}>
                  <header>
                    <h2>{g.label}</h2>
                    <span className="clin-count num">{g.patients.length}</span>
                  </header>
                  {g.patients.length === 0 ? (
                    <p className="clin-lane__empty">No one here</p>
                  ) : (
                    <ul>
                      {g.patients.map((p) => (
                        <li key={p.id}>
                          <PatientChip p={p} divisionId={divisionId} grouping={grouping} today={today} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
          {hiddenEmpty > 0 && <p className="clin-note">{hiddenEmpty} empty {hiddenEmpty === 1 ? 'group is' : 'groups are'} not shown.</p>}
        </>
      )}

      {adding && (
        <PatientForm
          divisionId={divisionId}
          session={session}
          onClose={(id) => {
            setAdding(false);
            if (id) navigate(`/clinical/${divisionId}/patients/${id}`);
          }}
        />
      )}
      {fromFile && <AddFromFile divisionId={divisionId} session={session} onClose={() => setFromFile(false)} />}
    </>
  );
}

function Distribution({ groups, total, grouping }) {
  if (!total) return null;
  const parts = groups.filter((g) => g.patients.length);
  const title = labelOf(GROUPINGS, grouping);
  return (
    <figure className="clin-dist" aria-label={`Patients by ${title.toLowerCase()}`}>
      <div className="clin-dist__bar">
        {parts.map((g, i) => (
          <span key={g.id} className={`seg seg--${i % 6}`} style={{ flexGrow: g.patients.length, '--i': i }} title={`${g.label}: ${g.patients.length}`} />
        ))}
      </div>
      <figcaption>
        {parts.map((g, i) => (
          <span key={g.id} className="clin-dist__key">
            <i className={`seg--${i % 6}`} />
            {g.label} <b className="num">{g.patients.length}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function PatientChip({ p, divisionId, grouping, today }) {
  const div = DIVISIONS[divisionId];
  const secondary = grouping === 'diagnosis' ? labelOf(div.stages, p.stage) : labelOf(div.diagnoses, p.diagnosis);
  return (
    <a className="pt" {...linkTo(`/clinical/${divisionId}/patients/${p.id}`)}>
      <span className="pt__top">
        <b className="pt__name">{p.name}</b>
        <PriorityTag priority={p.priority} />
      </span>
      <span className="pt__meta">
        {p.reg_no && <span>{p.reg_no}</span>}
        {ageLabel(p, today) && <span>{ageLabel(p, today)}</span>}
        {p.sex && <span>{labelOf(SEXES, p.sex)}</span>}
      </span>
      <span className="pt__dx">{secondary}</span>
      <ReviewText date={p.next_review} today={today} status={p.status} />
    </a>
  );
}
