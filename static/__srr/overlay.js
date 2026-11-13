// Small additions to the existing admin portal pages (added by the portal-plus Worker):
// 1. a "Clinical" section in the sidebar with the Audiology and SLP clinician dashboards;
// 2. a thin reading-progress line for browsers without CSS scroll timelines.
// It only adds new elements; it never edits the portal's own text or data.
(() => {
  const LINKS = [
    ['/clinical/audiology', 'Audiology'],
    ['/clinical/slp', 'Speech-Language Pathology'],
  ];

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

  function scan() {
    const sidebar = document.querySelector('.shell > .sidebar, aside.sidebar');
    if (sidebar) addClinicalSection(sidebar);
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
