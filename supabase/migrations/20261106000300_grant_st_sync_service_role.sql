-- Allow only the trusted Supabase Edge Function (service_role) to run
-- S/T synchronization RPCs. These functions validate service/admin identity
-- internally and run as their owner. Keep anon access disabled.
--
-- These RPCs were recreated in later migrations with EXECUTE only granted to
-- authenticated, inadvertently removing the service_role permission.
grant execute on function
  public.sync_st_bom_catalog(jsonb),
  public.import_st_erp_history(jsonb),
  public.sync_st_erp_snapshot(jsonb)
to service_role;

notify pgrst, 'reload schema';
