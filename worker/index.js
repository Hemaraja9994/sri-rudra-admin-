// Sri Rudra portal-plus: a Cloudflare Worker in front of the admin portal
// (admin.srirudraspeechandhearing.com, Pages project sri-rudra-portal).
//
// - Portal pages pass straight through; HTML pages get the new theme and a small script.
// - /clinical/...      the Audiology and SLP clinician dashboards (built into ./dist/clinical)
// - /clinical/api/...  their API, stored in new clin_* tables of the portal database
// - /__srr/...         theme files, fonts, app icons and the app manifest
// - /install           the "install the app" page (public, shareable)
// - /sw.js             the app's service worker (lets browsers install the portal; caches no data)
//
// On admin.srirudraspeechandhearing.com (PRODUCTION_HOST, the only live address) requests go to the
// portal unchanged. On any other host (local development) they are forwarded to PORTAL_ORIGIN.
import { handleClinicalApi } from './clinical.js';
import { proxyToPortal } from './proxy.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/__srr/')) return env.ASSETS.fetch(request);
    if (path === '/install' || path === '/install/') return serveAsset(env, url, '/__srr/install.html', 'text/html; charset=utf-8');
    if (path === '/sw.js') return serveAsset(env, url, '/__srr/sw.js', 'text/javascript; charset=utf-8', { 'service-worker-allowed': '/' });
    if (path === '/favicon.ico') return serveAsset(env, url, '/__srr/icons/favicon-32.png', 'image/png');
    if (path === '/clinical') return Response.redirect(new URL('/clinical/', url).toString(), 302);
    if (path.startsWith('/clinical/api/')) return handleClinicalApi(request, env, url);
    if (path.startsWith('/clinical/')) return serveClinicalApp(request, env, url);
    return proxyToPortal(request, env, url);
  },
};

// A file from the build at a fixed public address: /install (the install page), /sw.js (the app's
// service worker, which must sit at the top of the site) and /favicon.ico. Always re-checked, never stale.
async function serveAsset(env, url, assetPath, type, extraHeaders = {}) {
  const res = await env.ASSETS.fetch(new Request(new URL(assetPath, url)));
  if (!res.ok) return res;
  const out = new Response(res.body, res);
  out.headers.set('content-type', type);
  out.headers.set('cache-control', 'no-cache');
  for (const [name, value] of Object.entries(extraHeaders)) out.headers.set(name, value);
  return out;
}

// Files (with an extension) come from the build; every other /clinical/ path is the app itself.
async function serveClinicalApp(request, env, url) {
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return env.ASSETS.fetch(request);
  const res = await env.ASSETS.fetch(new Request(new URL('/clinical/index.html', url), { headers: request.headers }));
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  return out;
}
