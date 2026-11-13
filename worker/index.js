// Sri Rudra portal-plus: a Cloudflare Worker in front of the admin portal
// (admin.srirudraspeechandhearing.com, Pages project sri-rudra-portal).
//
// - Portal pages pass straight through; HTML pages get the new theme and a small script.
// - /clinical/...      the Audiology and SLP clinician dashboards (built into ./dist/clinical)
// - /clinical/api/...  their API, stored in new clin_* tables of the portal database
// - /__srr/...         theme files and fonts
//
// On admin.srirudraspeechandhearing.com (PRODUCTION_HOST) requests go to the portal unchanged.
// On any other host (the workers.dev preview) they are forwarded to PORTAL_ORIGIN, so the new
// look can be tried with real logins before staff see it.
import { handleClinicalApi } from './clinical.js';
import { proxyToPortal } from './proxy.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/__srr/')) return env.ASSETS.fetch(request);
    if (path === '/clinical') return Response.redirect(new URL('/clinical/', url).toString(), 302);
    if (path.startsWith('/clinical/api/')) return handleClinicalApi(request, env, url);
    if (path.startsWith('/clinical/')) return serveClinicalApp(request, env, url);
    return proxyToPortal(request, env, url);
  },
};

// Files (with an extension) come from the build; every other /clinical/ path is the app itself.
async function serveClinicalApp(request, env, url) {
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return env.ASSETS.fetch(request);
  const res = await env.ASSETS.fetch(new Request(new URL('/clinical/index.html', url), { headers: request.headers }));
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  return out;
}
