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
  { to: '/clinical/master', label: 'Master control', clinical: 'master', adminOnly: true },
  { section: 'Setup', adminOnly: true },
  { to: '/clinics', label: 'Clinics', adminOnly: true },
  { to: '/brands', label: 'Brands', adminOnly: true },
  { to: '/settings', label: 'Settings' },
];

// "Install app" at the end of the sidebar, as on the portal pages. The install itself is done by
// /__srr/install.js (window.srrInstall); without it, or when no one-click install is available,
// the link opens the /install page. Hidden when the portal is already running as the app.
function InstallLink() {
  const api = window.srrInstall;
  const [mode, setMode] = React.useState(() => (api ? api.mode() : 'guide'));
  React.useEffect(() => (api ? api.onChange(() => setMode(api.mode())) : undefined), [api]);
  if (mode === 'installed') return null;
  return (
    <a href="/install" className="srr-install-link" onClick={(event) => { if (api && api.run()) event.preventDefault(); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11" />
        <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
        <path d="M5 20h14" />
      </svg>
      <span>Install app</span>
    </a>
  );
}

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
            const active = item.clinical === 'master' ? window.location.pathname.startsWith('/clinical/master') : (item.clinical === divisionId && !window.location.pathname.startsWith('/clinical/master'));
            return (
              <a key={item.to} {...linkTo(item.to)} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                {item.label}
              </a>
            );
          }
          return <a key={item.to} href={item.to}>{item.label}</a>;
        })}
        <InstallLink />
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
