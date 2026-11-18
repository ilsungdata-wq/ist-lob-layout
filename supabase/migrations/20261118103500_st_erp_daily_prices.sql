create table public.st_erp_daily_prices (
 rd_date date not null check (rd_date >= '2026-01-01'),
 parent_code text not null,
 net_price numeric not null check (net_price > 0),
 plan_qty numeric not null check (plan_qty > 0),
 primary key (rd_date,parent_code,net_price)
);
create index st_erp_daily_prices_code_idx on public.st_erp_daily_prices(parent_code,rd_date);
create table public.st_erp_days (
 rd_date date primary key,
 order_count integer not null,
 plan_qty numeric not null,
 skipped_lines integer not null,
 synced_at timestamptz not null default now()
);
alter table public.st_erp_daily_prices enable row level security;
alter table public.st_erp_days enable row level security;
revoke all on public.st_erp_daily_prices, public.st_erp_days from anon, authenticated;
grant select on public.st_erp_daily_prices, public.st_erp_days to authenticated;
create policy st_erp_daily_admin on public.st_erp_daily_prices for select to authenticated using ((select public.is_admin()));
create policy st_erp_days_admin on public.st_erp_days for select to authenticated using ((select public.is_admin()));
create function public.st_erp_replace_day(p_date date,p_orders integer,p_skipped integer,p_groups jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_date < date '2026-01-01' or p_orders < 0 or p_skipped < 0 or jsonb_typeof(p_groups) <> 'array' then
  raise exception 'invalid ERP snapshot';
 end if;
 perform pg_advisory_xact_lock(42061, p_date - date '2026-01-01');
 delete from public.st_erp_daily_prices where rd_date=p_date;
 insert into public.st_erp_daily_prices(rd_date,parent_code,net_price,plan_qty)
 select p_date,parent_code,net_price,plan_qty
 from jsonb_to_recordset(p_groups) as x(parent_code text,net_price numeric,plan_qty numeric);
 insert into public.st_erp_days(rd_date,order_count,plan_qty,skipped_lines)
 values(p_date,p_orders,(select coalesce(sum(plan_qty),0) from public.st_erp_daily_prices where rd_date=p_date),p_skipped)
 on conflict(rd_date) do update set order_count=excluded.order_count,plan_qty=excluded.plan_qty,skipped_lines=excluded.skipped_lines,synced_at=now();
end;
$$;
revoke all on function public.st_erp_replace_day(date,integer,integer,jsonb) from public, anon, authenticated;
grant execute on function public.st_erp_replace_day(date,integer,integer,jsonb) to service_role;
