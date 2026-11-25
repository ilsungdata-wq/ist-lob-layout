CREATE OR REPLACE FUNCTION public.st_erp_backfill_next()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.st_erp_enqueue_day((
  select bounds.first_day+n
  from (select date '2025-11-25' first_day,
   (now() at time zone 'Asia/Bangkok')::date today,
   (date_trunc('day',now() at time zone 'Asia/Bangkok') + interval '10 hours') at time zone 'Asia/Bangkok' cutoff) bounds
  cross join lateral generate_series(0,bounds.today-bounds.first_day) n
  left join public.st_erp_days d on d.rd_date=bounds.first_day+n
  left join public.st_erp_job_attempts a on a.rd_date=bounds.first_day+n
  where (a.attempted_at is null or a.attempted_at < now()-interval '30 minutes')
   and (d.rd_date is null or (now()>=bounds.cutoff and d.synced_at<bounds.cutoff))
  order by (d.rd_date is not null),a.attempted_at nulls first,n limit 1
 ))
$function$
;
CREATE OR REPLACE FUNCTION public.st_erp_enqueue_day(p_date date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare request bigint;
begin
 if p_date is null or p_date < date '2025-11-25' or p_date > (now() at time zone 'Asia/Bangkok')::date then return null; end if;
 if not pg_try_advisory_xact_lock(42062, p_date-date '2025-11-25') then return null; end if;
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
$function$
;