create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.st_erp_job_attempts (
 rd_date date primary key,
 attempted_at timestamptz not null,
 request_id bigint
);
alter table public.st_erp_job_attempts enable row level security;
revoke all on public.st_erp_job_attempts from public, anon, authenticated;

do $$
begin
 if not exists (select 1 from vault.secrets where name='st_erp_cron_token') then
  perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'st_erp_cron_token');
 end if;
end $$;

create function public.st_erp_cron_authorized(p_token text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(length(p_token)=72 and exists(
  select 1 from vault.decrypted_secrets where name='st_erp_cron_token' and decrypted_secret=p_token
 ),false)
$$;
revoke all on function public.st_erp_cron_authorized(text) from public, anon, authenticated;
grant execute on function public.st_erp_cron_authorized(text) to service_role;

create function public.st_erp_enqueue_day(p_date date)
returns bigint language plpgsql security definer set search_path='' as $$
declare request bigint;
begin
 if p_date is null or p_date < date '2026-01-01' or p_date > (now() at time zone 'Asia/Bangkok')::date then return null; end if;
 if not pg_try_advisory_xact_lock(42062, p_date-date '2026-01-01') then return null; end if;
 if exists(select 1 from public.st_erp_job_attempts where rd_date=p_date and attempted_at>now()-interval '100 seconds') then return null; end if;
 select net.http_post(
  url:='https://bykmtesrluziwxqfmhro.supabase.co/functions/v1/st-erp-preview',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
   (select decrypted_secret from vault.decrypted_secrets where name='st_erp_cron_token')),
  body:=jsonb_build_object('date',p_date,'save',true,'scheduled',true),
  timeout_milliseconds:=65000
 ) into request;
 insert into public.st_erp_job_attempts values(p_date,now(),request)
 on conflict(rd_date) do update set attempted_at=excluded.attempted_at,request_id=excluded.request_id;
 return request;
end;
$$;
revoke all on function public.st_erp_enqueue_day(date) from public, anon, authenticated;

create function public.st_erp_backfill_next()
returns bigint language sql security definer set search_path='' as $$
 select public.st_erp_enqueue_day((
  select date '2026-01-01'+n
  from generate_series(0,least(date '2026-12-31',(now() at time zone 'Asia/Bangkok')::date)-date '2026-01-01') n
  left join public.st_erp_days d on d.rd_date=date '2026-01-01'+n
  left join public.st_erp_job_attempts a on a.rd_date=date '2026-01-01'+n
  where d.rd_date is null and (a.attempted_at is null or a.attempted_at < now()-interval '30 minutes')
  order by a.attempted_at nulls first,n limit 1
 ))
$$;
revoke all on function public.st_erp_backfill_next() from public, anon, authenticated;

select cron.schedule('st-erp-backfill-2026','*/2 * * * *','select public.st_erp_backfill_next()');
select cron.schedule('st-erp-daily-1000-vn','0 3 * * *',$job$
 select public.st_erp_enqueue_day((now() at time zone 'Asia/Bangkok')::date)
$job$);
select cron.schedule('st-erp-daily-recheck-vn','2-14/2 3 * * *',$job$
 select public.st_erp_enqueue_day((now() at time zone 'Asia/Bangkok')::date - (extract(minute from now() at time zone 'UTC')::int / 2))
$job$);