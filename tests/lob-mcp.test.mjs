import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, metricsFromProcesses, normalizeProcess } from "../supabase/functions/lob-mcp/handler.mjs";

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "a".repeat(36) };
const model = {
  id: "8c443957-b2ac-4b39-a999-059bc5f09c4f",
  model_code: "TEST-01",
  model_name: "Test Model",
  version_number: "Ver 1.0",
  revision: 3,
  updated_at: "2026-10-29T01:00:00Z",
  lob_summary: { processCount: 2, mp: 3, neckTime: 10, operationTime: 30, st: 30, uph: 360, lob: 1.5 }
};
const layout = {
  id: model.id,
  layout_data: {
    processes: [
      { name: "Assembly", tt: 10, mp: 1, isActive: true },
      { name: "OQC Inspection", time: 20, mp: 2, isActive: true }
    ],
    // The MCP response must never leak arbitrary editor information:
    confidentialEditorContent: { secret: "not-exposed" },
    layout: { objects: [{ type: "image", src: "hidden-data" }] }
  }
};
function mockFetch(url, options) {
  assert.equal(options.method, "POST");
  assert.match(url, /^https:\/\/example\.supabase\.co\/rest\/v1\/rpc\/(get_published_(workspace|layout)|get_st_google_sync_status)$/);
  assert.equal(options.headers.apikey, env.SUPABASE_ANON_KEY);
  if (url.endsWith("get_published_workspace")) return Promise.resolve(Response.json([model]));
  if (url.endsWith("get_st_google_sync_status")) return Promise.resolve(Response.json([{
    synced_at: "2026-10-29T03:00:00Z",
    source_generated_at: "2026-10-29T02:59:00Z",
    snapshot_rows: 81,
    history_rows: 7,
    result: { inserted: 2, updated: 3, secret: "ST-PRICE-PRIVATE", raw: [{ net_price: 998877 }] }
  }]));
  assert.deepEqual(JSON.parse(options.body), { p_version_id: model.id });
  return Promise.resolve(Response.json([layout]));
}
async function call(method, params = {}, id = 1, fetchImpl = mockFetch) {
  const request = new Request("https://example.supabase.co/functions/v1/lob-mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  return handleRequest(request, env, fetchImpl);
}
async function tool(name, args) {
  const response = await call("tools/call", { name, arguments: args });
  assert.equal(response.status, 200);
  return (await response.json()).result;
}
test("MCP initialize and list tools are standard JSON-RPC", async () => {
  const init = await (await call("initialize", { protocolVersion: "2025-06-18" })).json();
  assert.equal(init.result.protocolVersion, "2025-06-18");
  const listed = await (await call("tools/list")).json();
  assert.deepEqual(listed.result.tools.map(x => x.name), [
    "list_published_models", "get_model_lob_report", "compare_models_lob", "get_st_sync_status", "search_published_processes"
  ]);
  assert.ok(listed.result.tools.every(x => x.annotations.readOnlyHint));
});
test("list published models and filter", async () => {
  const data = (await tool("list_published_models", { search: "test" })).structuredContent;
  assert.equal(data.models.length, 1);
  assert.equal(data.models[0].lob_percent, 150);
  assert.equal(data.models[0].version_number, "Ver 1.0");
});
test("detailed LOB report exposes only safe public fields", async () => {
  const result = await tool("get_model_lob_report", { model_code: "test-01" });
  assert.equal(result.isError, false);
  const data = result.structuredContent;
  assert.equal(data.processes.length, 2);
  assert.equal(data.calculated_from_processes.production_mp, 1);
  assert.equal(data.calculated_from_processes.qc_mp, 2);
  assert.equal(data.calculated_from_processes.calculated_uph, 360);
  assert.ok(!JSON.stringify(data).includes("not-exposed"));
  assert.ok(!JSON.stringify(data).includes("hidden-data"));
});
test("compare models cannot return unpublished codes", async () => {
  const result = await tool("compare_models_lob", { model_codes: ["TEST-01", "DRAFT-ONLY"] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /PUBLISHED_MODEL_NOT_FOUND/);
});
test("process search uses published layout RPC", async () => {
  const result = await tool("search_published_processes", { query: "oqc", model_codes: ["TEST-01"] });
  assert.equal(result.structuredContent.matches.length, 1);
  assert.equal(result.structuredContent.matches[0].is_qc, true);
});
test("metrics never divide by zero for zero MP", () => {
  const m = metricsFromProcesses([normalizeProcess({ name: "X", tt: 0, mp: 0 }, 0)]);
  assert.equal(m.calculated_uph, 0);
  assert.equal(m.calculated_lob_percent, 0);
});
test("GET is not a public data endpoint", async () => {
  const response = await handleRequest(new Request("https://example.supabase.co/functions/v1/lob-mcp"), env, mockFetch);
  assert.equal(response.status, 405);
});
test("unknown tools are not executed", async () => {
  const response = await call("tools/call", { name: "delete_model", arguments: {} });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32602);
});
test("upstream errors do not expose private information", async () => {
  const result = await tool("get_model_lob_report", { model_code: "TEST-01" });
  assert.equal(result.isError, false);
  const response = await call("tools/call", { name: "list_published_models", arguments: {} }, 1, async () => {
    throw new Error("database password: should-not-leak");
  });
  const body = await response.json();
  assert.equal(body.result.isError, true);
  assert.ok(!JSON.stringify(body).includes("should-not-leak"));
});

test("S/T sync-status returns only safe audit fields (no price or arbitrary sync result)", async () => {
  const res = await tool("get_st_sync_status", {});
  assert.equal(res.isError, false);
  assert.equal(res.structuredContent.snapshot_rows, 81);
  assert.equal(res.structuredContent.updated_count, 3);
  assert.ok(!JSON.stringify(res).includes("ST-PRICE-PRIVATE"));
  assert.ok(!JSON.stringify(res).includes("998877"));
});
test("S/T catalog is not an exposed MCP tool", async () => {
  const res = await call("tools/call", { name: "get_st_catalog", arguments: {} });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32602);
});
