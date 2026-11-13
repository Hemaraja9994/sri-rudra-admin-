import React, { cloneElement, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

import { PRIORITIES, labelOf, reviewBucket, reviewLabel } from '../../shared/clinical.js';

// Same markup as the portal's own forms: label and control side by side, linked by id.
export function Field({ label, hint, children, className = '', badge }) {
  const id = useId();
  return (
    <div className={`field ${className} ${badge ? 'field--badge' : ''}`}>
      <label htmlFor={id}>{label}{badge && <span className="field-badge">{badge}</span>}</label>
      {cloneElement(children, { id })}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Input({ value, onChange, ...props }) {
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props} />;
}

export function TextArea({ value, onChange, rows = 3, ...props }) {
  return <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props} />;
}

export function Select({ value, onChange, options, placeholder, ...props }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

export function Notice({ kind = 'err', children }) {
  if (!children) return null;
  return <div className={`notice notice--${kind}`} role={kind === 'err' ? 'alert' : 'status'}>{children}</div>;
}

export function Modal({ title, sub, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Rendered into <body> through a portal: the clinical pages animate every .card with a transform,
  // which would otherwise trap this position:fixed overlay inside the card it was opened from.
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ReviewText({ date, today, status }) {
  if (status === 'discharged') return <span className="rv rv--later">Discharged</span>;
  const bucket = reviewBucket(date, today);
  const tone = bucket === 'overdue' ? 'rv--overdue' : bucket === 'today' || bucket === 'week' ? 'rv--soon' : 'rv--later';
  return <span className={`rv ${tone}`}>{reviewLabel(date, today)}</span>;
}

export function PriorityTag({ priority }) {
  if (!priority || priority === 'routine') return null;
  return <span className={`tag ${priority === 'urgent' ? 'tag--err' : 'tag--warn'}`}>{labelOf(PRIORITIES, priority)}</span>;
}

// Simple line icons (lucide shapes, drawn inline so the bundle stays small).
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
  chat: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  back: 'm15 18-6-6 6-6',
  ear: 'M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 0 1-7 0M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4',
  speech: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  check: 'M20 6 9 17l-5-5',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  report: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4',
  plan: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M9 16l2 2 4-4',
  ai: 'M12 3l1.6 4.2L18 8.8l-3.4 2.4 1.2 4.3L12 13.5 8.2 15.5l1.2-4.3L6 8.8l4.4-1.6zM5 17l.8 2L8 20l-2.2.9L5 23l-.8-2L2 20l2.2-1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M19 21V9a2 2 0 0 0-2-2M9 7h2M9 11h2M9 15h2',
  chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-8',
  key: 'M12.6 11.4A5.5 5.5 0 1 0 5 19a5.5 5.5 0 0 0 7.6-7.6zM12.6 11.4 21 3M16 8l3 3',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  close: 'M18 6 6 18M6 6l12 12',
  chevron: 'm9 18 6-6-6-6',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
};

export function Spinner({ label }) {
  return <span className="clin-spin" role="status" aria-live="polite">{label || 'Working…'}</span>;
}

// A small button that shows a working state while an async action runs.
export function AsyncButton({ onClick, children, busyLabel = 'Working…', className = 'btn btn--primary', ...props }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy || props.disabled}
      onClick={async (e) => {
        setBusy(true);
        try { await onClick(e); } finally { setBusy(false); }
      }}
      {...props}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function whatsappHref(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
