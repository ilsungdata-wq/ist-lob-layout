create or replace function public.st_erp_replace_day(p_date date,p_orders integer,p_skipped integer,p_groups jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_date<date '2025-11-25' or p_orders<0 or p_skipped<0 or jsonb_typeof(p_groups)<>'array' then raise exception 'invalid ERP snapshot'; end if;
 perform pg_advisory_xact_lock(42061,p_date-date '2026-01-01');
 merge into public.st_erp_daily_prices target
 using (select p_date rd_date,parent_code,net_price,plan_qty from jsonb_to_recordset(p_groups) x(parent_code text,net_price numeric,plan_qty numeric)) source
 on target.rd_date=source.rd_date and target.parent_code=source.parent_code and target.net_price=source.net_price
 when matched then update set plan_qty=source.plan_qty
 when not matched then insert(rd_date,parent_code,net_price,plan_qty) values(source.rd_date,source.parent_code,source.net_price,source.plan_qty)
 when not matched by source and target.rd_date=p_date then delete;
 insert into public.st_erp_days(rd_date,order_count,plan_qty,skipped_lines)
 values(p_date,p_orders,(select coalesce(sum(plan_qty),0) from public.st_erp_daily_prices where rd_date=p_date),p_skipped)
 on conflict(rd_date) do update set order_count=excluded.order_count,plan_qty=excluded.plan_qty,skipped_lines=excluded.skipped_lines,synced_at=now();
end $$;