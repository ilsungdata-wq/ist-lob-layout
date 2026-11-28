# Build and viewer performance

- Main pushes use one production deployment workflow. Frontend-only pushes skip Supabase migrations and function deployment. The UI-only workflow remains a manual fallback.
- Worker verification generates from current root sources, checks deterministic output, and compares served assets against their source. Tracked historical `dist` files are no longer a CI drift gate.
- Both Pages workflows use `scripts/build-site.mjs`. HTML and module URLs carry the release revision; `release.json` records the revision and SHA-256 hashes. Deployment verifies the public release and critical assets.
- Excel (881,749 source bytes; 316,292 gzip bytes) loads when an import/export or source-workbook operation needs it. Concurrent consumers share a request; failed requests can retry. Workbooks needed for source staffing/preview still load automatically.
- ERP periods, coverage and latest-day reads share in-flight requests and a 30-second memory cache scoped to the session. Manual catalog refresh invalidates the cache. No database schema, production data, or synchronization write logic changed.

## Validation

- 184 Node tests passed.
- `node scripts/verify-worker.mjs`: deterministic output and 29 current source routes passed.
- `node scripts/verify-performance-browser.cjs`: passed at 1440px and 390px on both source and generated `_site`; covers initial lazy load, failed-load retry, concurrent loading, workbook roundtrip, model-filter query reuse, manual refresh and S/T export using mock ERP responses.
- To test the artifact, set `SITE_DIR=_site`. Set `PLAYWRIGHT_MODULE` to the installed Playwright path if it is not in node_modules; Edge is the default browser.
- The older `verify-layout-browser.cjs` passed its first editor checks but timed out dragging a library worker to a hidden `.upper-canvas`. Reproduced against pre-change HEAD `39a8d2b` as well. This is not counted as a passing full editor suite.

## Deployment checks

Run the normal main push workflow, then `scripts/verify-release.mjs` with `PAGE_URL` and `GITHUB_SHA`. The workflow performs this automatically. For rollback, deploy a deliberate revert commit through the same path; do not edit production data or legacy generated files.
