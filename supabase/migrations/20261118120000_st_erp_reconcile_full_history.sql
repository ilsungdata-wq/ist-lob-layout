create or replace function public.st_erp_backfill_next()
returns bigint language sql security definer set search_path='' as $$
 select public.st_erp_enqueue_day((
  select bounds.first_day+n
  from (select date '2026-01-01' first_day,
   (now() at time zone 'Asia/Bangkok')::date today,
   (date_trunc('day',now() at time zone 'Asia/Bangkok') + interval '10 hours') at time zone 'Asia/Bangkok' cutoff) bounds
  cross join lateral generate_series(0,least(date '2026-12-31',bounds.today)-bounds.first_day) n
  left join public.st_erp_days d on d.rd_date=bounds.first_day+n
  left join public.st_erp_job_attempts a on a.rd_date=bounds.first_day+n
  where (a.attempted_at is null or a.attempted_at < now()-interval '30 minutes')
   and (d.rd_date is null or (now()>=bounds.cutoff and d.synced_at<bounds.cutoff))
  order by (d.rd_date is not null),a.attempted_at nulls first,n limit 1
 ))
$$;
select cron.unschedule(jobid) from cron.job where jobname='st-erp-daily-recheck-vn';