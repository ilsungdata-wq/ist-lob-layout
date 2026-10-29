import { handleRequest } from "./handler.mjs";

// Supabase Edge Function runtime. The MCP API is public read-only and obtains
// data only from the already-anonymous Published workspace/layout RPCs.
// Do NOT add service_role keys, direct table queries or Draft access here.
Deno.serve((request: Request) => handleRequest(request, {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  SUPABASE_PUBLISHABLE_KEY: Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
}));
