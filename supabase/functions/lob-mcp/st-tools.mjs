// Authenticated read-only S/T tools for the existing LAYOUT & LOB MCP.
// The caller must be a Supabase OAuth user with ACTIVE ADMIN role.
// No privileged key, database connection or mutation API is used.
export const ST_SCOPE = "email";
export const stTools = [
  {
    name: "list_st_models",
    description: "Authorized S/T data. List every Model with Parent Code counts, average Net Price (VND), average S/T (minutes), GAP counts, filter by model name. These are code-level averages, not revenue.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { search: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 }, offset: { type: "integer", minimum: 0 } }
    }
  },
  {
    name: "search_st_parent_codes",
    description: "Authorized S/T catalog lookup by Model name and/or Parent Code GH96. Returns Net Price, S/T, GAP S/T, Labor Cost, change count and last change. Page using offset and limit.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        model: { type: "string", description: "Case-insensitive Model name substring (optional)" },
        parent_code: { type: "string", description: "Case-insensitive Parent Code substring (optional)" },
        product_type: { type: "string", enum: ["Smart", "Tab", "Block"] },
        changed_only: { type: "boolean" },
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 200 }
      }
    }
  },
  {
    name: "get_st_parent_code_report",
    description: "Authorized S/T report for ONE exact Parent Code: Model, Net Price (VND), current S/T minutes, latest GAP, Labor Cost, and ERP/VOC/LABOR price and S/T history.",
    inputSchema: {
      type: "object", additionalProperties: false,
      required: ["parent_code"],
      properties: { parent_code: { type: "string", minLength: 1 }, history_limit: { type: "integer", minimum: 1, maximum: 100 } }
    }
  },
  {
    name: "get_st_model_report",
    description: "Authorized S/T Model report. List every Parent Code for an exact Model, Net Price, S/T, GAP and changes. Can include dated change history; page results with limit/offset.",
    inputSchema: {
      type: "object", additionalProperties: false,
      required: ["model"],
      properties: {
        model: { type: "string", minLength: 1 },
        include_history: { type: "boolean", default: false },
        history_limit: { type: "integer", minimum: 1, maximum: 300 },
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 200 }
      }
    }
  },
  {
    name: "compare_st_models",
    description: "Authorized comparison for two to 20 exact S/T Models: parent-code counts, Net Price averages, S/T averages and latest GAP averages. Not revenue and not production output.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["models"],
      properties: { models: { type: "array", minItems: 2, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } } }
    }
  },
  {
    name: "get_st_labor_cost_history",
    description: "Authorized read-only history of Standard Time labor cost by Smart/Tab/Block/ALL with effective dates and notes.",
    inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 200 }, offset: { type: "integer", minimum: 0 } } }
  }
].map(tool => ({
  ...tool,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  securitySchemes: [{ type: "oauth2", scopes: [ST_SCOPE] }]
}));

export const stToolNames = new Set(stTools.map(t => t.name));
const error = message => { throw new Error(message) };
const str = (value, max = 160) => String(value ?? "").trim().slice(0, max);
const number = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = v => Number(number(v).toFixed(2));
const decimal = v => Number(number(v).toFixed(6));
const limitFor = (v, fallback = 100, max = 200) => Number.isInteger(v) ? Math.min(max, Math.max(1, v)) : fallback;
const offsetFor = v => Number.isInteger(v) ? Math.min(Math.max(0, v), 100000) : 0;
const lower = v => str(v).toLocaleLowerCase("en");
const roundMean = (rows, key, digits = 3) => rows.length ? Number((rows.reduce((s,r)=>s+number(r[key]),0)/rows.length).toFixed(digits)) : 0;
function config(env) {
  const url = str(env.SUPABASE_URL, 200).replace(/\/+$/, "");
  const key = str(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY, 400);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || key.length < 20) error("ST_MCP_NOT_CONFIGURED");
  return { url, key };
}
async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, { ...options, redirect: "error" });
  if (!response.ok) error("ST_AUTH_OR_DATA_SOURCE_ERROR_" + response.status);
  return response.json();
}
function oauthClaim(token) {
  // Auth server verifies the JWT signature FIRST. Claims decoded here are
  // inspected only *after* /auth/v1/user confirms the supplied access token.
  try {
    const raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(raw));
    return payload;
  } catch { return null; }
}
export async function authorizeSt(request, env, fetchImpl = fetch) {
  const { url, key } = config(env);
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/.exec(authorization);
  if (!match) error("ST_OAUTH_REQUIRED");
  const token = match[1];
  const headers = { apikey: key, Authorization: "Bearer " + token, Accept: "application/json" };
  let user;
  try {
    user = await fetchJson(fetchImpl, url + "/auth/v1/user", { method: "GET", headers });
  } catch { error("ST_OAUTH_REQUIRED"); }
  if (!user || typeof user.id !== "string" || !user.id) error("ST_OAUTH_REQUIRED");
  const claims = oauthClaim(token);
  if (!claims || typeof claims.client_id !== "string" || !claims.client_id ||
      claims.sub !== user.id || claims.iss !== url + "/auth/v1" ||
      claims.exp <= Math.floor(Date.now() / 1000)) error("ST_OAUTH_REQUIRED");
  let allowed = false;
  try {
    allowed = await fetchJson(fetchImpl, url + "/rest/v1/rpc/is_admin", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}"
    });
  } catch { error("ST_ADMIN_PERMISSION_REQUIRED"); }
  if (allowed !== true) error("ST_ADMIN_PERMISSION_REQUIRED");
  return { url, key, token, userId: user.id };
}
async function rpc(auth, method, args, fetchImpl = fetch) {
  const json = await fetchJson(fetchImpl, auth.url + "/rest/v1/rpc/" + method, {
    method: "POST",
    headers: { apikey: auth.key, Authorization: "Bearer " + auth.token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(args)
  });
  return json;
}
function catalogRow(r) {
  return {
    parent_code: str(r.product_code, 70),
    model: str(r.model_name),
    type: str(r.product_type, 30),
    net_price_vnd: money(r.current_price),
    st_minutes: decimal(r.current_st),
    gap_st_minutes: decimal(r.latest_gap_st),
    labor_cost_vnd: money(r.labor_cost),
    change_count: number(r.change_count),
    last_change_at: r.last_change_at ?? null,
    model_parent_code_count: number(r.material_count)
  };
}
function historyRow(r) {
  return {
    parent_code: str(r.product_code, 70) || undefined,
    model: str(r.model_name) || undefined,
    change_date: r.change_date ?? null,
    source: str(r.source, 30),
    old_price_vnd: r.old_price == null ? null : money(r.old_price),
    new_price_vnd: r.new_price == null ? null : money(r.new_price),
    old_st_minutes: r.old_st == null ? null : decimal(r.old_st),
    new_st_minutes: r.new_st == null ? null : decimal(r.new_st),
    gap_st_minutes: decimal(r.gap_st),
    reason: str(r.reason, 400) || null,
    voc_code: str(r.voc_code, 120) || null,
    created_at: r.created_at ?? null
  };
}
function aggregate(rows, modelName) {
  const changed = rows.filter(r => number(r.change_count) > 0);
  return {
    model: modelName,
    parent_code_count: rows.length,
    changed_parent_code_count: changed.length,
    avg_net_price_vnd_per_code: roundMean(rows, "current_price", 2),
    avg_st_minutes_per_code: roundMean(rows, "current_st", 6),
    avg_gap_st_minutes_per_code: roundMean(rows, "latest_gap_st", 6),
    latest_change_at: rows.reduce((latest,r)=>String(r.last_change_at||"")>latest?String(r.last_change_at):latest,"") || null
  };
}
async function catalog(auth, fetchImpl) {
  const result = await rpc(auth, "get_st_catalog", {}, fetchImpl);
  if (!Array.isArray(result)) error("ST_INVALID_CATALOG");
  return result;
}
function exactModel(rows, name) {
  const q = lower(name);
  if (!q) error("ST_MODEL_REQUIRED");
  const matched = rows.filter(x => lower(x.model_name) === q);
  if (!matched.length) error("ST_MODEL_NOT_FOUND");
  return matched;
}
export async function executeStTool(name, params, request, env, fetchImpl = fetch) {
  if (!stToolNames.has(name)) error("ST_UNKNOWN_TOOL");
  if (!params || typeof params !== "object" || Array.isArray(params)) error("ST_INVALID_ARGUMENTS");
  const auth = await authorizeSt(request, env, fetchImpl);
  if (name === "get_st_labor_cost_history") {
    const history = await rpc(auth, "get_st_labor_cost_history", {}, fetchImpl);
    if (!Array.isArray(history)) error("ST_INVALID_HISTORY");
    const limit = limitFor(params.limit), offset = offsetFor(params.offset);
    return {
      source: "Authenticated Supabase get_st_labor_cost_history",
      total: history.length, offset, limit,
      records: history.slice(offset,offset+limit).map(r=>({
        type: str(r.product_type), labor_cost_vnd: money(r.labor_cost),
        effective_date: r.effective_date, note: str(r.note,400)||null, recorded_at:r.created_at??null
      })),
      more: offset + limit < history.length
    };
  }
  const rows = await catalog(auth, fetchImpl);
  if (name === "list_st_models") {
    const groups = new Map();
    for (const r of rows) {
      const model = str(r.model_name);
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(r);
    }
    const q=lower(params.search);
    const found = [...groups].filter(([name])=>name.toLowerCase().includes(q)).map(([name,rs])=>aggregate(rs,name)).sort((a,b)=>a.model.localeCompare(b.model,"en",{numeric:true}));
    const offset=offsetFor(params.offset),limit=limitFor(params.limit);
    return { source:"Authenticated Supabase get_st_catalog", total:found.length, offset, limit, models:found.slice(offset,offset+limit), more:offset+limit<found.length };
  }
  if (name === "search_st_parent_codes") {
    const qModel=lower(params.model), qCode=lower(params.parent_code);
    const rowsFiltered=rows.filter(r=>lower(r.model_name).includes(qModel)&&lower(r.product_code).includes(qCode)&&(!params.product_type||r.product_type===params.product_type)&&(!params.changed_only||number(r.change_count)>0));
    const offset=offsetFor(params.offset),limit=limitFor(params.limit);
    return {
      source:"Authenticated Supabase get_st_catalog",
      total:rowsFiltered.length, offset, limit,
      parent_codes:rowsFiltered.slice(offset,offset+limit).map(catalogRow),
      more:offset+limit<rowsFiltered.length,
      units: { net_price:"VND", labor_cost:"VND", st:"minutes", gap_st:"minutes" }
    };
  }
  if (name === "get_st_parent_code_report") {
    const code = str(params.parent_code,70).toUpperCase();
    if (!/^GH96-[A-Z0-9]+$/.test(code)) error("ST_INVALID_PARENT_CODE");
    const found = rows.find(r=>str(r.product_code).toUpperCase()===code);
    if (!found) error("ST_PARENT_CODE_NOT_FOUND");
    const history = await rpc(auth,"get_st_history",{p_product_code:code},fetchImpl);
    if(!Array.isArray(history)) error("ST_INVALID_HISTORY");
    const limit=limitFor(params.history_limit,100,100);
    return {
      source:"Authenticated Supabase S/T catalog & history",
      parent_code: catalogRow(found),
      total_history_events: history.length,
      history:history.slice(0,limit).map(historyRow),
      history_truncated: history.length>limit,
      note:"History is capped at 100 events by the existing get_st_history RPC; GAP S/T is in minutes."
    };
  }
  if (name === "get_st_model_report") {
    const matching=exactModel(rows,params.model), offset=offsetFor(params.offset),limit=limitFor(params.limit);
    const modelName=str(matching[0].model_name);
    const page=matching.slice(offset,offset+limit).map(catalogRow);
    let history,historyTotal;
    if(params.include_history===true){
      const all=await rpc(auth,"get_st_model_history",{p_model_name:modelName},fetchImpl);
      if(!Array.isArray(all)) error("ST_INVALID_HISTORY");
      historyTotal=all.length;
      const codes=new Set(page.map(x=>x.parent_code));
      const scoped=all.filter(r=>codes.has(str(r.product_code)));
      history=scoped.slice(-limitFor(params.history_limit,100,300)).map(historyRow);
    }
    return {
      source:"Authenticated Supabase S/T catalog & model history",
      model:aggregate(matching,modelName),total_parent_codes:matching.length,
      offset,limit,parent_codes:page,more:offset+limit<matching.length,
      history_for_page:history,
      model_history_rpc_total:historyTotal,
      note:"History is returned only for Parent Codes on this page, up to history_limit records. Net Price in VND; S/T and GAP in minutes."
    };
  }
  if (name === "compare_st_models") {
    if(!Array.isArray(params.models)||params.models.length<2||params.models.length>20||params.models.some(m=>typeof m!=="string")) error("ST_INVALID_MODEL_LIST");
    if(new Set(params.models.map(lower)).size!==params.models.length) error("ST_DUPLICATE_MODEL");
    return {
      source:"Authenticated Supabase get_st_catalog",
      models: params.models.map(m=>{const found=exactModel(rows,m);return aggregate(found,str(found[0].model_name))}),
      note:"Model metrics are averages per Parent Code, not total revenue or production output."
    };
  }
  error("ST_UNKNOWN_TOOL");
}
