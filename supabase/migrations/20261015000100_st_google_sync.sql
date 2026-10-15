-- Incremental Google Sheet synchronization. The client sends only unique, BOM-mapped codes.
create or replace function public.sync_st_erp_snapshot(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  item jsonb;
  code text;
  next_model text;
  next_type text;
  next_labor numeric;
  next_price numeric;
  product public.st_products%rowtype;
  next_st numeric;
  price_changed boolean;
  mapping_changed boolean;
  inserted_count integer := 0;
  updated_count integer := 0;
  mapping_count integer := 0;
  unchanged_count integer := 0;
  invalid_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'admin_required_to_sync_st' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'erp_rows_must_be_an_array_of_at_most_1000_items' using errcode='22023';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    code := upper(trim(item->>'product_code'));
    next_model := trim(item->>'model_name');
    next_type := case when lower(trim(item->>'product_type'))='tab' then 'Tab' else 'Smart' end;
    next_labor := case when next_type='Tab' then 3566 else 3445 end;
    begin next_price := (item->>'net_price')::numeric; exception when others then next_price := null; end;

    if code !~ '^GH96-[A-Z0-9]+$' or next_model is null or next_model='' or next_price is null or next_price<=1000 then
      invalid_count := invalid_count + 1;
      continue;
    end if;

    select * into product from public.st_products where product_code=code for update;
    next_st := round(next_price/next_labor,6);

    if not found then
      insert into public.st_products(product_code,model_name,product_type,labor_cost,current_price,current_st,last_change_at,updated_at)
      values(code,next_model,next_type,next_labor,next_price,next_st,now(),now());
      insert into public.st_price_history(product_code,new_price,new_st,gap_st,change_date,reason,source)
      values(code,next_price,next_st,0,current_date,'Thêm mã mới từ Google Sheet','ERP');
      inserted_count := inserted_count + 1;
      continue;
    end if;

    price_changed := next_price<>product.current_price;
    mapping_changed := next_model<>product.model_name or next_type<>product.product_type or next_labor<>product.labor_cost;
    if not price_changed and not mapping_changed then
      unchanged_count := unchanged_count + 1;
      continue;
    end if;

    if price_changed or next_st<>product.current_st then
      insert into public.st_price_history(product_code,old_price,new_price,old_st,new_st,gap_st,change_date,reason,source)
      values(code,product.current_price,next_price,product.current_st,next_st,next_st-product.current_st,current_date,
             case when mapping_changed then 'Cập nhật giá và định danh từ Google Sheet' else null end,'ERP');
      updated_count := updated_count + 1;
    else
      mapping_count := mapping_count + 1;
    end if;

    update public.st_products
    set model_name=next_model,product_type=next_type,labor_cost=next_labor,current_price=next_price,current_st=next_st,
        latest_gap_st=case when price_changed or next_st<>product.current_st then next_st-product.current_st else latest_gap_st end,
        change_count=case when price_changed or next_st<>product.current_st then product.change_count+1 else product.change_count end,
        last_change_at=case when price_changed or next_st<>product.current_st then now() else product.last_change_at end,
        updated_at=now()
    where product_code=code;
  end loop;

  return jsonb_build_object('inserted',inserted_count,'updated',updated_count,'mapping_updated',mapping_count,
                            'unchanged',unchanged_count,'invalid',invalid_count);
end;
$$;
revoke all on function public.sync_st_erp_snapshot(jsonb) from public;
grant execute on function public.sync_st_erp_snapshot(jsonb) to authenticated;
