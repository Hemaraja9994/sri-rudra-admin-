# Sri Rudra portal-plus

A new look and **clinician dashboards (Audiology and Speech-Language Pathology)** for the Sri Rudra
admin portal at admin.srirudraspeechandhearing.com, added **without changing the portal's own code**.

The portal's source code is not available, so this is a small Cloudflare Worker that sits in front of it:

| Path | What happens |
|---|---|
| any portal page | passed to the portal unchanged; HTML pages get `/__srr/theme.css` and `/__srr/overlay.js` |
| `/clinical/audiology`, `/clinical/slp` | the clinician dashboards (React app in `clinical/`) |
| `/clinical/api/...` | their API (`worker/clinical.js`) |
| `/__srr/...` | theme, small sidebar script, Carlito fonts (SIL OFL) |

- **Sign-in** is the portal's own: every clinical request is checked with the portal's `/api/session`.
- **Data**: two new tables in the portal database `sri-rudra-portal-db` — `clin_patients` and
  `clin_entries`. Existing tables are only read (appointments, test reports, HA trials and sales are
  matched to a patient by the last 10 digits of the phone number). Changes are written to `audit_log`.
- **Printing** is untouched: the theme only applies on screen.
- **Theme**: navy `#173451` and orange `#f46b20` with Carlito, after the DegluTech workspace.

## Address

Everything lives on the clinic's own domain:

| Address | What |
|---|---|
| https://srirudraspeechandhearing.com | public website and its staff area (CRM) — repo `Clinic_Web` |
| https://admin.srirudraspeechandhearing.com | daily portal, new look and clinical dashboards — this Worker |

- This Worker has **no other address**: `workers_dev = false` and `preview_urls = false`.
- It runs through the route `admin.srirudraspeechandhearing.com/*` (zone `srirudraspeechandhearing.com`,
  failure mode **Fail open**), set in Cloudflare → Workers & Pages → `sri-rudra-portal-plus` → Domains.
  The route is deliberately not in `wrangler.toml`: a `routes` entry there would make every deploy
  replace it. It shows under "Routes", not "Custom domains", because the portal itself still owns the
  address and this Worker sits in front of it.
- The clinical pages check sign-in by asking admin.srirudraspeechandhearing.com/api/session (Cloudflare
  sends a Worker's request to its own route straight to the portal). `PORTAL_ORIGIN` is only used in
  local development.
- The two Pages projects' built-in addresses (sri-rudra-portal.pages.dev and
  sri-rudra-speech-hearing-clinic.pages.dev) are redirected to the clinic's domain by a Cloudflare Bulk
  Redirect (account → Bulk redirects), keeping the path.
- **Undo the new look**: delete the route. The portal goes straight back to the old look; the clinical
  tables stay.
- **Undo a bad update**: Cloudflare → `sri-rudra-portal-plus` → Deployments → the previous version →
  Rollback.

## One-time database step

Cloudflare → D1 → `sri-rudra-portal-db` → Console → paste `docs/d1-console-clinical.sql` → Execute.
Additive only (`CREATE TABLE IF NOT EXISTS`); safe to run twice.

## Development

```bash
npm install
npm test          # clinical rules (shared/clinical.js)
npm run build     # dashboards -> dist/clinical, theme -> dist/__srr
npx wrangler dev --var PORTAL_ORIGIN:http://127.0.0.1:8790   # against a local stand-in portal
```

Cloudflare builds and deploys this repository on every push to `main`
(Workers Builds: build `npm run build`, deploy `npx wrangler deploy`). There is no preview address,
so a push to `main` goes **straight to the live portal**: test locally with the stand-in portal first,
and push only once the change is approved.
