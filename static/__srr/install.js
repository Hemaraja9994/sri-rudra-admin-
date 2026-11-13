// "Install the app" for the Sri Rudra admin portal (added by the portal-plus Worker).
// - Registers the small service worker (/sw.js), which is what lets browsers install the portal.
// - Keeps the browser's install offer for our own buttons (Chrome or Edge on a computer, Chrome on
//   Android): one click, then the browser's own "Install" box.
// - On iPhone and iPad, where Apple allows no install button, shows the Safari taps instead.
// Used by overlay.js (portal pages), the clinical pages and the /install page via window.srrInstall.
(() => {
  if (window.srrInstall) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const subscribers = new Set();
  let justInstalled = false;

  const notify = () => subscribers.forEach((fn) => {
    try { fn(); } catch (err) { console.error(err); }
  });
  const runningAsApp = () => navigator.standalone === true
    || ['standalone', 'minimal-ui', 'window-controls-overlay'].some((m) => matchMedia(`(display-mode: ${m})`).matches);

  // The page head also has a one-line catcher for this event, in case it fires before this file loads.
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__srrInstallEvent = event;
    notify();
  });
  addEventListener('appinstalled', () => {
    justInstalled = true;
    window.__srrInstallEvent = null;
    notify();
  });

  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('Sri Rudra app: service worker not registered.', err && err.message));
    if (document.readyState === 'complete') register();
    else addEventListener('load', register);
  }

  // 'installed' – already running as the app; 'prompt' – one-click install is available;
  // 'ios' – show the Safari steps; 'guide' – send them to the /install page.
  function mode() {
    if (justInstalled || runningAsApp()) return 'installed';
    if (isIOS) return 'ios'; // every iPhone/iPad browser installs through Share → Add to Home Screen
    if (window.__srrInstallEvent) return 'prompt';
    return 'guide';
  }

  // Call from a click. Returns true when it handled the click; false means "open /install".
  function run() {
    const current = mode();
    if (current === 'prompt') {
      const event = window.__srrInstallEvent;
      window.__srrInstallEvent = null;
      event.prompt();
      Promise.resolve(event.userChoice).then(notify, notify);
      return true;
    }
    if (current === 'ios') {
      showIOSGuide();
      return true;
    }
    return false;
  }

  // ---- iPhone / iPad guide (styles in theme.css: .srr-sheet) ----
  const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-1.5"/></svg>';
  const ADD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/></svg>';
  let sheet = null;
  let returnFocus = null;

  function buildSheet() {
    const root = document.createElement('div');
    root.className = 'srr-sheet';
    root.innerHTML = `
      <div class="srr-sheet__scrim" data-srr-close></div>
      <section class="srr-sheet__card" role="dialog" aria-modal="true" aria-labelledby="srr-sheet-title">
        <header class="srr-sheet__head">
          <img src="/__srr/icons/icon-192.png" alt="" width="48" height="48">
          <h2 id="srr-sheet-title">Add Sri Rudra to your Home Screen</h2>
        </header>
        <ol class="srr-steps">
          <li><p>Tap <b>Share</b> ${SHARE_ICON}<small>On iOS 26, tap <b>•••</b> first.</small></p></li>
          <li><p>Tap <b>Add to Home Screen</b> ${ADD_ICON}<small>Scroll down if you don't see it.</small></p></li>
          <li><p>Tap <b>Add</b>.<small>Keep “Open as Web App” on, if you see it.</small></p></li>
        </ol>
        <p class="srr-sheet__note">Sri Rudra then opens full-screen from its own icon. Sign in once inside it.</p>
        <button type="button" class="srr-sheet__done" data-srr-close>Done</button>
      </section>`;
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-srr-close]')) hideIOSGuide();
    });
    return root;
  }

  function onKey(event) {
    if (event.key === 'Escape') hideIOSGuide();
    if (event.key === 'Tab' && sheet) { // keep focus inside the dialog
      event.preventDefault();
      sheet.querySelector('.srr-sheet__done').focus();
    }
  }

  function showIOSGuide() {
    if (!sheet) sheet = buildSheet();
    if (sheet.isConnected) return;
    returnFocus = document.activeElement;
    document.body.appendChild(sheet);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      sheet.querySelector('.srr-sheet__done').focus({ preventScroll: true });
    }));
  }

  function hideIOSGuide() {
    if (!sheet || !sheet.isConnected) return;
    document.removeEventListener('keydown', onKey);
    sheet.classList.remove('is-open');
    const done = () => { sheet.remove(); if (returnFocus && returnFocus.focus) returnFocus.focus(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 260);
  }

  window.srrInstall = {
    isIOS,
    isAndroid,
    mode,
    run,
    showIOSGuide,
    hideIOSGuide,
    onChange(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
})();
