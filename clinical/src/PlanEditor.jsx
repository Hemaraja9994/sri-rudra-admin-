import React, { useEffect, useRef, useState } from 'react';

import { DIVISIONS, prettyDate } from '../../shared/clinical.js';
import { PER_WEEK, checkpoints, scheduleLine, sessionDates } from '../../shared/plans.js';
import { api, linkTo, navigate } from './api.js';
import PlanSheet from './PlanSheet.jsx';
import { AsyncButton, Icon, Input, Notice, Select, TextArea } from './ui.jsx';

// The therapy-plan editor: set the shape, let the AI draft the framework, goals and every session,
// edit freely, tick sessions off as they are done and record progress, then print.
export default function PlanEditor({ divisionId, id, session }) {
  const [state, setState] = useState(null); // { plan, patient, report }
  const [plan, setPlan] = useState(null);     // plan_json
  const [progress, setProgress] = useState(null);
  const [head, setHead] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [aiStatus, setAiStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const aiUsed = useRef(false);

  useEffect(() => {
    api(`/plans/${id}`).then((d) => {
      setState(d);
      setPlan(d.plan.plan);
      setProgress(d.plan.progress);
      setHead({ title: d.plan.title, sessions_count: d.plan.sessions_count, minutes: d.plan.minutes ?? '', per_week: d.plan.per_week ?? '', start_date: d.plan.start_date || '', focus: d.plan.focus || '', status: d.plan.status });
    }).catch((e) => setError(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !state) return <><Back divisionId={divisionId} /><Notice>{error}</Notice></>;
  if (!state || !plan) return <><Back divisionId={divisionId} /><div className="empty">Loading…</div></>;

  const { patient, report } = state;
  const n = Number(head.sessions_count) || plan.sessions.length;
  const dates = sessionDates(head.start_date, n, Number(head.per_week) || 1);
  const points = checkpoints(n);
  const setHeadField = (k) => (v) => { setHead((h) => ({ ...h, [k]: v })); setDirty(true); };
  const editPlan = (fn) => { setPlan((p) => { const next = structuredClone(p); fn(next); return next; }); setDirty(true); };
  const editProgress = (fn) => { setProgress((p) => { const next = structuredClone(p); fn(next); return next; }); setDirty(true); };

  async function save(nextStatus) {
    setError(''); setMsg('');
    const body = { ...head, minutes: head.minutes === '' ? null : Number(head.minutes), per_week: head.per_week === '' ? null : Number(head.per_week), sessions_count: Number(head.sessions_count), plan, progress, ai_used: aiUsed.current };
    if (nextStatus) body.status = nextStatus;
    const res = await api(`/plans/${id}`, { method: 'PATCH', body });
    setState((s) => ({ ...s, plan: res.plan }));
    setPlan(res.plan.plan); setProgress(res.plan.progress);
    setHead((h) => ({ ...h, status: res.plan.status }));
    aiUsed.current = false; setDirty(false);
    setMsg('Saved.');
  }

  async function draftAll() {
    setError(''); setMsg('');
    try {
      setAiStatus('Drafting the framework and goals…');
      let res = await api(`/plans/${id}/ai`, { method: 'POST', body: { part: 'outline' } });
      setPlan(res.plan.plan); aiUsed.current = true;
      for (let from = 1; from <= n; from += 4) {
        const to = Math.min(n, from + 3);
        setAiStatus(`Drafting sessions ${from}–${to} of ${n}…`);
        res = await api(`/plans/${id}/ai`, { method: 'POST', body: { part: 'sessions', from, to } }); // eslint-disable-line no-await-in-loop
        setPlan(res.plan.plan);
      }
      setAiStatus('');
      setMsg('AI draft ready — please read and edit it, then Save.');
    } catch (e) { setAiStatus(''); setError(e.message); }
  }

  const doneCount = Object.keys(progress.done || {}).length;

  return (
    <>
      <Back divisionId={divisionId} patient={patient} />
      <div className="head clin-rhead">
        <div>
          <h1>{head.title}</h1>
          <div className="sub clin-idline">
            <span>{patient.name}</span>
            {patient.reg_no && <span>{patient.reg_no}</span>}
            <span>{scheduleLine({ minutes: head.minutes, per_week: head.per_week, sessions_count: n }) || `${n} sessions`}</span>
            <span>{doneCount}/{n} done</span>
            {dirty && <span className="muted">unsaved changes</span>}
          </div>
        </div>
        <div className="head__actions">
          <AsyncButton className="btn btn--secondary" busyLabel="Drafting…" onClick={draftAll} title="Draft the whole plan"><Icon name="ai" size={16} />Draft with AI</AsyncButton>
          <button type="button" className="btn btn--secondary" onClick={() => window.print()}><Icon name="printer" size={16} />Print / PDF</button>
          <AsyncButton className="btn btn--primary" busyLabel="Saving…" onClick={() => save()}><Icon name="save" size={16} />Save</AsyncButton>
        </div>
      </div>

      <Notice>{error}</Notice>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {aiStatus && <p className="clin-aistatus"><span className="clin-spin" />{aiStatus}</p>}

      <div className="card clin-rfields">
        <div className="grid3">
          <label className="field field--wide"><span>Plan title</span><Input value={head.title} onChange={setHeadField('title')} /></label>
          <label className="field"><span>Status</span><Select value={head.status} onChange={setHeadField('status')} options={[['draft', 'Draft'], ['active', 'In progress'], ['completed', 'Completed']]} /></label>
        </div>
        <div className="grid3">
          <label className="field"><span>Sessions</span><Input value={head.sessions_count} onChange={setHeadField('sessions_count')} inputMode="numeric" /></label>
          <label className="field"><span>Minutes each</span><Input value={head.minutes} onChange={setHeadField('minutes')} inputMode="numeric" /></label>
          <label className="field"><span>How often</span><Select value={String(head.per_week)} onChange={setHeadField('per_week')} options={PER_WEEK.map(([v, l]) => [String(v), l])} placeholder="—" /></label>
          <label className="field"><span>Start date</span><Input type="date" value={head.start_date} onChange={setHeadField('start_date')} /></label>
        </div>
        {report && <p className="clin-sec__hint">Based on report {report.report_no} ({prettyDate(report.report_date)}).</p>}
      </div>

      <Block title="Framework">
        <TextArea value={plan.framework.intro} onChange={(v) => editPlan((p) => { p.framework.intro = v; })} rows={2} placeholder="One line introducing the approach." />
        <Lines label="Components of the programme" value={plan.framework.points} onChange={(v) => editPlan((p) => { p.framework.points = v; })} />
      </Block>

      <Block title="Long-term goals"><Lines value={plan.goals} onChange={(v) => editPlan((p) => { p.goals = v; })} /></Block>

      <Block title="Session structure">
        <Lines label="Each session" value={plan.structure.items} onChange={(v) => editPlan((p) => { p.structure.items = v; })} hint="e.g. Warm-up and review – 5 minutes" />
        <label className="field field--wide"><span>Home practice note</span><Input value={plan.structure.home_note} onChange={(v) => editPlan((p) => { p.structure.home_note = v; })} /></label>
      </Block>

      <section className="clin-sessions">
        <h3 className="clin-sessions__title">Sessions</h3>
        {plan.sessions.map((s, i) => (
          <SessionCard key={s.n} s={s} date={dates[i]} isCheckpoint={points.includes(s.n)} done={progress.done[s.n]}
            onEdit={(fn) => editPlan((p) => fn(p.sessions[i]))}
            onDone={(v) => editProgress((pr) => { if (v) pr.done[s.n] = v; else delete pr.done[s.n]; })} />
        ))}
      </section>

      <Block title="Discharge criteria">
        <Lines value={plan.discharge.criteria} onChange={(v) => editPlan((p) => { p.discharge.criteria = v; })} />
        <label className="field field--wide"><span>If criteria are not met</span><Input value={plan.discharge.otherwise} onChange={(v) => editPlan((p) => { p.discharge.otherwise = v; })} /></label>
      </Block>

      <ProgressSheet measures={plan.measures} points={points} values={progress.values}
        onMeasures={(v) => editPlan((p) => { p.measures = v; })}
        onValue={(measure, col, v) => editProgress((pr) => { pr.values[measure] = { ...(pr.values[measure] || {}), [col]: v }; })} />

      <Block title="Home-practice card"><Lines value={plan.home_card} onChange={(v) => editPlan((p) => { p.home_card = v; })} hint="Short daily instructions in plain words for the patient." /></Block>

      <div className="clin-rfoot">
        <AsyncButton className="btn btn--primary" busyLabel="Saving…" onClick={() => save()}><Icon name="save" size={16} />Save plan</AsyncButton>
        {(session.user.canManageUsers || state.plan.created_by === session.user.id) && (
          <button type="button" className="btn btn--danger btn--ghost" onClick={async () => {
            if (!window.confirm('Delete this therapy plan?')) return;
            try { await api(`/plans/${id}`, { method: 'DELETE' }); navigate(`/clinical/${patient.division}/patients/${patient.id}`); } catch (e) { setError(e.message); }
          }}><Icon name="trash" size={16} />Delete</button>
        )}
      </div>

      <PlanSheet plan={plan} head={{ ...head, sessions_count: n }} progress={progress} patient={patient} dates={dates} points={points} />
    </>
  );
}

function Back({ divisionId, patient }) {
  const to = patient ? `/clinical/${patient.division}/patients/${patient.id}` : `/clinical/${divisionId}`;
  return <a className="clin-back" {...linkTo(to)}><Icon name="back" size={18} />{patient ? patient.name : `${DIVISIONS[divisionId].label} caseload`}</a>;
}

function Block({ title, children }) {
  return <section className="card clin-sec"><div className="clin-sec__head"><h3>{title}</h3></div><div className="clin-sec__body">{children}</div></section>;
}

function Lines({ label, value, onChange, hint }) {
  return (
    <label className="field field--wide">
      {label && <span>{label}</span>}
      <TextArea value={(value || []).join('\n')} onChange={(v) => onChange(v.split('\n').map((x) => x.replace(/^\s*[-•]\s*/, '')))} rows={Math.max(3, (value || []).length + 1)} placeholder="One per line." />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function SessionCard({ s, date, isCheckpoint, done, onEdit, onDone }) {
  return (
    <div className={`clin-session ${done ? 'is-done' : ''}`}>
      <div className="clin-session__top">
        <span className="clin-session__n">{s.n}</span>
        <Input value={s.title} onChange={(v) => onEdit((x) => { x.title = v; })} placeholder={`Session ${s.n} focus`} className="clin-session__title" />
        {isCheckpoint && <span className="tag tag--warn">Progress check</span>}
        <label className="clin-check clin-session__done">
          <input type="checkbox" checked={!!done} onChange={(e) => onDone(e.target.checked ? { date: date || '', note: '' } : null)} />
          <span>Done</span>
        </label>
      </div>
      {date && <div className="clin-session__date">Planned: {prettyDate(date)}</div>}
      <div className="clin-session__grid">
        <Lines label="Goals" value={s.goals} onChange={(v) => onEdit((x) => { x.goals = v; })} />
        <Lines label="Baseline to record" value={s.baseline} onChange={(v) => onEdit((x) => { x.baseline = v; })} />
        <Lines label="Activities" value={s.activities} onChange={(v) => onEdit((x) => { x.activities = v; })} />
        <Lines label="Home practice" value={s.home} onChange={(v) => onEdit((x) => { x.home = v; })} />
      </div>
      {done && (
        <label className="field field--wide clin-session__note"><span>What was done this session</span>
          <Input value={done.note || ''} onChange={(v) => onDone({ ...done, note: v })} placeholder="Short note (added to the timeline)" /></label>
      )}
    </div>
  );
}

function ProgressSheet({ measures, points, values, onMeasures, onValue }) {
  return (
    <section className="card clin-sec">
      <div className="clin-sec__head"><h3>Progress data sheet</h3></div>
      <div className="clin-sec__body">
        <Lines label="Measures to record" value={measures} onChange={onMeasures} />
        {measures.length > 0 && (
          <div className="clin-tablewrap">
            <table className="clin-etable">
              <thead><tr><th>Measure</th>{points.map((p) => <th key={p}>Session {p}</th>)}</tr></thead>
              <tbody>
                {measures.map((m) => (
                  <tr key={m}><th scope="row">{m}</th>
                    {points.map((p) => <td key={p}><Input value={values?.[m]?.[`s${p}`] || ''} onChange={(v) => onValue(m, `s${p}`, v)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
