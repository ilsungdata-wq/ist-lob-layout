create function public.get_st_erp_catalog()
returns table(product_code text,model_name text,product_type text,labor_cost numeric,current_price numeric,current_st numeric,latest_gap_st numeric,change_count integer,last_change_at timestamptz,material_count integer)
language sql stable security definer set search_path='' as $$
 with dates as (
 select d.*, lag(net_price) over(partition by parent_code order by rd_date,net_price) previous_price,
 count(*) over(partition by parent_code,rd_date) day_prices
 from public.st_erp_daily_prices d
 ), summary as (
 select parent_code, count(*) filter(where previous_price is not null and previous_price<>net_price)::integer changes
 from dates group by parent_code
 ), latest as (
 select distinct on(parent_code) * from dates order by parent_code,rd_date desc,net_price desc
 )
 select d.parent_code,coalesce(p.model_name,b.model_name,'Chưa đối chiếu Model'),coalesce(p.product_type,b.product_type),
 coalesce(p.labor_cost,case when b.product_type='Tab' then 3566 when b.product_type in ('Smart','Block') then 3445 end)::numeric,
 case when d.day_prices=1 then d.net_price end,
 case when d.day_prices=1 then d.net_price/nullif(coalesce(p.labor_cost,case when b.product_type='Tab' then 3566 when b.product_type in ('Smart','Block') then 3445 end),0) end,
 case when d.day_prices=1 then (d.net_price-d.previous_price)/nullif(p.labor_cost,0) end,
 s.changes,d.rd_date::timestamptz,
 count(*) over(partition by coalesce(p.model_name,b.model_name))::integer
 from latest d join summary s on s.parent_code=d.parent_code
 left join public.st_products p on p.product_code=d.parent_code
 left join public.st_bom_catalog b on b.product_code=d.parent_code;
$$;
revoke all on function public.get_st_erp_catalog() from public,anon;
grant execute on function public.get_st_erp_catalog() to authenticated;
