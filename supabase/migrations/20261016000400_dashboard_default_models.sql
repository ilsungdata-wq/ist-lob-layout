-- Global Home dashboard selection: independent from a single Model/Version.
alter table public.workspace_settings
  add column if not exists dashboard_default_models jsonb not null default '[]'::jsonb;

create or replace function public.get_dashboard_default_models()
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(dashboard_default_models,'[]'::jsonb)
  from public.workspace_settings where singleton=true;
$$;

create or replace function public.set_dashboard_default_models(p_models jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_models jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required_to_set_dashboard_default_models' using errcode='42501'; end if;
  if jsonb_typeof(p_models)<>'array' or jsonb_array_length(p_models)>200
    or exists(select 1 from jsonb_array_elements(p_models) x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}'))=0) then
    raise exception 'dashboard_default_models_must_be_an_array_of_model_names' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_models
  from (select distinct trim(value#>>'{}') as value from jsonb_array_elements(p_models)) s;
  update public.workspace_settings set dashboard_default_models=v_models,updated_at=now() where singleton=true;
  return v_models;
end;
$$;

revoke all on function public.get_dashboard_default_models(),public.set_dashboard_default_models(jsonb) from public;
grant execute on function public.get_dashboard_default_models() to anon,authenticated;
grant execute on function public.set_dashboard_default_models(jsonb) to authenticated;
