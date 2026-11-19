create view public.st_erp_periods with (security_invoker=true) as
with daily as (
 select d.*,count(*) over(partition by parent_code,rd_date)>1 mixed,
 lag(net_price) over(partition by parent_code order by rd_date,net_price) prev
 from public.st_erp_daily_prices d
), tagged as (
 select *,sum(case when prev is distinct from net_price or mixed then 1 else 0 end)
 over(partition by parent_code order by rd_date,net_price) grp from daily
), grouped as (
 select parent_code,grp,net_price,min(rd_date) start_date,max(rd_date) last_plan,
 sum(plan_qty) plan_qty,count(distinct rd_date) plan_days,bool_or(mixed) mixed
 from tagged group by parent_code,grp,net_price
), periods as (
 select *,lead(start_date) over(partition by parent_code order by start_date,net_price) next_date,
 lag(net_price) over(partition by parent_code order by start_date,net_price) old_price,
 lag(mixed) over(partition by parent_code order by start_date,net_price) old_mixed from grouped
)
select p.*,coalesce(c.model_name,'Chưa đối chiếu Model') model_name,c.product_type,c.labor_cost,
 case when mixed then start_date else coalesce(next_date-1,(now() at time zone 'Asia/Bangkok')::date) end end_date,
 case when mixed then null else p.net_price/nullif(c.labor_cost,0) end new_st,
 case when mixed or old_mixed then null else (p.net_price-old_price)*plan_qty end gap_value,
 n.reason,n.voc_code,n.voc_url
from periods p left join public.st_products c on c.product_code=p.parent_code
left join public.st_erp_price_notes n on n.parent_code=p.parent_code and n.change_date=p.start_date and n.net_price=p.net_price;
grant select on public.st_erp_periods to authenticated;

create or replace function public.get_st_history(p_product_code text)
returns table(id bigint,old_price numeric,new_price numeric,old_st numeric,new_st numeric,gap_st numeric,change_date date,reason text,voc_code text,source text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select row_number() over(order by start_date,net_price),old_price,net_price,
 old_price/nullif(labor_cost,0),new_st,(net_price-old_price)/nullif(labor_cost,0),
 start_date,reason,voc_code,'ERP'::text,start_date::timestamptz
 from public.st_erp_periods ep where parent_code=upper(trim(p_product_code)) order by ep.start_date desc,ep.net_price desc
$$;
create or replace function public.get_st_model_history(p_model_name text)
returns table(model_name text,product_code text,old_price numeric,new_price numeric,old_st numeric,new_st numeric,gap_st numeric,change_date date,reason text,source text)
language sql stable security definer set search_path='' as $$
 select model_name,parent_code,old_price,net_price,old_price/nullif(labor_cost,0),new_st,
 (net_price-old_price)/nullif(labor_cost,0),start_date,reason,'ERP'::text
 from public.st_erp_periods ep where ep.model_name=trim(p_model_name) order by ep.start_date,ep.parent_code,ep.net_price
$$;
