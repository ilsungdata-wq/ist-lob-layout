// Remote, read-only Model Context Protocol (MCP) handler.
// Exposes ONLY the same published snapshots already available to anonymous viewers.
// No service_role key, direct table access, Draft, or write tool is used.
const PROTOCOL_VERSION = "2025-06-18";
const MAX_MODELS = 100;
const QC_PATTERN = /\b(?:IQC|OQC)\b|VISION\s*LASER/i;

const tools = [
  {
    name: "list_published_models",
    description: "List published LAYOUT & LOB models, versions and LOB KPIs (MP, UPH, neck time, LOB). Only currently Published versions, not Drafts. Use to discover exact model codes.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        search: { type: "string", description: "Optional substring of model code or name" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 100 }
      }
    }
  },
  {
    name: "get_model_lob_report",
    description: "Read a published model's LOB report and process cycle-time/MP rows. Returns the version and publication update time. Never accesses private Drafts.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object", additionalProperties: false,
      required: ["model_code"],
      properties: {
        model_code: { type: "string", minLength: 1, description: "Exact code from list_published_models" },
        include_processes: { type: "boolean", default: true },
        process_limit: { type: "integer", minimum: 1, maximum: 300, default: 200 }
      }
    }
  },
  {
    name: "compare_models_lob",
    description: "Compare current Published LOB KPIs across 2 to 20 model codes. Do not interpret these snapshots as real-time production output.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object", additionalProperties: false,
      required: ["model_codes"],
      properties: {
        model_codes: { type: "array", minItems: 2, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } }
      }
    }
  },
  {
    name: "search_published_processes",
    description: "Find process rows by name across up to 5 Published models, useful for T/T and manpower comparisons. Searches only saved published snapshots.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object", additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, description: "Case-insensitive process name substring" },
        model_codes: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: { type: "string" }, description: "Optional codes; omitted means the first 5 published models only" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }
      }
    }
  }
];

function clampInteger(value, fallback, max) {
  return Number.isInteger(value) ? Math.max(1, Math.min(value, max)) : fallback;
}
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value, digits = 2) => Number(num(value).toFixed(digits));
const clean = (value, max = 200) => String(value ?? "").slice(0, max);
const error = (message) => { throw new Error(message); };

function configured(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || key.length < 20) error("MCP_NOT_CONFIGURED");
  return { url, key };
}

async function rpc(env, method, args = {}, fetchImpl = fetch) {
  const { url, key } = configured(env);
  // The anon/publishable key is intentionally used: Supabase RLS and narrowly
  // granted public RPCs are the only data access boundary.
  const response = await fetchImpl(url + "/rest/v1/rpc/" + method, {
    method: "POST",
    headers: { "apikey": key, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(args),
    redirect: "error"
  });
  if (!response.ok) throw new Error("PUBLISHED_DATA_SOURCE_ERROR_" + response.status);
  return response.json();
}

async function workspace(env, fetchImpl) {
  const value = await rpc(env, "get_published_workspace", {}, fetchImpl);
  if (!Array.isArray(value)) error("INVALID_PUBLISHED_WORKSPACE");
  return value.slice(0, 1000);
}

function findModel(rows, code) {
  const q = clean(code, 120).trim().toLocaleLowerCase("en");
  if (!q) error("MODEL_CODE_REQUIRED");
  const found = rows.find(x => clean(x.model_code, 120).toLocaleLowerCase("en") === q);
  if (!found) error("PUBLISHED_MODEL_NOT_FOUND");
  return found;
}

function summary(row) {
  const s = row.lob_summary || {};
  return {
    model_code: clean(row.model_code),
    model_name: clean(row.model_name),
    version_number: clean(row.version_number),
    version_id: row.id,
    revision: row.revision,
    published_updated_at: row.updated_at,
    process_count: num(s.processCount),
    manpower_mp: num(s.mp),
    neck_time_seconds: round(s.neckTime),
    operation_time_seconds: round(s.operationTime),
    standard_time_seconds: round(s.st),
    uph: round(s.uph),
    lob_percent: round(num(s.lob) * 100)
  };
}

function normalizeProcess(process, index) {
  const time = num(process.time ?? process.tt);
  const mp = num(process.mp);
  return {
    position: index + 1,
    process_name: clean(process.name, 250),
    tt_seconds: round(time),
    manpower_mp: round(mp),
    cycle_time_per_person_seconds: round(time / Math.max(1, mp)),
    active: process.isActive !== false,
    is_qc: QC_PATTERN.test(String(process.name || ""))
  };
}

async function publishedProcesses(env, row, fetchImpl) {
  const response = await rpc(env, "get_published_layout", { p_version_id: row.id }, fetchImpl);
  const version = Array.isArray(response) ? response[0] : response;
  if (!version || version.id !== row.id) error("PUBLISHED_VERSION_NOT_FOUND");
  const processes = version.layout_data?.processes;
  return Array.isArray(processes) ? processes.map(normalizeProcess) : [];
}

function metricsFromProcesses(processes) {
  const totalTT = processes.reduce((sum, p) => sum + p.tt_seconds, 0);
  const neck = Math.max(0, ...processes.map(p => p.cycle_time_per_person_seconds));
  const active = processes.filter(p => p.active);
  const mp = active.reduce((sum, p) => sum + p.manpower_mp, 0);
  const qc = active.filter(p => p.is_qc).reduce((sum, p) => sum + p.manpower_mp, 0);
  return {
    process_count: processes.length,
    manpower_mp: round(mp),
    production_mp: round(mp - qc),
    qc_mp: round(qc),
    operation_time_seconds: round(totalTT),
    neck_time_seconds: round(neck),
    calculated_uph: neck > 0 ? round(3600 / neck) : 0,
    calculated_lob_percent: neck > 0 && processes.length ? round(totalTT / (neck * processes.length) * 100) : 0
  };
}

async function executeTool(name, params, env, fetchImpl) {
  if (!params || typeof params !== "object" || Array.isArray(params)) error("INVALID_TOOL_ARGUMENTS");
  const rows = await workspace(env, fetchImpl);

  if (name === "list_published_models") {
    const query = clean(params.search, 120).trim().toLowerCase();
    const matched = rows.filter(x => (String(x.model_code || "") + " " + String(x.model_name || "")).toLowerCase().includes(query));
    const limit = clampInteger(params.limit, MAX_MODELS, MAX_MODELS);
    return { source: "Supabase public.get_published_workspace", visibility: "published_only", total_matches: matched.length, models: matched.slice(0, limit).map(summary), truncated: matched.length > limit };
  }

  if (name === "get_model_lob_report") {
    if (typeof params.model_code !== "string" || !params.model_code.trim()) error("MODEL_CODE_REQUIRED");
    const model = findModel(rows, params.model_code);
    const processes = await publishedProcesses(env, model, fetchImpl);
    const limit = clampInteger(params.process_limit, 200, 300);
    return {
      source: "Supabase published snapshot",
      visibility: "published_only",
      model: summary(model),
      calculated_from_processes: metricsFromProcesses(processes),
      processes: params.include_processes === false ? undefined : processes.slice(0, limit),
      process_rows_truncated: params.include_processes === false ? false : processes.length > limit,
      note: "Published saved layout, not live ERP output. LOB % uses sum(T/T) / (neck time * process count) * 100."
    };
  }

  if (name === "compare_models_lob") {
    if (!Array.isArray(params.model_codes) || params.model_codes.length < 2 || params.model_codes.length > 20 || params.model_codes.some(x => typeof x !== "string")) error("MODEL_CODES_MUST_CONTAIN_2_TO_20_CODES");
    const requested = params.model_codes.map(x => clean(x, 120).trim());
    if (new Set(requested.map(x => x.toLowerCase())).size !== requested.length) error("DUPLICATE_MODEL_CODES");
    return { visibility: "published_only", models: requested.map(code => summary(findModel(rows, code))), note: "Saved published version metrics; not current production output." };
  }

  if (name === "search_published_processes") {
    if (typeof params.query !== "string" || !params.query.trim()) error("QUERY_REQUIRED");
    if (params.model_codes !== undefined && (!Array.isArray(params.model_codes) || params.model_codes.length < 1 || params.model_codes.length > 5 || params.model_codes.some(x => typeof x !== "string"))) error("MODEL_CODES_MAX_5");
    const target = params.model_codes ? params.model_codes.map(code => findModel(rows, code)) : rows.slice(0, 5);
    const limit = clampInteger(params.limit, 50, 100);
    const query = clean(params.query, 120).toLowerCase();
    const found = [];
    for (const model of target) {
      const processes = await publishedProcesses(env, model, fetchImpl);
      for (const process of processes) {
        if (process.process_name.toLowerCase().includes(query)) {
          found.push({ model_code: model.model_code, version_number: model.version_number, ...process });
        }
      }
    }
    return { visibility: "published_only", searched_models: target.map(x => x.model_code), matched_count: found.length, matches: found.slice(0, limit), truncated: found.length > limit, note: "When model_codes is omitted, search covers only the first five published models." };
  }
  error("UNKNOWN_TOOL");
}

const jsonResponse = (value, status = 200, extra = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const jsonrpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const jsonrpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

export async function handleRequest(request, env, fetchImpl = fetch) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Allow": "POST, OPTIONS" } });
  // Streamable HTTP permits a server without a GET SSE stream to return 405.
  if (request.method !== "POST") return jsonResponse({ error: "MCP requires POST" }, 405, { "Allow": "POST, OPTIONS" });
  const text = await request.text();
  if (text.length > 32768) return jsonResponse({ error: "Request too large" }, 413);
  let message;
  try { message = JSON.parse(text); } catch { return jsonResponse(jsonrpcError(null, -32700, "Parse error"), 400); }
  if (!message || Array.isArray(message) || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return jsonResponse(jsonrpcError(null, -32600, "Invalid Request"), 400);
  }
  if (!Object.hasOwn(message, "id")) return new Response(null, { status: 202 });
  const id = message.id;
  const params = message.params || {};
  if (message.method === "initialize") {
    const requested = params.protocolVersion;
    const version = ["2025-03-26", "2025-06-18", "2025-11-25"].includes(requested) ? requested : PROTOCOL_VERSION;
    return jsonResponse(jsonrpc(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "IL-SUNG TECH LAYOUT & LOB (Published Reports)", version: "1.0.0" } }));
  }
  if (message.method === "ping") return jsonResponse(jsonrpc(id, {}));
  if (message.method === "tools/list") return jsonResponse(jsonrpc(id, { tools }));
  if (message.method === "tools/call") {
    const name = params.name;
    if (typeof name !== "string" || !tools.some(x => x.name === name)) return jsonResponse(jsonrpcError(id, -32602, "Unknown tool"), 400);
    try {
      const data = await executeTool(name, params.arguments || {}, env, fetchImpl);
      return jsonResponse(jsonrpc(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false }));
    } catch (e) {
      const msg = String(e.message || "");
      const known = /^(MODEL_|PUBLISHED_|INVALID_|QUERY_|DUPLICATE_|UNKNOWN_|MCP_NOT_CONFIGURED)/.test(msg) ? msg : "PUBLISHED_REPORT_UNAVAILABLE";
      return jsonResponse(jsonrpc(id, { content: [{ type: "text", text: known }], isError: true }));
    }
  }
  return jsonResponse(jsonrpcError(id, -32601, "Method not found"), 404);
}

export { tools, metricsFromProcesses, normalizeProcess, summary };
