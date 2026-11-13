// Passing requests on to the admin portal, and adding the theme to its HTML pages.

const THEME_VERSION = '2026-11-13a';

export async function proxyToPortal(request, env, url) {
  const production = url.hostname === env.PRODUCTION_HOST;
  const upstream = production ? request : toPortalOrigin(request, env, url);
  const res = await fetch(upstream);
  const out = production ? res : fromPortalOrigin(res, env, url);
  const type = out.headers.get('content-type') || '';
  if (request.method === 'GET' && out.status === 200 && type.includes('text/html')) return addTheme(out);
  return out;
}

// Preview only: send the request to the portal's own address, as if it came from there.
function toPortalOrigin(request, env, url) {
  const target = new URL(url.pathname + url.search, env.PORTAL_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  if (headers.has('origin')) headers.set('origin', target.origin);
  const referer = headers.get('referer');
  if (referer) {
    try {
      const r = new URL(referer);
      headers.set('referer', new URL(r.pathname + r.search, target.origin).toString());
    } catch {
      headers.delete('referer');
    }
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  return new Request(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual' });
}

// Preview only: keep redirects and sign-in cookies on the preview address.
function fromPortalOrigin(res, env, url) {
  const out = new Response(res.body, res);
  const location = out.headers.get('location');
  if (location) {
    try {
      const l = new URL(location, env.PORTAL_ORIGIN);
      if (l.origin === new URL(env.PORTAL_ORIGIN).origin) out.headers.set('location', new URL(l.pathname + l.search + l.hash, url.origin).toString());
    } catch {}
  }
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (cookies.length) {
    out.headers.delete('set-cookie');
    for (const c of cookies) out.headers.append('set-cookie', c.replace(/;\s*domain=[^;]*/i, ''));
  }
  return out;
}

function addTheme(res) {
  const tags = `<link rel="stylesheet" href="/__srr/theme.css?v=${THEME_VERSION}"><script src="/__srr/overlay.js?v=${THEME_VERSION}" defer></script>`;
  const themed = new HTMLRewriter()
    .on('meta[name="theme-color"]', { element(el) { el.setAttribute('content', '#173451'); } })
    .on('head', { element(el) { el.append(tags, { html: true }); } })
    .transform(res);
  const out = new Response(themed.body, themed);
  out.headers.delete('content-length');
  out.headers.set('cache-control', 'no-store');
  return out;
}
