select cron.schedule('st-erp-daily-recheck-vn','2-6/2 3 * * *',$job$
 select public.st_erp_enqueue_day((now() at time zone 'Asia/Bangkok')::date - (extract(minute from now() at time zone 'UTC')::int / 2))
$job$);

select cron.schedule('st-erp-backfill-2026','*/2 * * * *',$job$
 select public.st_erp_backfill_next()
 where (now() at time zone 'Asia/Bangkok')::time not between time '10:00' and time '10:07:59'
$job$);