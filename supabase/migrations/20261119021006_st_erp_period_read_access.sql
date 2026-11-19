create function public.get_st_erp_periods()
returns setof public.st_erp_periods language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'admin_required'; end if;
 return query select * from public.st_erp_periods order by parent_code,start_date,net_price;
end $$;
revoke all on function public.get_st_erp_periods() from public,anon;
grant execute on function public.get_st_erp_periods() to authenticated;