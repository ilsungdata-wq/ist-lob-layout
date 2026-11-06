-- Enrich the existing S/T sync status with the exact new Parent Codes from
-- the most recent completed Google Sheet sync, without modifying source data.
--
-- The snapshot RPC writes a "Thêm mã mới từ Google Sheet" price-history event
-- for each inserted code. Limit to events since the previous successful sync
-- and immediately before this run's audit row. This also supports the existing
-- Nov 6 sync (5 codes), whose result only stored aggregate counts.
create or replace function public.get_st_google_sync_status()
returns table(
  synced_at timestamptz,
  source_generated_at timestamptz,
  snapshot_rows integer,
  history_rows integer,
  result jsonb
)
language sql stable security definer set search_path=pg_catalog,public as $$
  with ordered_runs as (
    select s.*,
      lag(s.synced_at) over (order by s.synced_at,s.id) as previous_sync
    from public.st_google_sync_runs s
  ), latest as (
    select * from ordered_runs order by synced_at desc,id desc limit 1
  )
  select r.synced_at,r.source_generated_at,r.snapshot_rows,r.history_rows,
    jsonb_set(
      coalesce(r.result,'{}'::jsonb),'{new_codes}',
      coalesce((
        select jsonb_agg(c.product_code order by c.product_code)
        from (
          select distinct h.product_code,h.created_at
          from public.st_price_history h
          where h.reason='Thêm mã mới từ Google Sheet'
            and h.created_at<=r.synced_at
            and h.created_at>greatest(
              coalesce(r.previous_sync,'-infinity'::timestamptz),
              r.synced_at-interval '2 minutes'
            )
          order by h.created_at desc,h.product_code
          limit greatest(0,least(1000,coalesce((r.result->>'inserted')::integer,0)))
        ) c
      ),'[]'::jsonb),true
    ) as result
  from latest r;
$$;

-- Preserve the existing read-only status permissions. Only the trusted
-- service_role and authenticated ADMIN can write sync records.
revoke all on function public.get_st_google_sync_status() from public;
grant execute on function public.get_st_google_sync_status() to anon,authenticated;
