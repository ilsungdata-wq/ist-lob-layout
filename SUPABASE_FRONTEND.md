# Supabase frontend connection

The browser uses only the public Supabase URL and anonymous key. Database passwords, JWT secrets, and the `service_role` key are never used by the frontend.

## Runtime configuration

Set these deployment environment variables:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Generate the ignored runtime file before serving or publishing the site:

```powershell
node scripts/generate-supabase-config.mjs
```

The generated `supabase-config.js` must be deployed beside `index.html`. It is intentionally ignored by Git. The committed `supabase-config.example.js` documents its shape.

## Authentication and access

1. Open the application and choose **Đăng nhập**.
2. Sign in with a Supabase email/password account.
3. The app restores the Supabase session after refresh, reads `public.profiles`, rejects inactive profiles, and derives the global role.
4. Model and version rows are still protected by RLS. UI checks only hide or disable actions for convenience.

Users with `VIEW` see published versions. `EDIT` and `MANAGE` can edit and save Draft versions. `MANAGE` and Admin can publish or archive where the backend RPC allows it. Published and archived versions remain read-only.

## Manual persistence test

1. Sign in as the verified Admin account.
2. From the Model selector choose **Thêm Model mới**, create `TEST-01` / `Backend Integration Test`, and choose a blank line.
3. Confirm `Ver 0.1` opens as `DRAFT`.
4. Add a rectangle, text, and one supported factory object.
5. Choose **Lưu Draft** and note the revision in Supabase `layout_versions`.
6. Refresh, sign in if needed, reopen `TEST-01` / `Ver 0.1`, and compare every object property and position.
7. Modify an object and save again. Confirm `revision` increments.
8. Choose **Tạo phiên bản mới**, enter `Ver 0.2`, then modify and save it. Confirm `Ver 0.1` did not change.
9. Publish one version. Confirm the UI becomes read-only and a direct `save_layout_version` attempt is rejected by the backend.
10. For concurrency, open the same Draft in two browser sessions, save session A, then save stale session B. Session B must show the revision conflict and must not overwrite A.

## Current schema limits

The approved backend exposes no RPC or table grant for editing Model metadata or archiving a Model. The frontend therefore does not bypass RLS to implement those operations. Version creation, Draft save, publish, archive, permissions, and assets use the approved RPC/service APIs.
