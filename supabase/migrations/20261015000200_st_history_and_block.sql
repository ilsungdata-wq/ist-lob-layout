-- Historical ERP prices from R/D date, compacted to distinct price points only.
alter table public.st_products drop constraint if exists st_products_product_type_check;
alter table public.st_products add constraint st_products_product_type_check check (product_type in ('Smart','Tab','Block'));

drop function if exists public.get_st_catalog();
create or replace function public.get_st_catalog()
returns table(product_code text,model_name text,product_type text,labor_cost numeric,current_price numeric,current_st numeric,latest_gap_st numeric,change_count integer,last_change_at timestamptz,material_count integer)
language sql stable security definer set search_path=pg_catalog,public as $$
  select p.product_code,p.model_name,p.product_type,p.labor_cost,p.current_price,p.current_st,p.latest_gap_st,
    greatest((select count(*)::integer-1 from public.st_price_history h where h.product_code=p.product_code),0),p.last_change_at,
    count(*) over(partition by p.model_name)::integer
  from public.st_products p where p.current_price>1000 order by p.model_name,p.product_code;
$$;

create or replace function public.get_st_model_history(p_model_name text)
returns table(model_name text,product_code text,old_price numeric,new_price numeric,old_st numeric,new_st numeric,gap_st numeric,change_date date,reason text,source text)
language sql stable security definer set search_path=pg_catalog,public as $$
  select p.model_name,h.product_code,h.old_price,h.new_price,h.old_st,h.new_st,h.gap_st,h.change_date,h.reason,h.source
  from public.st_price_history h join public.st_products p on p.product_code=h.product_code
  where p.model_name=trim(p_model_name) order by h.change_date,h.id limit 5000;
$$;

create or replace function public.import_st_erp_history(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb; code text; next_model text; next_type text; next_labor numeric; next_price numeric; effective_date date; next_st numeric; prior record; added integer:=0; skipped integer:=0;
begin
 if not public.is_admin() then raise exception 'admin_required_to_sync_st' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'erp_history_rows_must_be_an_array_of_at_most_1000_items' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  code:=upper(trim(item->>'product_code')); next_model:=trim(item->>'model_name'); next_type:=case when lower(trim(item->>'product_type'))='tab' then 'Tab' when lower(trim(item->>'product_type'))='block' then 'Block' else 'Smart' end; next_labor:=case when next_type='Tab' then 3566 else 3445 end;
  begin next_price:=(item->>'net_price')::numeric; effective_date:=(item->>'rd_date')::date; exception when others then next_price:=null; effective_date:=null; end;
  if code !~ '^GH96-[A-Z0-9]+$' or next_model is null or next_model='' or next_price is null or next_price<=1000 or effective_date is null then skipped:=skipped+1; continue; end if;
  next_st:=round(next_price/next_labor,6);
  if exists(select 1 from public.st_price_history h where h.product_code=code and h.source='ERP' and h.change_date=effective_date and h.new_price=next_price) then skipped:=skipped+1; continue; end if;
  select h.new_price,h.new_st into prior from public.st_price_history h where h.product_code=code and h.source='ERP' and h.change_date<effective_date order by h.change_date desc,h.id desc limit 1;
  insert into public.st_price_history(product_code,old_price,new_price,old_st,new_st,gap_st,change_date,reason,source)
  values(code,prior.new_price,next_price,prior.new_st,next_st,coalesce(next_st-prior.new_st,0),effective_date,'Lịch sử từ R/D date','ERP');
  added:=added+1;
 end loop;
 return jsonb_build_object('inserted',added,'skipped',skipped);
end; $$;

revoke all on function public.get_st_catalog() from public;
revoke all on function public.get_st_model_history(text) from public;
revoke all on function public.import_st_erp_history(jsonb) from public;
grant execute on function public.get_st_catalog() to anon,authenticated;
grant execute on function public.get_st_model_history(text) to anon,authenticated;
grant execute on function public.import_st_erp_history(jsonb) to authenticated;
