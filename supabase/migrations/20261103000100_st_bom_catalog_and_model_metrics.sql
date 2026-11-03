-- BOM is the authoritative mapping for Parent Code, Model and Type. ERP remains a compact price feed.
create table if not exists public.st_bom_catalog (
  product_code text primary key check (product_code ~ '^GH96-[A-Z0-9]+$'),
  model_name text not null,
  product_type text not null check (product_type in ('Smart','Tab','Block')),
  updated_at timestamptz not null default now()
);
alter table public.st_bom_catalog enable row level security;
revoke all on public.st_bom_catalog from anon, authenticated;

create or replace function public.sync_st_bom_catalog(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb; code text; next_model text; next_type text; inserted_count integer:=0; updated_count integer:=0; invalid_count integer:=0;
begin
 if not public.is_admin() then raise exception 'admin_required_to_sync_st' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>5000 then raise exception 'bom_rows_must_be_an_array_of_at_most_5000_items' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  code:=upper(trim(item->>'product_code')); next_model:=trim(item->>'model_name');
  next_type:=case lower(trim(item->>'product_type')) when 'tab' then 'Tab' when 'block' then 'Block' else 'Smart' end;
  if code !~ '^GH96-[A-Z0-9]+$' or coalesce(next_model,'')='' then invalid_count:=invalid_count+1; continue; end if;
  if exists(select 1 from public.st_bom_catalog where product_code=code) then
   update public.st_bom_catalog as b set model_name=next_model,product_type=next_type,updated_at=now()
    where b.product_code=code and (b.model_name,b.product_type) is distinct from (next_model,next_type);
   if found then updated_count:=updated_count+1; end if;
  else
   insert into public.st_bom_catalog(product_code,model_name,product_type) values(code,next_model,next_type); inserted_count:=inserted_count+1;
  end if;
 end loop;
 return jsonb_build_object('inserted',inserted_count,'updated',updated_count,'invalid',invalid_count);
end $$;

create or replace function public.get_st_bom_price_entry_catalog()
returns table(product_code text,model_name text,product_type text,current_price numeric,current_st numeric)
language sql stable security definer set search_path=pg_catalog,public as $$
 select b.product_code,b.model_name,b.product_type,p.current_price,p.current_st
 from public.st_bom_catalog b left join public.st_products p on p.product_code=b.product_code
 order by b.model_name,b.product_code;
$$;

create or replace function public.apply_st_manual_price(p_product_code text,p_net_price numeric,p_effective_date date default current_date,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.st_bom_catalog%rowtype; old public.st_products%rowtype; next_labor numeric; next_st numeric; created boolean:=false;
begin
 if not public.is_admin() then raise exception 'admin_required_to_update_st_price' using errcode='42501'; end if;
 select * into b from public.st_bom_catalog where product_code=upper(trim(p_product_code));
 if not found then raise exception 'parent_code_not_found_in_bom' using errcode='22023'; end if;
 if p_net_price is null or p_net_price<=1000 then raise exception 'net_price_must_be_greater_than_1000' using errcode='22023'; end if;
 next_labor:=case when b.product_type='Tab' then 3566 else 3445 end; next_st:=round(p_net_price/next_labor,6);
 select * into old from public.st_products where product_code=b.product_code for update;
 if not found then
  insert into public.st_products(product_code,model_name,product_type,labor_cost,current_price,current_st,last_change_at,updated_at)
  values(b.product_code,b.model_name,b.product_type,next_labor,p_net_price,next_st,now(),now());
  insert into public.st_price_history(product_code,new_price,new_st,gap_st,change_date,reason,source)
  values(b.product_code,p_net_price,next_st,0,coalesce(p_effective_date,current_date),coalesce(nullif(trim(p_reason),''),'Nhập giá thủ công'),'ERP');
  created:=true;
 else
  insert into public.st_price_history(product_code,old_price,new_price,old_st,new_st,gap_st,change_date,reason,source)
  values(b.product_code,old.current_price,p_net_price,old.current_st,next_st,next_st-old.current_st,coalesce(p_effective_date,current_date),coalesce(nullif(trim(p_reason),''),'Cập nhật giá thủ công'),'ERP');
  update public.st_products set model_name=b.model_name,product_type=b.product_type,labor_cost=next_labor,current_price=p_net_price,current_st=next_st,
   latest_gap_st=next_st-old.current_st,change_count=change_count+1,last_change_at=now(),updated_at=now() where product_code=b.product_code;
 end if;
 return jsonb_build_object('created',created,'product_code',b.product_code,'model_name',b.model_name,'current_st',next_st);
end $$;

create or replace function public.get_st_model_layout_metrics(p_model_name text)
returns table(model_name text,direct_mp numeric,line_value text,type_value text,version_number text,process_count integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 with chosen as (
  select m.model_name,lv.version_number,coalesce(lv.published_snapshot,lv.layout_data,'{}'::jsonb) as data
  from public.models m join public.layout_versions lv on lv.id=m.current_published_version_id
  where lower(m.model_name)=lower(trim(p_model_name)) or lower(m.model_code)=lower(trim(p_model_name))
  limit 1
 ), processes as (
  select c.*,p as process from chosen c cross join lateral jsonb_array_elements(coalesce(c.data->'processes','[]'::jsonb)) p
 )
 select c.model_name,
  coalesce((select sum(coalesce(nullif(regexp_replace(coalesce(p.process->>'mp',p.process->>'manpower','0'),'[^0-9.]','','g'),''),'0')::numeric)
   from processes p where lower(coalesce(p.process->>'name',p.process->>'stationName','')) !~ '(iqc|vision|oqc|pqc|leader|support)'),0),
  coalesce(c.data->>'line',c.data->'model'->>'line','—'),
  coalesce(c.data->>'type',c.data->'model'->>'type','—'),c.version_number,
  coalesce((select count(*)::integer from processes p),0)
 from chosen c;
$$;

revoke all on function public.sync_st_bom_catalog(jsonb),public.get_st_bom_price_entry_catalog(),public.apply_st_manual_price(text,numeric,date,text),public.get_st_model_layout_metrics(text) from public;
grant execute on function public.sync_st_bom_catalog(jsonb),public.get_st_bom_price_entry_catalog(),public.apply_st_manual_price(text,numeric,date,text) to authenticated;
grant execute on function public.get_st_model_layout_metrics(text) to anon,authenticated;




