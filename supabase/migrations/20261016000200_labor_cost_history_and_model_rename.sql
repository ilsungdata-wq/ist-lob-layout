-- Labor cost is maintained separately by effective date. Earlier S/T history is never overwritten.
create table if not exists public.st_labor_cost_history (
  id bigint generated always as identity primary key,
  product_type text not null check (product_type in ('ALL','Smart','Tab','Block')),
  labor_cost numeric(14,3) not null check (labor_cost > 0),
  effective_date date not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(product_type,effective_date)
);
alter table public.st_labor_cost_history enable row level security;
revoke all on public.st_labor_cost_history from anon,authenticated;

insert into public.st_labor_cost_history(product_type,labor_cost,effective_date,note)
values
  ('Smart',3445,'2000-01-01','Mốc Labor cost ban đầu'),
  ('Block',3445,'2000-01-01','Mốc Labor cost ban đầu'),
  ('Tab',3566,'2000-01-01','Mốc Labor cost ban đầu')
on conflict (product_type,effective_date) do nothing;

create or replace function public.st_labor_cost_at(p_product_type text,p_effective_date date)
returns numeric language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(
    (select h.labor_cost from public.st_labor_cost_history h
      where h.product_type=case when p_product_type in ('Smart','Tab','Block') then p_product_type else 'Smart' end
        and h.effective_date<=coalesce(p_effective_date,current_date)
      order by h.effective_date desc,h.id desc limit 1),
    (select h.labor_cost from public.st_labor_cost_history h
      where h.product_type='ALL' and h.effective_date<=coalesce(p_effective_date,current_date)
      order by h.effective_date desc,h.id desc limit 1),
    case when p_product_type='Tab' then 3566 else 3445 end
  );
$$;

create or replace function public.get_st_labor_cost_history()
returns table(product_type text,labor_cost numeric,effective_date date,note text,created_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
  select h.product_type,h.labor_cost,h.effective_date,h.note,h.created_at
  from public.st_labor_cost_history h order by h.effective_date desc,h.id desc;
$$;

create or replace function public.apply_st_labor_cost(
  p_labor_cost numeric,
  p_effective_date date,
  p_product_type text default 'ALL',
  p_note text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_type text:=coalesce(nullif(trim(p_product_type),''),'ALL'); v_count integer:=0; v_date date:=coalesce(p_effective_date,current_date);
begin
  if not public.is_admin() then raise exception 'admin_required_to_update_labor_cost' using errcode='42501'; end if;
  if p_labor_cost is null or p_labor_cost<=0 then raise exception 'labor_cost_must_be_positive' using errcode='22023'; end if;
  if v_type not in ('ALL','Smart','Tab','Block') then raise exception 'invalid_labor_cost_type' using errcode='22023'; end if;
  if v_date>current_date then raise exception 'labor_cost_effective_date_cannot_be_in_future' using errcode='22023'; end if;
  insert into public.st_labor_cost_history(product_type,labor_cost,effective_date,note,created_by)
  values(v_type,p_labor_cost,v_date,nullif(trim(p_note),''),auth.uid())
  on conflict(product_type,effective_date) do update set labor_cost=excluded.labor_cost,note=excluded.note,created_at=now(),created_by=auth.uid();

  with changed as (
    update public.st_products p set
      labor_cost=p_labor_cost,
      current_st=round(p.current_price/p_labor_cost,6),
      latest_gap_st=round(p.current_price/p_labor_cost,6)-p.current_st,
      change_count=p.change_count+1,
      last_change_at=v_date::timestamptz,
      updated_at=now()
    where (v_type='ALL' or p.product_type=v_type) and p.labor_cost<>p_labor_cost
    returning p.product_code,p.current_price,p.current_st,p.latest_gap_st,p.labor_cost
  )
  insert into public.st_price_history(product_code,old_price,new_price,old_st,new_st,gap_st,change_date,reason,source)
  select product_code,current_price,current_price,current_st-latest_gap_st,current_st,latest_gap_st,v_date,
         coalesce(nullif(trim(p_note),''),'Cập nhật Labor cost'),'LABOR'
  from changed;
  get diagnostics v_count=row_count;
  return jsonb_build_object('updated',v_count,'effective_date',v_date,'product_type',v_type);
end;
$$;

alter table public.st_price_history drop constraint if exists st_price_history_source_check;
alter table public.st_price_history add constraint st_price_history_source_check check (source in ('ERP','VOC','LABOR'));

create or replace function public.import_st_erp_history(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb; code text; next_model text; next_type text; next_labor numeric; next_price numeric; effective_date date; next_st numeric; prior record; added integer:=0; skipped integer:=0;
begin
 if not public.is_admin() then raise exception 'admin_required_to_sync_st' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'erp_history_rows_must_be_an_array_of_at_most_1000_items' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  code:=upper(trim(item->>'product_code')); next_model:=trim(item->>'model_name'); next_type:=case when lower(trim(item->>'product_type'))='tab' then 'Tab' when lower(trim(item->>'product_type'))='block' then 'Block' else 'Smart' end;
  begin next_price:=(item->>'net_price')::numeric; effective_date:=(item->>'rd_date')::date; exception when others then next_price:=null; effective_date:=null; end;
  if code !~ '^GH96-[A-Z0-9]+$' or next_model is null or next_model='' or next_price is null or next_price<=1000 or effective_date is null then skipped:=skipped+1; continue; end if;
  next_labor:=public.st_labor_cost_at(next_type,effective_date); next_st:=round(next_price/next_labor,6);
  if exists(select 1 from public.st_price_history h where h.product_code=code and h.source='ERP' and h.change_date=effective_date and h.new_price=next_price) then skipped:=skipped+1; continue; end if;
  select h.new_price,h.new_st into prior from public.st_price_history h where h.product_code=code and h.change_date<effective_date order by h.change_date desc,h.id desc limit 1;
  insert into public.st_price_history(product_code,old_price,new_price,old_st,new_st,gap_st,change_date,reason,source)
  values(code,prior.new_price,next_price,prior.new_st,next_st,coalesce(next_st-prior.new_st,0),effective_date,'Lịch sử từ R/D date','ERP'); added:=added+1;
 end loop;
 return jsonb_build_object('inserted',added,'skipped',skipped);
end; $$;

create or replace function public.sync_st_erp_snapshot(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb; code text; next_model text; next_type text; next_labor numeric; next_price numeric; next_st numeric; product public.st_products%rowtype; price_changed boolean; mapping_changed boolean; inserted integer:=0; updated integer:=0; mapping_updated integer:=0; skipped integer:=0;
begin
 if not public.is_admin() then raise exception 'admin_required_to_sync_st' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'erp_rows_must_be_an_array_of_at_most_1000_items' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  code:=upper(trim(item->>'product_code')); next_model:=trim(item->>'model_name'); next_type:=case when lower(trim(item->>'product_type'))='tab' then 'Tab' when lower(trim(item->>'product_type'))='block' then 'Block' else 'Smart' end;
  begin next_price:=(item->>'net_price')::numeric; exception when others then next_price:=null; end;
  if code !~ '^GH96-[A-Z0-9]+$' or next_model is null or next_model='' or next_price is null or next_price<=1000 then skipped:=skipped+1; continue; end if;
  next_labor:=public.st_labor_cost_at(next_type,current_date); next_st:=round(next_price/next_labor,6);
  select * into product from public.st_products where product_code=code for update;
  if not found then
    insert into public.st_products(product_code,model_name,product_type,labor_cost,current_price,current_st,last_change_at,updated_at)
    values(code,next_model,next_type,next_labor,next_price,next_st,now(),now());
    insert into public.st_price_history(product_code,new_price,new_st,gap_st,change_date,reason,source)
    values(code,next_price,next_st,0,current_date,'Mốc ERP ban đầu','ERP'); inserted:=inserted+1; continue;
  end if;
  price_changed:=next_price<>product.current_price; mapping_changed:=next_model<>product.model_name or next_type<>product.product_type;
  if price_changed then
    insert into public.st_price_history(product_code,old_price,new_price,old_st,new_st,gap_st,change_date,reason,source)
    values(code,product.current_price,next_price,product.current_st,next_st,next_st-product.current_st,current_date,'Cập nhật giá ERP','ERP'); updated:=updated+1;
  elsif mapping_changed then mapping_updated:=mapping_updated+1; else skipped:=skipped+1; end if;
  update public.st_products set model_name=next_model,product_type=next_type,labor_cost=next_labor,current_price=next_price,current_st=next_st,
    latest_gap_st=case when price_changed then next_st-product.current_st else product.latest_gap_st end,
    change_count=case when price_changed then product.change_count+1 else product.change_count end,
    last_change_at=case when price_changed then now() else product.last_change_at end,updated_at=now() where product_code=code;
 end loop;
 return jsonb_build_object('inserted',inserted,'updated',updated,'mapping_updated',mapping_updated,'skipped',skipped);
end; $$;

create or replace function public.rename_model(p_model_id uuid,p_name text)
returns public.models language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.models; begin
 if not public.has_capability('model.manage',p_model_id,null) then raise exception 'model_manage_required' using errcode='42501'; end if;
 update public.models set model_name=nullif(trim(p_name),''),updated_at=now() where id=p_model_id and deleted_at is null returning * into v;
 if not found then raise exception 'model_not_found' using errcode='P0002'; end if;
 update public.layout_versions set
   layout_data=jsonb_set(coalesce(layout_data,'{}'::jsonb),'{name}',to_jsonb(v.model_name),true),
   published_snapshot=case when published_snapshot is null then null else jsonb_set(published_snapshot,'{name}',to_jsonb(v.model_name),true) end,
   updated_by=auth.uid(),updated_at=now()
 where model_id=v.id and deleted_at is null;
 perform public.write_audit('MODEL_RENAMED','model',v.id,v.id,null,jsonb_build_object('model_name',v.model_name)); return v;
end; $$;

revoke all on function public.st_labor_cost_at(text,date),public.get_st_labor_cost_history(),public.apply_st_labor_cost(numeric,date,text,text) from public;
grant execute on function public.get_st_labor_cost_history() to anon,authenticated;
grant execute on function public.apply_st_labor_cost(numeric,date,text,text) to authenticated;
