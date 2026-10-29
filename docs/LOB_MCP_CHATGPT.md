# IL-SUNG TECH LAYOUT & LOB — read-only MCP for ChatGPT

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

The server **does not** read private Drafts, employee/attendance/ERP data or live production output. A saved published layout is not real-time production.

## Deploy to your existing Supabase project

From a machine with the Supabase CLI and permission to deploy in your own Supabase account:

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
3. Authentication: **No authentication**, *only* because this integration intentionally exposes public Published-only data. Review the access warning, create and install the plugin.
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
