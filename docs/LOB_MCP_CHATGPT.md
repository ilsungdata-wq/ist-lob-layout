# IL-SUNG TECH LAYOUT & LOB — read-only MCP with private S/T reports

## Purpose

Connect ChatGPT to the **currently published** LAYOUT & LOB models and create reports using @mention, without scraping GitHub Pages and without exposing Draft versions, editor JSON, images or private Supabase tables.

The existing public viewer already uses:
- public.get_published_workspace() — published model picker and LOB summary
- public.get_published_layout(p_version_id) — published snapshot for one model

The MCP function invokes these **same** anonymous RPCs using a Supabase publishable/anon key. It never uses service-role or queries private tables.

## MCP tools

| Tool | What it returns |
| --- | --- |
| list_published_models | Model codes, published versions, timestamps, MP, UPH, LOB %, neck time |
| get_model_lob_report | Published KPIs, production/QC MP and process name/T/T/MP |
| compare_models_lob | Published KPIs for 2–20 selected models |
| search_published_processes | Process T/T/MP in up to five published models |
| get_st_sync_status | Latest S/T Google Sheets sync timestamp, snapshot/history counts, changed-code totals (no prices or labor costs) |
| list_st_models | **OAuth + ADMIN:** Model overview, price/S/T/GAP averages |
| search_st_parent_codes | **OAuth + ADMIN:** Search Parent Codes and Net Price, S/T, GAP, Labor Cost |
| get_st_parent_code_report | **OAuth + ADMIN:** Parent Code current and ERP/VOC/LABOR history |
| get_st_model_report | **OAuth + ADMIN:** One Model with every Parent Code and dated history |
| compare_st_models | **OAuth + ADMIN:** Compare Model-level price/S/T/GAP |
| get_st_labor_cost_history | **OAuth + ADMIN:** Labor Cost effective dates and prices |

The public tools do not read private Drafts, attendance or live ERP output. S/T financial tools require OAuth and active ADMIN permission and use only approved read-only Supabase RPCs with the user's JWT. Published layouts are not live production results.

## Deploy to your existing Supabase project

**Automatic:** After this change is merged to main, the existing GitHub Actions workflow 'Migrate, verify and deploy production' deploys the lob-mcp Edge Function using its configured Supabase project credentials. Check the workflow run and verify the endpoint before adding a ChatGPT plugin.

**Manual fallback:** From a machine with the Supabase CLI and permission to deploy in your own Supabase account:

~~~sh
supabase login
supabase link --project-ref bykmtesrluziwxqfmhro
supabase functions deploy lob-mcp --project-ref bykmtesrluziwxqfmhro --no-verify-jwt
~~~

The standard Supabase Edge runtime provides SUPABASE_URL and SUPABASE_ANON_KEY by default. For a non-standard environment, set SUPABASE_PUBLISHABLE_KEY as a **public** publishable key. Never set a service-role key for this function.

Planned HTTPS endpoint (not proof of deployment):

~~~text
https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/lob-mcp
~~~

## Smoke test

~~~sh
curl -i 'https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/lob-mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0"}}}'

curl -i 'https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/lob-mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

curl -i 'https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/lob-mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_published_models","arguments":{}}}'
~~~

Expect HTTP 200 with JSON-RPC result.tools or result.structuredContent.models. When no Published model exists, the list is empty.

## Add this MCP to ChatGPT so you can use @

1. Open ChatGPT on web → **Plugins** → **+** → **Add custom MCP server** (subject to account/workspace permissions).
2. Name: **IL-SUNG LAYOUT & LOB**. Use the planned Supabase Edge Function HTTPS endpoint once deployed.
3. Authentication: **OAuth or no authentication** (mixed). Public LAYOUT tools remain anonymous; private S/T report tools require Supabase OAuth. Review the access warning, create and install the plugin.
4. In a new conversation type @ and choose **IL-SUNG LAYOUT & LOB**.

Example questions:

- @IL-SUNG LAYOUT & LOB Liệt kê các Model Published, báo cáo LOB, MP, UPH theo Model.
- @IL-SUNG LAYOUT & LOB Báo cáo công đoạn bottleneck của Model F766 Main, dựa trên T/T trong bản Published.
- @IL-SUNG LAYOUT & LOB So sánh LOB và MP giữa Model F731 Main và F741 Main (nếu đã Published).

## Security and scope

- **No inbound authentication:** anyone knowing the endpoint can call its *public published* tools. If Published model data should not be public, **do not deploy this variant**. First build per-user OAuth authorization.
- Only public RPCs already granted to the anon role are called. The handler has no service-role key, SQL access, direct table access, Draft or write tools.
- Returned process rows deliberately omit image blobs, arbitrary editor JSON, equipment assets and internal metadata.
- Tool inputs are bounded. Search without model_codes covers only the first five Published models; specify model_codes for a targeted search.
- Summary metrics come from the Published workspace RPC. Detail-calculated metrics recompute MP and LOB from saved process rows following the dashboard formulas. Investigate differences before claiming either is definitive.
- The webapp, database schema and GitHub Pages production deployment are unchanged.
- This server is **not** a source for live ERP output or attendance. A future phase should add private access using OAuth + Supabase per-user RLS if needed.

## Local tests

~~~sh
node --test tests/lob-mcp.test.mjs
~~~


## Private S/T reporting in one MCP

The existing MCP URL and @mention can stay the same. The protected tools provide:
- Model and Parent Code lookup with Net Price, S/T and GAP.
- Parent Code detail and ERP/VOC/LABOR historical changes by R/D date.
- Model comparison and labor cost history.
- Pagination (at most 200 catalog rows per request); built-in history RPC limits still apply.

**Units:** Net Price and Labor Cost are in VND. S/T and GAP S/T are in minutes. Model averages are calculated per Parent Code, not total revenue.

Example prompts:

- @IL-SUNG LAYOUT & LOB Báo cáo toàn bộ Parent Code Model F766 Main: Net Price, S/T, GAP và sắp xếp GAP giảm dần.
- @IL-SUNG LAYOUT & LOB Báo cáo Parent Code GH96-XXXX: giá hiện tại, S/T, GAP, lịch sử ERP và VOC theo R/D Date.
- @IL-SUNG LAYOUT & LOB So sánh Net Price và S/T giữa Model F731 Main và F741 Main.

### Supabase OAuth setup is required

GitHub deployment installs the code and consent page, **not** the OAuth server configuration. The authorized owner/admin needs to:

1. Open Supabase project bykmtesrluziwxqfmhro → Authentication → OAuth Server, and enable OAuth 2.1 server.
2. Enable dynamic client registration (or register the exact ChatGPT OAuth client with the redirect URI displayed in ChatGPT). Require explicit user consent.
3. Configure an OAuth authorization path and Site URL for the consent page at https://ilsungdata-wq.github.io/ist-lob-layout/oauth/consent/. For example: Site URL = https://ilsungdata-wq.github.io/ist-lob-layout and Authorization Path = /oauth/consent. Review existing Auth Site URL and redirects first because changing them can affect other login flows.
4. Prefer asymmetric JWT signing keys (RS256 or ES256), particularly if requesting the OIDC openid scope.
5. In ChatGPT Plugins, recreate/reconfigure the custom MCP as **OAuth or no authentication** (mixed), using the **same** MCP URL:
   https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/lob-mcp
6. When a protected S/T tool is called, sign in on the consent page with an active ADMIN account. Confirm the requesting client and approve.

OAuth protected resource metadata:
https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/lob-mcp/.well-known/oauth-protected-resource

OAuth authorization server:
https://bykmtesrluziwxqfmhro.supabase.co/auth/v1

### Security and limits

- The server validates the incoming OAuth token using Supabase Auth, checks the OAuth client_id claim, then runs is_admin() under the user's JWT for every protected tool call. Non-ADMIN and anonymous requests cannot use the private tools.
- Every S/T financial RPC uses the verified user's token; no service_role, arbitrary SQL or mutation tool is available.
- The S/T webapp currently restricts viewing by a UI password, but some legacy S/T read RPCs have anonymous execute grants. This is **not** an adequate database authorization boundary. This MCP does not widen it; a future migration should close that existing exposure while preserving existing viewer workflows.
- The published-only tools continue without authentication. Draft layouts, full editor JSON, employee/attendance and live ERP output are not part of this S/T phase.

### Tests

node --test tests/lob-mcp.test.mjs tests/st-mcp-private.test.mjs

Check missing-token OAuth challenge, non-ADMIN denial, permitted ADMIN price/GAP query and two-page reporting before relying on production values.
