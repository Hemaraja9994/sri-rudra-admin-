import React from 'react';

import { prettyDate } from '../../shared/clinical.js';
import { CLINIC, dmy } from '../../shared/reports.js';
import { scheduleLine } from '../../shared/plans.js';

// The printable therapy plan. Hidden on screen; window.print() shows it.
export default function PlanSheet({ plan, head, progress, patient, dates, points }) {
  const li = (arr) => (arr || []).filter(Boolean);
  return (
    <div className="clin-print" aria-hidden="true">
      <article className="rsheet">
        <header className="rsheet__head">
          <img className="rsheet__logo" src="/__srr/logo.jpg" alt="" />
          <div className="rsheet__id">
            <h1>{CLINIC.name}</h1>
            <div className="rsheet__svc">{CLINIC.services.join(' · ')}</div>
            <div className="rsheet__contact">{CLINIC.address.join(' ')}<br />{CLINIC.phone} · {CLINIC.web}</div>
          </div>
        </header>
        <div className="rsheet__rule" />

        <h2 className="rsheet__title">{head.title}</h2>
        <table className="rsheet__case"><tbody>
          <tr><th>Patient</th><td>{patient.name}{patient.reg_no ? ` · ${patient.reg_no}` : ''}</td></tr>
          <tr><th>Schedule</th><td>{scheduleLine({ minutes: head.minutes, per_week: head.per_week, sessions_count: head.sessions_count }) || `${head.sessions_count} sessions`}{head.start_date ? ` · from ${dmy(head.start_date)}` : ''}</td></tr>
        </tbody></table>

        {plan.framework.intro && <p className="rsheet__text">{plan.framework.intro}</p>}
        {li(plan.framework.points).length > 0 && <ul className="rsheet__list">{li(plan.framework.points).map((p, i) => <li key={i}>{p}</li>)}</ul>}

        {li(plan.goals).length > 0 && (
          <section className="rsheet__sec"><h3>Long-term goals</h3><ul className="rsheet__list">{li(plan.goals).map((g, i) => <li key={i}>{g}</li>)}</ul></section>
        )}

        {li(plan.structure.items).length > 0 && (
          <section className="rsheet__sec"><h3>Session structure</h3>
            <ul className="rsheet__list">{li(plan.structure.items).map((g, i) => <li key={i}>{g}</li>)}</ul>
            {plan.structure.home_note && <p className="rsheet__text"><b>Home practice:</b> {plan.structure.home_note}</p>}
          </section>
        )}

        <section className="rsheet__sec rsheet__sessions">
          <h3>Session plan</h3>
          {plan.sessions.map((s, i) => (
            <div key={s.n} className="rsheet__session">
              <h4>Session {s.n}{s.title ? `: ${s.title}` : ''}{dates[i] ? ` — ${dmy(dates[i])}` : ''}{points.includes(s.n) ? '  (progress check)' : ''}{progress.done[s.n] ? '  ✓ done' : ''}</h4>
              {li(s.goals).length > 0 && <p><b>Goals:</b> {li(s.goals).join('; ')}</p>}
              {li(s.baseline).length > 0 && <p><b>Baseline:</b> {li(s.baseline).join('; ')}</p>}
              {li(s.activities).length > 0 && <ul className="rsheet__list">{li(s.activities).map((a, j) => <li key={j}>{a}</li>)}</ul>}
              {li(s.home).length > 0 && <p><b>Home practice:</b> {li(s.home).join('; ')}</p>}
            </div>
          ))}
        </section>

        {li(plan.discharge.criteria).length > 0 && (
          <section className="rsheet__sec"><h3>Discharge criteria</h3>
            <ul className="rsheet__list">{li(plan.discharge.criteria).map((c, i) => <li key={i}>{c}</li>)}</ul>
            {plan.discharge.otherwise && <p className="rsheet__text">If not met: {plan.discharge.otherwise}</p>}
          </section>
        )}

        {li(plan.measures).length > 0 && (
          <section className="rsheet__sec"><h3>Progress data sheet</h3>
            <table className="rsheet__table">
              <thead><tr><th>Measure</th>{points.map((p) => <th key={p}>Session {p}</th>)}</tr></thead>
              <tbody>{li(plan.measures).map((m) => <tr key={m}><th>{m}</th>{points.map((p) => <td key={p}>{progress.values?.[m]?.[`s${p}`] || ''}</td>)}</tr>)}</tbody>
            </table>
          </section>
        )}

        {li(plan.home_card).length > 0 && (
          <section className="rsheet__sec rsheet__homecard"><h3>Home practice</h3>
            <ul className="rsheet__list">{li(plan.home_card).map((h, i) => <li key={i}>{h}</li>)}</ul>
          </section>
        )}
        <footer className="rsheet__foot">Prepared at {CLINIC.name}. Home practice is most effective when done daily as advised.</footer>
      </article>
    </div>
  );
}
