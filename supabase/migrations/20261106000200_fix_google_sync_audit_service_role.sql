-- The Edge Function applies Sheet data with service_role. Permit that trusted
-- backend role to write the durable audit row; browser callers remain Admin-only.
create or replace function public.record_st_google_sync(p_source_generated_at timestamptz,p_snapshot_rows integer,p_history_rows integer,p_result jsonb default '{}'::jsonb)
returns table(synced_at timestamptz, source_generated_at timestamptz, snapshot_rows integer, history_rows integer, result jsonb)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'admin_required_to_sync_st' using errcode='42501';
  end if;
  return query insert into public.st_google_sync_runs(source_generated_at,snapshot_rows,history_rows,result,initiated_by)
  values(p_source_generated_at,greatest(coalesce(p_snapshot_rows,0),0),greatest(coalesce(p_history_rows,0),0),coalesce(p_result,'{}'::jsonb),auth.uid())
  returning st_google_sync_runs.synced_at,st_google_sync_runs.source_generated_at,st_google_sync_runs.snapshot_rows,st_google_sync_runs.history_rows,st_google_sync_runs.result;
end;
$$;
revoke all on function public.record_st_google_sync(timestamptz,integer,integer,jsonb) from public;
grant execute on function public.record_st_google_sync(timestamptz,integer,integer,jsonb) to authenticated,service_role;
