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

The updated source uses Sheets API `values:batchGet` with 12,000-row slices and parallel `UrlFetchApp.fetchAll` requests rather than large repeated `SpreadsheetApp.getDisplayValues` calls. If the script reports Google Sheets API 403 with `SERVICE_DISABLED`, enable Google Sheets API on its Google Cloud project and reauthorize the script owner. Confirm that the script owner has access to both source spreadsheets.

The Edge Function limits source waiting to 65 seconds and reports the source stage in server logs. Refresh the app and click `Đồng bộ nhanh Google Sheet` only after the Apps Script deployment has been updated.
