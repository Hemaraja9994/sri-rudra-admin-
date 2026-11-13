import React, { cloneElement, useEffect, useId } from 'react';

import { PRIORITIES, labelOf, reviewBucket, reviewLabel } from '../../shared/clinical.js';

// Same markup as the portal's own forms: label and control side by side, linked by id.
export function Field({ label, hint, children, className = '' }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
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
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
    </div>
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
};

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
