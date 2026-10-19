-- Viewer access password for the Standard Time page. The password itself is never returned to the client.
create table if not exists public.st_view_access_settings (
  singleton_id boolean primary key default true check (singleton_id),
  password_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.st_view_access_settings enable row level security;
revoke all on public.st_view_access_settings from anon, authenticated;
insert into public.st_view_access_settings(singleton_id,password_hash)
values (true,'b22107a060d0c38cf72c6ea24db9f5c072fd17320af5f25952445b21ce44bec0')
on conflict (singleton_id) do nothing;
create or replace function public.verify_st_view_password(p_password text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,extensions as $$
  select coalesce((select password_hash=encode(digest('IST_ST_VIEW_V1:'||coalesce(p_password,''),'sha256'),'hex') from public.st_view_access_settings where singleton_id=true),false)
$$;
create or replace function public.get_st_view_password_status()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,extensions as $$
declare v public.st_view_access_settings;
begin
  if not public.has_capability('permission.manage',null,null) then raise exception 'permission_manage_required' using errcode='42501'; end if;
  select * into v from public.st_view_access_settings where singleton_id=true;
  return jsonb_build_object('updated_at',v.updated_at);
end $$;
create or replace function public.set_st_view_password(p_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_password text:=trim(coalesce(p_password,'')); v_updated timestamptz;
begin
  if not public.has_capability('permission.manage',null,null) then raise exception 'permission_manage_required' using errcode='42501'; end if;
  if length(v_password)<8 then raise exception 'st_view_password_minimum_8_characters' using errcode='22023'; end if;
  update public.st_view_access_settings set password_hash=encode(digest('IST_ST_VIEW_V1:'||v_password,'sha256'),'hex'),updated_at=now(),updated_by=auth.uid() where singleton_id=true returning updated_at into v_updated;
  return jsonb_build_object('updated_at',v_updated);
end $$;
revoke all on function public.verify_st_view_password(text),public.get_st_view_password_status(),public.set_st_view_password(text) from public;
grant execute on function public.verify_st_view_password(text) to anon,authenticated;
grant execute on function public.get_st_view_password_status(),public.set_st_view_password(text) to authenticated;
