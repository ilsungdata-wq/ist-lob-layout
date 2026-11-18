const headers = { "Access-Control-Allow-Origin": "https://ilsungdata-wq.github.io", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
type Order = { name: string; custom_gmes_raw_net_price: number; items: { fg_item: string; fg_item_qty: number }[] };

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "authentication_required" }, 401);
  try {
    const admin = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/is_admin", {
      method: "POST",
      headers: { ...headers, authorization, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (!admin.ok || await admin.json() !== true) return json({ error: "admin_required" }, 403);

    const key = Deno.env.get("ERP_API_KEY");
    const secret = Deno.env.get("ERP_API_SECRET");
    if (!key || !secret) return json({ error: "erp_secrets_missing" }, 503);
    const { date, save } = await request.json().catch(() => ({}));
    if (typeof date !== "string" || !/^2026-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      return json({ error: "valid_2026_date_required" }, 400);
    }

    const signal = AbortSignal.timeout(45000);
    const read = async <T>(path: string, params?: URLSearchParams): Promise<T> => {
      const url = new URL("/api/resource/Sales%20Order" + path, "https://next.il-sungtech.com");
      if (params) url.search = params.toString();
      const reply = await fetch(url, { headers: { Authorization: `token ${key}:${secret}` }, redirect: "error", signal });
      if (!reply.ok) throw new Error("erp_http_" + reply.status);
      const payload = await reply.json();
      if (!payload.data) throw new Error("erp_invalid_response");
      return payload.data;
    };

    const orders: {name: string}[] = [];
    for (let offset = 0; offset <= 500; offset += 100) {
      const page = await read<{name: string}[]>("", new URLSearchParams({
        fields: JSON.stringify(["name"]),
        filters: JSON.stringify([["delivery_date", "=", date], ["is_subcontracted", "=", 1],
          ["custom_delivery_date_is_placeholder", "=", 0], ["docstatus", "<", 2]]),
        order_by: "name asc",
        limit_page_length: "100",
          limit_start: String(offset),
      }));
        if (!Array.isArray(page) || orders.length + page.length > 500) return json({ error: "preview_order_limit" }, 422);
      orders.push(...page);
      if (page.length < 100) break;
    }
    const groups = new Map<string, { parent_code: string; net_price: number; plan_qty: number }>();
    let qty = 0;
    let skipped = 0;
    for (let offset = 0; offset < orders.length; offset += 5) {
      const batch = await Promise.all(orders.slice(offset, offset + 5).map(({name}) => read<Order>("/" + encodeURIComponent(name))));
      for (const order of batch) {
        for (const item of order.items) {
          const parent_code = String(item.fg_item ?? "").trim().toUpperCase();
          const net_price = Number(order.custom_gmes_raw_net_price);
          const plan = Number(item.fg_item_qty);
          if (!/^GH96-[A-Z0-9]+$/.test(parent_code) || !Number.isFinite(net_price) || net_price <= 0 ||
              !Number.isFinite(plan) || plan <= 0) {
            skipped++;
            continue;
          }
          const id = parent_code + "|" + net_price;
          const group = groups.get(id) ?? { parent_code, net_price, plan_qty: 0 };
          group.plan_qty += plan;
          groups.set(id, group);
          qty += plan;
        }
      }
    }
    if (save === true) {
      if (skipped > 0) return json({ error: "erp_rows_require_review", skipped_lines: skipped }, 422);
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) return json({ error: "database_credentials_missing" }, 503);
      const stored = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/st_erp_replace_day", {
        method: "POST",
        headers: { ...headers, apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        body: JSON.stringify({ p_date: date, p_orders: orders.length, p_skipped: skipped, p_groups: [...groups.values()] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!stored.ok) return json({ error: "erp_snapshot_write_failed" }, 502);
    }
    return json({ date, saved: save === true, order_count: orders.length, plan_qty: qty, skipped_lines: skipped, groups: [...groups.values()] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return json({ error: /^erp_http_\d{3}$/.test(message) ? message : "erp_preview_failed" }, 502);
  }
});