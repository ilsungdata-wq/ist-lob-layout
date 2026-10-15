# S/T Google Sheet bridge

This Apps Script runs under the Google account that can read both source spreadsheets. It reads only `Prod. Material` and `Net Price` from `DATA BASE ERP`, maps `Parent Code` to `Model` in `BOM`, and returns one row per eligible GH96 code.

1. Create a standalone Apps Script project and copy `Code.gs` and `appsscript.json`.
2. Add Script Property `ST_SYNC_TOKEN` with a long random value.
3. Deploy as a Web app, execute as the project owner, and allow access to anyone who has the URL. The token is still required for every request.
4. Store the deployment URL as Supabase Function secret `ST_GOOGLE_SYNC_URL` and the same token as `ST_GOOGLE_SYNC_TOKEN`.

The browser never receives the token or direct Google Sheet access. The Supabase Edge Function accepts authenticated Admin users only.
