import React, { useEffect, useState } from 'react';

import { portalApi } from './api.js';
import { AsyncButton, Icon, Input, Modal, Notice, Select } from './ui.jsx';

// Master control (owner / admin): every centre with its staff, in one place. Add staff, move them
// between centres, change their role, switch an account off, or set a new password. It works on the
// admin portal's own staff and centre records — the same ones the portal's own settings use.
const ROLES = [
  ['owner', 'Owner'],
  ['admin', 'Admin'],
  ['audiologist', 'Audiologist / SLP'],
  ['staff', 'Reception / staff'],
];
const roleLabel = (r) => (ROLES.find(([v]) => v === r)?.[1] || r);

export default function MasterControl({ session }) {
  const [clinics, setClinics] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editUser, setEditUser] = useState(null); // user object or {new:true}
  const [resetUser, setResetUser] = useState(null);
  const [addClinic, setAddClinic] = useState(false);

  const load = () => {
    setError('');
    Promise.all([portalApi('/clinics'), portalApi('/users')])
      .then(([c, u]) => { setClinics(c.rows || []); setUsers(u.rows || []); })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (!session.user.canManageUsers) {
    return <div className="head"><div><h1>Master control</h1><div className="sub">This page is for the clinic owner and admins.</div></div></div>;
  }

  const byClinic = (id) => (users || []).filter((u) => (id === null ? !u.clinic_id : u.clinic_id === id));
  const allAccess = byClinic(null);

  async function saveUser(form) {
    setMsg(''); setError('');
    try {
      if (form.id) {
        await portalApi(`/users/${form.id}`, { method: 'PATCH', body: { full_name: form.full_name, phone: form.phone, role: form.role, clinic_id: form.clinic_id || null, is_active: form.is_active ? 1 : 0 } });
        setMsg('Staff member updated.');
      } else {
        await portalApi('/users', { method: 'POST', body: { username: form.username, full_name: form.full_name, phone: form.phone, role: form.role, clinic_id: form.clinic_id || null, password: form.password } });
        setMsg(`Login created for ${form.username}. Give them the password you set — it is not shown again.`);
      }
      setEditUser(null); load();
    } catch (e) { setError(e.message); }
  }

  async function resetPassword(id, password) {
    setMsg(''); setError('');
    try {
      await portalApi(`/users/${id}`, { method: 'PATCH', body: { password } });
      setResetUser(null);
      setMsg('Password changed. Give the new password to the staff member — it is not shown again.');
    } catch (e) { setError(e.message); }
  }

  async function toggleActive(u) {
    try { await portalApi(`/users/${u.id}`, { method: 'PATCH', body: { is_active: u.is_active ? 0 : 1 } }); load(); } catch (e) { setError(e.message); }
  }

  const clinicName = (id) => clinics?.find((c) => c.id === id)?.name || '—';

  function StaffRow({ u }) {
    const isMe = u.id === session.user.id;
    return (
      <li className={`clin-staff ${u.is_active ? '' : 'is-off'}`}>
        <div className="clin-staff__id">
          <b>{u.full_name || u.username}</b>
          <span className="muted">@{u.username} · {roleLabel(u.role)}{u.phone ? ` · ${u.phone}` : ''}</span>
        </div>
        {!u.is_active && <span className="tag">Switched off</span>}
        <div className="clin-staff__act">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditUser({ ...u, is_active: !!u.is_active })}><Icon name="edit" size={15} />Edit</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setResetUser(u)}><Icon name="key" size={15} />Password</button>
          {!isMe && <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Switch off' : 'Switch on'}</button>}
        </div>
      </li>
    );
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Master control</h1>
          <div className="sub">Every centre and its staff. Add people, move them, change roles, switch accounts off, or set a new password.</div>
        </div>
        <div className="head__actions">
          <button type="button" className="btn btn--secondary" onClick={() => setAddClinic(true)}><Icon name="building" size={16} />Add centre</button>
          <button type="button" className="btn btn--primary" onClick={() => setEditUser({ new: true, role: 'audiologist', is_active: true, clinic_id: '' })}><Icon name="plus" size={16} />Add staff</button>
        </div>
      </div>

      <Notice>{error}</Notice>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {(clinics === null || users === null) ? <div className="empty">Loading…</div> : (
        <div className="clin-master">
          {allAccess.length > 0 && (
            <section className="card clin-centre clin-centre--all">
              <div className="clin-centre__head"><h2><Icon name="users" size={18} />All centres (full access)</h2><span className="clin-count num">{allAccess.length}</span></div>
              <ul className="clin-stafflist">{allAccess.map((u) => <StaffRow key={u.id} u={u} />)}</ul>
            </section>
          )}
          {clinics.map((c) => {
            const staff = byClinic(c.id);
            return (
              <section key={c.id} className="card clin-centre">
                <div className="clin-centre__head">
                  <h2><Icon name="building" size={18} />{c.name}</h2>
                  <span className="clin-count num">{staff.length}</span>
                </div>
                {c.city && <div className="clin-centre__sub">{[c.group_name, c.city].filter(Boolean).join(' · ')}{c.is_active ? '' : ' · inactive'}</div>}
                {staff.length === 0 ? <p className="muted">No staff assigned to this centre yet.</p>
                  : <ul className="clin-stafflist">{staff.map((u) => <StaffRow key={u.id} u={u} />)}</ul>}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditUser({ new: true, role: 'audiologist', is_active: true, clinic_id: String(c.id) })}><Icon name="plus" size={14} />Add staff here</button>
              </section>
            );
          })}
        </div>
      )}

      {editUser && <StaffForm user={editUser} clinics={clinics || []} onSave={saveUser} onClose={() => setEditUser(null)} />}
      {resetUser && <ResetForm user={resetUser} onReset={resetPassword} onClose={() => setResetUser(null)} />}
      {addClinic && <ClinicForm onClose={(saved) => { setAddClinic(false); if (saved) load(); }} onError={setError} />}
    </>
  );
}

function suggestPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint32Array(10));
  return 'Sri' + Array.from(arr, (n) => chars[n % chars.length]).join('') + '!';
}

function StaffForm({ user, clinics, onSave, onClose }) {
  const isNew = user.new;
  const [form, setForm] = useState({ id: user.id, username: user.username || '', full_name: user.full_name || '', phone: user.phone || '', role: user.role || 'audiologist', clinic_id: user.clinic_id ? String(user.clinic_id) : '', is_active: user.is_active !== false && user.is_active !== 0, password: isNew ? suggestPassword() : '' });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState('');
  return (
    <Modal title={isNew ? 'Add staff member' : `Edit ${form.full_name || form.username}`} onClose={onClose} wide>
      <div className="grid2">
        <label className="field"><span>Full name</span><Input value={form.full_name} onChange={set('full_name')} autoFocus /></label>
        <label className="field"><span>Phone</span><Input value={form.phone} onChange={set('phone')} inputMode="tel" /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Role</span><Select value={form.role} onChange={set('role')} options={ROLES} /></label>
        <label className="field"><span>Centre</span><Select value={form.clinic_id} onChange={set('clinic_id')} options={clinics.map((c) => [String(c.id), c.name])} placeholder="All centres (full access)" /></label>
      </div>
      {isNew ? (
        <>
          <div className="grid2">
            <label className="field"><span>Username (for login)</span><Input value={form.username} onChange={set('username')} autoComplete="off" /></label>
            <label className="field"><span>Password</span><Input value={form.password} onChange={set('password')} autoComplete="off" /></label>
          </div>
          <p className="clin-sec__hint">A strong password is suggested. Change it if you like, then give it to the staff member — it is not shown again. <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('password')(suggestPassword())}>Suggest another</button></p>
        </>
      ) : (
        <label className="clin-check"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active')(e.target.checked)} /><span>Account is active (can sign in)</span></label>
      )}
      <Notice>{error}</Notice>
      <div className="modal__foot">
        <span className="spacer" />
        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <AsyncButton busyLabel="Saving…" onClick={async () => {
          if (isNew && (!form.username.trim() || form.password.length < 8)) { setError('Enter a username and a password of at least 8 characters.'); return; }
          if (!form.full_name.trim()) { setError('Enter the staff member’s name.'); return; }
          await onSave(form);
        }}>{isNew ? 'Create login' : 'Save changes'}</AsyncButton>
      </div>
    </Modal>
  );
}

function ResetForm({ user, onReset, onClose }) {
  const [password, setPassword] = useState(suggestPassword());
  const [error, setError] = useState('');
  return (
    <Modal title={`New password for ${user.full_name || user.username}`} onClose={onClose}>
      <p className="sub">Set a new password and give it to the staff member. The old one stops working. Existing passwords can’t be shown — only replaced.</p>
      <label className="field field--wide"><span>New password</span><Input value={password} onChange={setPassword} autoComplete="off" /></label>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPassword(suggestPassword())}>Suggest another</button>
      <Notice>{error}</Notice>
      <div className="modal__foot">
        <span className="spacer" />
        <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
        <AsyncButton busyLabel="Saving…" onClick={async () => { if (password.length < 8) { setError('Use at least 8 characters.'); return; } await onReset(user.id, password); }}>Set password</AsyncButton>
      </div>
    </Modal>
  );
}

function ClinicForm({ onClose, onError }) {
  const [form, setForm] = useState({ name: '', group_name: '', city: '' });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState('');
  return (
    <Modal title="Add a centre" onClose={() => onClose(false)}>
      <label className="field field--wide"><span>Centre name</span><Input value={form.name} onChange={set('name')} autoFocus /></label>
      <div className="grid2">
        <label className="field"><span>Group (optional)</span><Input value={form.group_name} onChange={set('group_name')} /></label>
        <label className="field"><span>City</span><Input value={form.city} onChange={set('city')} /></label>
      </div>
      <Notice>{error}</Notice>
      <div className="modal__foot">
        <span className="spacer" />
        <button type="button" className="btn btn--secondary" onClick={() => onClose(false)}>Cancel</button>
        <AsyncButton busyLabel="Saving…" onClick={async () => {
          if (!form.name.trim()) { setError('Enter the centre name.'); return; }
          try { await portalApi('/clinics', { method: 'POST', body: { ...form, is_active: 1, sort_order: 100 } }); onClose(true); } catch (e) { setError(e.message); }
        }}>Add centre</AsyncButton>
      </div>
    </Modal>
  );
}
