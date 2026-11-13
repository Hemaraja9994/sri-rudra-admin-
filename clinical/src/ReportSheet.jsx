import React from 'react';

import {
  AUDIOGRAM_FREQS,
  AUDIOGRAM_ROWS,
  CASE_FIELDS,
  CLINIC,
  degreeLabel,
  dmy,
  isIncluded,
  protocolFor,
  ptaAverage,
} from '../../shared/reports.js';
import AudiogramPair from './AudiogramChart.jsx';

// The printable report. Hidden on screen (see clinical.css @media print); window.print() shows it.
export default function ReportSheet({ tpl, report, data, patient }) {
  const caseRows = CASE_FIELDS.filter(([k]) => data.case?.[k]);
  return (
    <div className="clin-print" aria-hidden="true">
      <article className="rsheet">
        <header className="rsheet__head">
          <img className="rsheet__logo" src="/__srr/logo.jpg" alt="" />
          <div className="rsheet__id">
            <h1>{CLINIC.name}</h1>
            <div className="rsheet__svc">{CLINIC.services.join(' · ')}</div>
            <div className="rsheet__contact">
              {CLINIC.address.join(' ')}<br />
              {CLINIC.phone} · {CLINIC.web}
            </div>
          </div>
        </header>
        <div className="rsheet__rule" />

        <div className="rsheet__meta">
          <div><b>{report.report_no}</b></div>
          <div>Date: {dmy(report.report_date)}{report.valid_until ? ` · Valid until: ${dmy(report.valid_until)}` : ''}</div>
        </div>
        <h2 className="rsheet__title">{report.title}</h2>

        {caseRows.length > 0 && (
          <table className="rsheet__case"><tbody>
            {caseRows.map(([k, label]) => (
              <tr key={k}><th>{label}</th><td>{data.case[k]}</td></tr>
            ))}
          </tbody></table>
        )}

        {tpl.sections.map((s) => (isIncluded(tpl, data, s.key) && hasContent(s, data[s.key]) ? (
          <section key={s.key} className="rsheet__sec">
            <h3>{s.title}</h3>
            <SectionView section={s} value={data[s.key]} />
          </section>
        ) : null))}

        <div className="rsheet__sign">
          <div className="rsheet__signline">
            <b>{report.clinician || ''}</b>
            {report.qualification && <span>{report.qualification}</span>}
            {report.rci_no && <span>RCI Reg. No. {report.rci_no}</span>}
          </div>
        </div>
        <footer className="rsheet__foot">
          This report is based on the tests recorded above and should be read with the clinical history. Valid for medical and rehabilitative purposes only.
        </footer>
      </article>
    </div>
  );
}

function hasContent(section, value) {
  switch (section.kind) {
    case 'fields': return value && Object.values(value).some((v) => String(v || '').trim());
    case 'table': case 'freetable': return Array.isArray(value) && value.some((r) => r.some((c) => String(c || '').trim()));
    case 'audiogram': return value && AUDIOGRAM_ROWS.some(([k]) => value[k] && Object.values(value[k]).some((v) => String(v || '').trim()));
    case 'list': case 'protocol': return Array.isArray(value) && value.length > 0;
    default: return String(value || '').trim().length > 0;
  }
}

function SectionView({ section, value }) {
  if (section.kind === 'fields') {
    return (
      <table className="rsheet__fields"><tbody>
        {section.fields.filter(([k]) => String(value?.[k] || '').trim()).map(([k, label]) => (
          <tr key={k}><th>{label}</th><td>{value[k]}</td></tr>
        ))}
      </tbody></table>
    );
  }
  if (section.kind === 'table') {
    const rows = section.rows.map((r, i) => [r, section.columns.map((_, j) => value?.[i]?.[j] || '')]).filter(([, cells]) => cells.some((c) => String(c).trim()));
    if (!rows.length) return null;
    return (
      <table className="rsheet__table">
        <thead><tr><th /> {section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(([r, cells]) => <tr key={r}><th>{r}</th>{cells.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (section.kind === 'freetable') {
    const rows = (value || []).filter((r) => r.some((c) => String(c).trim()));
    return (
      <table className="rsheet__table">
        <thead><tr>{section.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (section.kind === 'audiogram') {
    return (
      <>
        <div className="rsheet__plots"><AudiogramPair value={value} /></div>
        <table className="rsheet__table rsheet__audiogram">
          <thead><tr><th>dB HL</th>{AUDIOGRAM_FREQS.map((f) => <th key={f}>{f >= 1000 ? `${f / 1000}k` : f}</th>)}<th>PTA</th></tr></thead>
          <tbody>
            {AUDIOGRAM_ROWS.map(([rk, label]) => {
              const row = value?.[rk] || {};
              const pta = ptaAverage(row);
              return (
                <tr key={rk}><th>{label}</th>
                  {AUDIOGRAM_FREQS.map((f) => <td key={f}>{row[f] ?? ''}</td>)}
                  <td>{rk.startsWith('ac') && pta !== null ? `${pta} (${degreeLabel(pta)})` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }
  if (section.kind === 'list') {
    return <ul className="rsheet__list">{(value || []).map((i, n) => <li key={n}>{i}</li>)}</ul>;
  }
  if (section.kind === 'protocol') {
    const proto = protocolFor(section.protocol);
    const ticked = new Set(value || []);
    const labels = proto ? proto.groups.flatMap((g) => g.steps).filter(([id]) => ticked.has(id)) : [];
    return <p className="rsheet__proto">Assessment carried out as per standard protocol: {labels.map(([, l]) => l).join('; ')}.</p>;
  }
  return <p className="rsheet__text">{value}</p>;
}
