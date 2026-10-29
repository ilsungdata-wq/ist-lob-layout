-- Keep a durable audit point for every completed Google Sheet synchronization,
-- including runs whose source did not produce a price change.
create table if not exists public.st_google_sync_runs (
  id bigint generated always as identity primary key,
  synced_at timestamptz not null default now(),
  source_generated_at timestamptz,
  snapshot_rows integer not null default 0 check (snapshot_rows >= 0),
  history_rows integer not null default 0 check (history_rows >= 0),
  result jsonb not null default '{}'::jsonb,
  initiated_by uuid references auth.users(id) on delete set null
);

create index if not exists st_google_sync_runs_synced_at_idx on public.st_google_sync_runs(synced_at desc);
alter table public.st_google_sync_runs enable row level security;
revoke all on public.st_google_sync_runs from anon, authenticated;

create or replace function public.get_st_google_sync_status()
returns table(synced_at timestamptz, source_generated_at timestamptz, snapshot_rows integer, history_rows integer, result jsonb)
language sql stable security definer set search_path=pg_catalog,public as $$
  select r.synced_at,r.source_generated_at,r.snapshot_rows,r.history_rows,r.result
  from public.st_google_sync_runs r order by r.synced_at desc,r.id desc limit 1;
$$;

create or replace function public.record_st_google_sync(p_source_generated_at timestamptz,p_snapshot_rows integer,p_history_rows integer,p_result jsonb default '{}'::jsonb)
returns table(synced_at timestamptz, source_generated_at timestamptz, snapshot_rows integer, history_rows integer, result jsonb)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_admin() then raise exception 'admin_required_to_sync_st' using errcode='42501'; end if;
  return query insert into public.st_google_sync_runs(source_generated_at,snapshot_rows,history_rows,result,initiated_by)
  values(p_source_generated_at,greatest(coalesce(p_snapshot_rows,0),0),greatest(coalesce(p_history_rows,0),0),coalesce(p_result,'{}'::jsonb),auth.uid())
  returning st_google_sync_runs.synced_at,st_google_sync_runs.source_generated_at,st_google_sync_runs.snapshot_rows,st_google_sync_runs.history_rows,st_google_sync_runs.result;
end;
$$;

revoke all on function public.get_st_google_sync_status() from public;
revoke all on function public.record_st_google_sync(timestamptz,integer,integer,jsonb) from public;
grant execute on function public.get_st_google_sync_status() to anon, authenticated;
grant execute on function public.record_st_google_sync(timestamptz,integer,integer,jsonb) to authenticated;
