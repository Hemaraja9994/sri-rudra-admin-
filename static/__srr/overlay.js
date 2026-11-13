// Small additions to the existing admin portal pages (added by the portal-plus Worker):
// 1. a "Clinical" section in the sidebar with the Audiology and SLP clinician dashboards;
// 2. "Install app": a card under the sign-in form and a link at the end of the sidebar
//    (the install itself is handled by install.js);
// 3. a thin reading-progress line for browsers without CSS scroll timelines.
// It only adds new elements; it never edits the portal's own text or data.
(() => {
  const LINKS = [
    ['/clinical/audiology', 'Audiology'],
    ['/clinical/slp', 'Speech-Language Pathology'],
  ];
  const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/></svg>';

  function addClinicalSection(sidebar) {
    if (sidebar.querySelector('[data-srr-clinical]')) return;
    const foot = sidebar.querySelector('.sidebar__foot');
    const group = document.createDocumentFragment();
    const sect = document.createElement('div');
    sect.className = 'sidebar__sect';
    sect.dataset.srrClinical = '';
    sect.textContent = 'Clinical';
    group.appendChild(sect);
    for (const [href, label] of LINKS) {
      const a = document.createElement('a');
      a.href = href;
      a.dataset.srrClinical = '';
      a.textContent = label;
      group.appendChild(a);
    }
    // Right after the Clinic section (Attendance), so the order matches the clinical pages.
    const attendance = sidebar.querySelector('a[href="/attendance"]');
    if (attendance && attendance.parentNode === sidebar) sidebar.insertBefore(group, attendance.nextSibling);
    else sidebar.insertBefore(group, foot || null);
  }

  // ---- Install the app ----
  const installMode = () => (window.srrInstall ? window.srrInstall.mode() : 'guide');

  function installCopy(mode) {
    const phone = window.srrInstall && window.srrInstall.isAndroid;
    if (mode === 'prompt') {
      return phone
        ? ['Install Sri Rudra on this phone', 'It opens full-screen from your Home Screen, like any app.', 'Install app']
        : ['Install Sri Rudra on this computer', 'It opens in its own window, from your taskbar or Dock.', 'Install app'];
    }
    if (mode === 'ios') return ['Add Sri Rudra to your Home Screen', 'It opens full-screen from its own icon, like any app.', 'Show me how'];
    return ['Use Sri Rudra as an app', 'Install it on this computer or on your phone.', 'How to install'];
  }

  function onInstallClick(event) {
    // install.js handles one-click installs and the iPhone steps; otherwise the link opens /install.
    if (window.srrInstall && window.srrInstall.run()) event.preventDefault();
  }

  // Only writes when something changed, so the page observer below doesn't loop.
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const setHidden = (el, hidden) => { if (el.hidden !== hidden) el.hidden = hidden; };

  function addSignInCard() {
    if (location.pathname !== '/login') return;
    const form = document.querySelector('.auth__panel form');
    if (!form) return;
    let card = form.parentNode.querySelector('[data-srr-install-card]');
    if (!card) {
      card = document.createElement('aside');
      card.className = 'srr-install-card';
      card.dataset.srrInstallCard = '';
      card.innerHTML = '<img src="/__srr/icons/icon-192.png" alt="" width="46" height="46"><div class="srr-install-card__text"><b></b><span></span></div><a class="srr-btn" href="/install"></a>';
      card.querySelector('a').addEventListener('click', onInstallClick);
      form.after(card);
    }
    const mode = installMode();
    const [title, text, button] = installCopy(mode);
    setHidden(card, mode === 'installed');
    setText(card.querySelector('b'), title);
    setText(card.querySelector('span'), text);
    setText(card.querySelector('a'), button);
  }

  function addSidebarInstall(sidebar) {
    let link = sidebar.querySelector('[data-srr-install]');
    if (!link) {
      link = document.createElement('a');
      link.href = '/install';
      link.className = 'srr-install-link';
      link.dataset.srrInstall = '';
      link.innerHTML = `${DOWNLOAD_ICON}<span>Install app</span>`;
      link.addEventListener('click', onInstallClick);
      sidebar.insertBefore(link, sidebar.querySelector('.sidebar__foot'));
    }
    setHidden(link, installMode() === 'installed');
  }

  function scan() {
    const sidebar = document.querySelector('.shell > .sidebar, aside.sidebar');
    if (sidebar) {
      addClinicalSection(sidebar);
      addSidebarInstall(sidebar);
    }
    addSignInCard();
    addDashboardInsights();
  }

  // ---- Audiology & SLP caseload insights on the portal dashboard ----
  const SEG = ['#173451', '#f46b20', '#3f78a6', '#f7a56f', '#8fb3cf', '#b74612'];
  let dashData = null;
  let dashFetching = false;
  let dashEl = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function divisionBlock(div) {
    const kpi = (label, val, cls) => `<div class="srr-kpi ${cls || ''}"><span>${esc(label)}</span><b>${val}</b></div>`;
    const bars = (div.byStage || []).filter((s) => s.count > 0);
    const bar = bars.map((s, i) => `<span style="flex-grow:${s.count};background:${SEG[i % SEG.length]}" title="${esc(s.label)}: ${s.count}"></span>`).join('');
    const legend = bars.map((s, i) => `<span class="srr-leg"><i style="background:${SEG[i % SEG.length]}"></i>${esc(s.label)} <b>${s.count}</b></span>`).join('');
    const dx = (div.byDiagnosis || []).slice(0, 5).map((d) => `<span class="srr-leg">${esc(d.label)} <b>${d.count}</b></span>`).join('');
    return `<div class="srr-cdiv">
      <div class="srr-cdiv__head"><b>${esc(div.label)}</b><a href="/clinical/${div.id}">Open →</a></div>
      <div class="srr-ckpis">
        ${kpi('Active caseload', div.active, 'srr-kpi--dark')}
        ${kpi('New this month', div.newThisMonth)}
        ${kpi('Reviews this week', div.dueThisWeek)}
        ${kpi('Overdue reviews', div.overdue, div.overdue ? 'srr-kpi--alert' : '')}
      </div>
      ${bars.length ? `<div class="srr-cbar">${bar}</div><div class="srr-cleg">${legend}</div>` : '<p class="srr-cempty">No active patients recorded yet.</p>'}
      ${dx ? `<div class="srr-cleg srr-cleg--dx"><span class="srr-leg__lbl">By diagnosis:</span>${dx}</div>` : ''}
    </div>`;
  }

  function buildDash(data) {
    const sec = document.createElement('section');
    sec.className = 'card srr-cdash';
    sec.dataset.srrDash = '';
    sec.innerHTML = `<div class="srr-cdash__head"><h3>Clinical caseload · Audiology &amp; Speech-Language Pathology</h3><a href="/clinical/audiology">Open caseload →</a></div>
      <div class="srr-cdash__grid">${data.divisions.map(divisionBlock).join('')}</div>`;
    return sec;
  }

  function addDashboardInsights() {
    if (!/^\/dashboard\/?$/.test(location.pathname)) return;
    const main = document.querySelector('.shell > .main, main.main, .main');
    if (!main) return;
    if (dashEl && dashEl.isConnected) return;
    if (dashData) { dashEl = buildDash(dashData); main.appendChild(dashEl); return; }
    if (dashFetching) return;
    dashFetching = true;
    fetch('/clinical/api/insights', { credentials: 'include', headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        dashFetching = false;
        if (!d || !d.ready || !d.divisions || !d.divisions.length) return;
        dashData = d;
        const m = document.querySelector('.shell > .main, main.main, .main');
        if (m && /^\/dashboard\/?$/.test(location.pathname)) { dashEl = buildDash(d); m.appendChild(dashEl); }
      })
      .catch(() => { dashFetching = false; });
  }

  // Reading-progress line (CSS animates it where scroll timelines are supported).
  function addProgress() {
    if (document.querySelector('.srr-progress')) return;
    const bar = document.createElement('div');
    bar.className = 'srr-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    if (CSS.supports && CSS.supports('animation-timeline: scroll()')) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  }

  function start() {
    addProgress();
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    if (window.srrInstall) window.srrInstall.onChange(scan);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
