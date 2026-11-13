import React from 'react';

import { linkTo } from './api.js';

// Same sidebar as the admin portal. Portal pages open normally; the Clinical links stay in this app.
const PORTAL_NAV = [
  { section: 'Daily work' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/sales', label: 'Hearing Aid Sales' },
  { to: '/trials', label: 'HA Trials (HAT)' },
  { to: '/collections', label: 'Collections' },
  { to: '/orders', label: 'HA Orders' },
  { to: '/expenses', label: 'Expenses' },
  { section: 'Clinic' },
  { to: '/appointments', label: 'Appointments' },
  { to: '/reports', label: 'Test Reports' },
  { to: '/attendance', label: 'Attendance' },
  { section: 'Clinical', clinical: true },
  { to: '/clinical/audiology', label: 'Audiology', clinical: 'audiology' },
  { to: '/clinical/slp', label: 'Speech-Language Pathology', clinical: 'slp' },
  { section: 'Setup', adminOnly: true },
  { to: '/clinics', label: 'Clinics', adminOnly: true },
  { to: '/brands', label: 'Brands', adminOnly: true },
  { to: '/settings', label: 'Settings' },
];

export default function Shell({ session, divisionId, children }) {
  const { user, clinics } = session;
  const clinicName = user.canSeeAllClinics ? 'All clinics' : (clinics.find((c) => c.id === user.clinic_id)?.name || 'One clinic');

  async function signOut() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <i>श्री</i>
          <div>
            <b>Sri Rudra</b>
            <small>Admin Portal</small>
          </div>
        </div>
        {PORTAL_NAV.map((item, i) => {
          if (item.adminOnly && !user.canManageUsers) return null;
          if (item.section) return <div key={`s${i}`} className="sidebar__sect">{item.section}</div>;
          if (item.clinical) {
            return (
              <a key={item.to} {...linkTo(item.to)} className={item.clinical === divisionId ? 'active' : ''} aria-current={item.clinical === divisionId ? 'page' : undefined}>
                {item.label}
              </a>
            );
          }
          return <a key={item.to} href={item.to}>{item.label}</a>;
        })}
        <div className="sidebar__foot">
          <small>{user.full_name}</small>
          <small style={{ marginBottom: 8 }}>{clinicName}</small>
          <button type="button" className="btn btn--ghost clin-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
