import React from 'react';

import { AUDIOGRAM_FREQS, ptaAverage, degreeLabel } from '../../shared/reports.js';

// A standard audiogram plot for one ear: frequency (octaves) across, hearing level (dB HL) down.
// Red / right-ear symbols O (air) and < (bone); blue / left-ear symbols X (air) and > (bone).
// Right and left are drawn as separate charts (see AudiogramPair), as on a clinical audiogram.
const FREQS = AUDIOGRAM_FREQS;            // 250, 500, 1000, 2000, 4000, 8000
const DB_MIN = -10;
const DB_MAX = 120;
const W = 250;
const H = 270;
const L = 30;
const R = 8;
const T = 16;
const B = 30;

const fx = (i) => L + (i / (FREQS.length - 1)) * (W - L - R);
const fy = (db) => T + ((db - DB_MIN) / (DB_MAX - DB_MIN)) * (H - T - B);
const freqLabel = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

function num(v) {
  const s = String(v ?? '').trim();
  if (!s || /^(nr|cnt|dne|no response)$/i.test(s)) return { nr: /^(nr|cnt|dne|no response)$/i.test(s) };
  const n = Number(s);
  return Number.isFinite(n) ? { db: n } : {};
}

function points(row) {
  return FREQS.map((f, i) => ({ i, f, ...num(row?.[f]) }));
}

// air-conduction symbol (O right / X left), bone-conduction symbol (< right / > left)
function Symbol({ cx, cy, ear, air }) {
  const c = ear === 'right' ? '#c0392b' : '#1f5fa8';
  if (air) {
    return ear === 'right'
      ? <circle cx={cx} cy={cy} r="5.5" fill="none" stroke={c} strokeWidth="1.6" />
      : <g stroke={c} strokeWidth="1.8"><line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} /><line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} /></g>;
  }
  const d = ear === 'right' ? `M${cx + 4},${cy - 5} L${cx - 4},${cy} L${cx + 4},${cy + 5}` : `M${cx - 4},${cy - 5} L${cx + 4},${cy} L${cx - 4},${cy + 5}`;
  return <path d={d} fill="none" stroke={c} strokeWidth="1.6" />;
}

export function AudiogramChart({ ear, ac, bc }) {
  const color = ear === 'right' ? '#c0392b' : '#1f5fa8';
  const acPts = points(ac);
  const bcPts = points(bc);
  const line = acPts.filter((p) => p.db != null);
  const pta = ptaAverage(ac);
  return (
    <figure className="clin-audio">
      <figcaption style={{ color }}>{ear === 'right' ? 'Right ear' : 'Left ear'}{pta !== null ? ` — PTA ${pta} dB HL (${degreeLabel(pta)})` : ''}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ear} ear audiogram`} className="clin-audio__svg">
        {/* dB gridlines + labels */}
        {Array.from({ length: (DB_MAX - DB_MIN) / 20 + 1 }, (_, k) => DB_MIN + k * 20).map((db) => (
          <g key={db}>
            <line x1={L} y1={fy(db)} x2={W - R} y2={fy(db)} stroke={db === 20 ? '#9aa7b4' : '#e2e8ef'} strokeWidth={db === 20 ? 1 : 0.8} strokeDasharray={db === 20 ? '3 2' : ''} />
            <text x={L - 4} y={fy(db) + 3} textAnchor="end" fontSize="8" fill="#64748b">{db}</text>
          </g>
        ))}
        {/* frequency gridlines + labels */}
        {FREQS.map((f, i) => (
          <g key={f}>
            <line x1={fx(i)} y1={T} x2={fx(i)} y2={H - B} stroke="#e2e8ef" strokeWidth="0.8" />
            <text x={fx(i)} y={H - B + 12} textAnchor="middle" fontSize="8" fill="#64748b">{freqLabel(f)}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="7.5" fill="#94a3b8">Frequency (Hz)</text>
        {/* AC connecting line */}
        {line.length > 1 && <polyline points={line.map((p) => `${fx(p.i)},${fy(p.db)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.3" />}
        {/* bone then air symbols */}
        {bcPts.filter((p) => p.db != null).map((p) => <Symbol key={`b${p.f}`} cx={fx(p.i) + (ear === 'right' ? -7 : 7)} cy={fy(p.db)} ear={ear} air={false} />)}
        {acPts.filter((p) => p.db != null).map((p) => <Symbol key={`a${p.f}`} cx={fx(p.i)} cy={fy(p.db)} ear={ear} air />)}
        {/* NR markers (air) */}
        {acPts.filter((p) => p.nr).map((p) => (
          <text key={`nr${p.f}`} x={fx(p.i)} y={fy(DB_MAX) - 2} textAnchor="middle" fontSize="7" fill={color}>NR</text>
        ))}
      </svg>
    </figure>
  );
}

// Both ears, side by side, each its own plot.
export default function AudiogramPair({ value }) {
  const v = value || {};
  const any = ['ac_r', 'ac_l', 'bc_r', 'bc_l'].some((k) => v[k] && Object.values(v[k]).some((x) => String(x || '').trim()));
  if (!any) return null;
  return (
    <div className="clin-audio-pair">
      <AudiogramChart ear="right" ac={v.ac_r} bc={v.bc_r} />
      <AudiogramChart ear="left" ac={v.ac_l} bc={v.bc_l} />
    </div>
  );
}
