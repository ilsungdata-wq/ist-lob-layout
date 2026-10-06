# Repository architecture audit

## Runtime and deployment

- Frontend: browser-native HTML, CSS and JavaScript. There is no React/Vite/Webpack build.
- Package manager: none. Third-party browser libraries are checked in (`fabric.min.js`, `xlsx.full.min.js`).
- Static build: canonical files are under `dist/`; the same deployable assets are copied to repository root for GitHub Pages.
- GitHub Pages: serves `index.html` and relative assets from repository root at `/ist-lob-layout/`.
- Existing optional backend: `build-worker.mjs` embeds static files in a Cloudflare Worker. Its D1 migrations are under `drizzle/`.

## Existing business data

- A model is a JavaScript object containing `name`, `version`, production metadata, `processes`, Jig/EQM data, reference images and layout information.
- Versions currently exist as independent model records, selected by model/version dropdowns. Publish/latest flags are client fields.
- Editable drawing data is `model.layoutDocument`, currently schema v3. It contains canvas/page settings, layers, and objects. `model.layoutObjects` remains a compatibility alias.
- Object geometry has canonical `world` values in meters plus legacy pixel fields derived from `pixelsPerMeter`.
- LOB/process records contain station order, process name, T/T, MP, multi-skill/automatic flags, status notes and associated Jig records.
- Equipment data is currently embedded in process/Jig arrays rather than normalized database rows.

## Existing persistence and authentication

- `localStorage` holds the working dataset, session/role, editor history, custom symbols, recent colors, measurement history and preferences.
- No material `sessionStorage` persistence was found.
- The Worker API exposes `/api/layouts`, `/api/history`, `/api/session` and `/api/editors` backed by D1 when that deployment is used.
- GitHub Pages cannot provide those same-origin server routes. It therefore relies on client/local fallback unless a backend URL is supplied.
- Current login/role state is a local client flow, not a real identity provider. It must not be treated as an authorization boundary.
- There was no existing environment-variable convention because there is no bundler.

## Data that must be migrated later

1. Every model/version record, including latest/published markers and notes.
2. Entire `layoutDocument` JSON without converting it to an image.
3. Process/LOB arrays and station ordering.
4. Jig/EQM rows and setup metadata.
5. Excel reference/image assets currently represented as paths or data URLs.
6. Version history/audit snapshots from localStorage and D1 where available.
7. Editor permissions currently stored as email/client role lists.
8. Custom Factory Objects and their image assets.

## Migration risks

- Current identifiers are often human names or generated strings, while the new backend uses UUIDs.
- Several versions may share a model name but differ in inconsistent version text.
- Inline base64 images must be uploaded to Storage and replaced with asset paths.
- Local and D1 copies can diverge. Migration needs an export, deduplication report and explicit conflict choice.
- Published/latest semantics in legacy data are weaker than immutable `PUBLISHED` rows.
- The frontend must remain on its legacy adapter until Supabase Auth, RLS, save/reload, concurrent edits and multi-user access are verified.
