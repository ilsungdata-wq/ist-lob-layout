# S/T Google Sheet bridge

This Apps Script runs under the Google account that can read both source spreadsheets. It reads only `Prod. Material` and `Net Price` from `DATA BASE ERP`, maps `Parent Code` to `Model` in `BOM`, and returns one row per eligible GH96 code.

1. Create a standalone Apps Script project and copy `Code.gs` and `appsscript.json`.
2. Add Script Property `ST_SYNC_TOKEN` with a long random value.
3. Deploy as a Web app, execute as the project owner, and allow access to anyone who has the URL. The token is still required for every request.
4. Store the deployment URL as Supabase Function secret `ST_GOOGLE_SYNC_URL` and the same token as `ST_GOOGLE_SYNC_TOKEN`.

## Daily automatic sync

Set one additional Script Property named `ST_EDGE_SYNC_URL` to `https://YOUR_PROJECT.supabase.co/functions/v1/st-sheet-sync`. Then run `installDailyStSync` once in the Apps Script editor and authorize it. The trigger runs each day around 12:00 using the same private token; it writes only new Parent Codes, changed Models, or changed prices and records the completed run time.

The browser never receives the token or direct Google Sheet access. The Supabase Edge Function accepts authenticated Admin users only.

## Required one-time Apps Script deployment after updating GitHub

GitHub Pages/Edge Function CI does not automatically publish the Apps Script web-app deployment.
Open the existing Apps Script project used by `ST_GOOGLE_SYNC_URL`, replace `Code.gs` and `appsscript.json` from this repository, save, then **Deploy > Manage deployments > Edit > New version > Deploy** (reuse the existing deployment to keep its URL). Run `installDailyStSync` in the editor to grant any newly requested OAuth scopes and keep the daily trigger; do not expose ST_SYNC_TOKEN.

## 17 November 2026: paged ERP/BOM synchronization

The old one-shot source API hit 504 after waiting 65–110 seconds. To fix the cause, `Code.gs` now implements `mode: meta` and `mode: page` (protocol `st-paged-v2`). Each page reads **at most 5,000 rows** through Sheets API; Supabase Edge Function processes up to three pages concurrently, assembles the snapshot, and writes the existing DB RPCs. The button sends `{mode:'apply',paged:true}`. The scheduled daily trigger uses the same paged mode.

**Required publication step (not automated by GitHub):**

1. Open existing project **IST S/T Google Sheet Bridge**: https://script.google.com/home/projects/1bV6NVb4x9kcfmnUB3xiolLHVG3VphHGq5ZuL7Kw7oGxbATDH2t-Z1EEt/edit
2. Open `Code.gs`, replace it with the content of `google-apps-script/st-sheet-sync/Code.gs` from this repository, then Save. Keep existing Script Properties (including `ST_SYNC_TOKEN`) unchanged.
3. Select **Deploy → Manage deployments → Edit** on the existing Web App → **New version → Deploy**. Do **not** create a new deployment URL, because Supabase secret `ST_GOOGLE_SYNC_URL` already points to the existing deployment.
4. In Apps Script, run `testStSourceAccess()` once (read-only) and verify successful execution. Then return to the webapp and click **Đồng bộ nhanh Google Sheet**.

Successful webapp sync updates the `get_st_google_sync_status()` timestamp and counts. If the old deployment is still active, the new Edge Function returns `google_sheet_bridge_upgrade_required` within about 18 seconds rather than keeping the button stuck. If Google Sheets API returns 403, check that Google Sheets API is enabled and the script owner can read both spreadsheets.

For every production-size sync, the Edge Function rejects empty or incomplete mapping output; no sync timestamp will be recorded for a failed read.
