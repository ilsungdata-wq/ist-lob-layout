begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('ADMIN','USER');
create type public.model_permission as enum ('VIEW','EDIT','MANAGE');
create type public.version_status as enum ('DRAFT','REVIEW','PUBLISHED','ARCHIVED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  email text not null,
  global_role public.app_role not null default 'USER',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.models (
  id uuid primary key default gen_random_uuid(),
  model_code text not null,
  model_name text,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_published_version_id uuid
);
create unique index models_model_code_key on public.models(lower(model_code));

create table public.layout_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete restrict,
  version_number text not null,
  status public.version_status not null default 'DRAFT',
  change_note text,
  based_on_version_id uuid references public.layout_versions(id) on delete set null,
  layout_data jsonb not null default '{"schemaVersion":1,"page":{"width":33,"height":8,"unit":"m","background":"#ffffff","gridSize":0.25},"objects":[]}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  unique(model_id, version_number),
  check (jsonb_typeof(layout_data) = 'object'),
  check ((status = 'PUBLISHED' and published_at is not null) or status <> 'PUBLISHED')
);

alter table public.models add constraint models_current_published_version_fk
  foreign key (current_published_version_id) references public.layout_versions(id) on delete set null;

create table public.model_permissions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission public.model_permission not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(model_id,user_id)
);

create table public.factory_symbols (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  asset_path text,
  default_width numeric(12,4) check (default_width is null or default_width > 0),
  default_height numeric(12,4) check (default_height is null or default_height > 0),
  default_style jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references public.models(id) on delete restrict,
  storage_bucket text not null default 'factory-assets',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/svg+xml','image/png','image/jpeg')),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum_sha256 text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  model_id uuid references public.models(id) on delete restrict,
  version_id uuid references public.layout_versions(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index layout_versions_model_id_idx on public.layout_versions(model_id);
create index layout_versions_model_version_idx on public.layout_versions(model_id,version_number);
create index layout_versions_status_idx on public.layout_versions(status);
create index model_permissions_model_id_idx on public.model_permissions(model_id);
create index model_permissions_user_id_idx on public.model_permissions(user_id);
create index audit_logs_model_id_idx on public.audit_logs(model_id);
create index audit_logs_version_id_idx on public.audit_logs(version_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index assets_model_id_idx on public.assets(model_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger models_touch before update on public.models for each row execute function public.touch_updated_at();
create trigger symbols_touch before update on public.factory_symbols for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name'))
  on conflict(id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke all on function public.touch_updated_at() from public;
revoke all on function public.handle_new_user() from public;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and global_role='ADMIN' and is_active)
$$;

create or replace function public.get_model_permission(p_model_id uuid) returns public.model_permission
language sql stable security definer set search_path = pg_catalog, public as $$
  select case
    when public.is_admin() then 'MANAGE'::public.model_permission
    else (select mp.permission from public.model_permissions mp join public.profiles p on p.id=mp.user_id
          where mp.model_id=p_model_id and mp.user_id=auth.uid() and p.is_active limit 1)
  end
$$;
create or replace function public.can_view_model(p_model_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.get_model_permission(p_model_id) is not null $$;
create or replace function public.can_edit_model(p_model_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.get_model_permission(p_model_id) in ('EDIT','MANAGE') $$;
create or replace function public.can_manage_model(p_model_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.get_model_permission(p_model_id)='MANAGE' $$;

revoke all on function public.is_admin() from public;
revoke all on function public.get_model_permission(uuid) from public;
revoke all on function public.can_view_model(uuid) from public;
revoke all on function public.can_edit_model(uuid) from public;
revoke all on function public.can_manage_model(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_model_permission(uuid) to authenticated;
grant execute on function public.can_view_model(uuid) to authenticated;
grant execute on function public.can_edit_model(uuid) to authenticated;
grant execute on function public.can_manage_model(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.models enable row level security;
alter table public.layout_versions enable row level security;
alter table public.model_permissions enable row level security;
alter table public.factory_symbols enable row level security;
alter table public.assets enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());
create policy models_read_allowed on public.models for select to authenticated using (public.can_view_model(id));
create policy versions_read_allowed on public.layout_versions for select to authenticated using (public.can_view_model(model_id));
create policy permissions_read_allowed on public.model_permissions for select to authenticated using (user_id=auth.uid() or public.can_manage_model(model_id));
create policy symbols_read_active on public.factory_symbols for select to authenticated using (is_active or public.is_admin());
create policy symbols_admin_write on public.factory_symbols for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy assets_read_allowed on public.assets for select to authenticated using (model_id is null or public.can_view_model(model_id));
create policy audit_read_allowed on public.audit_logs for select to authenticated using (public.is_admin() or (model_id is not null and public.can_manage_model(model_id)));

revoke all on public.profiles,public.models,public.layout_versions,public.model_permissions,public.factory_symbols,public.assets,public.audit_logs from anon,authenticated;
grant select on public.models,public.layout_versions,public.model_permissions,public.factory_symbols,public.assets,public.audit_logs to authenticated;
grant select,update(display_name) on public.profiles to authenticated;
grant insert,update,delete on public.factory_symbols to authenticated;

create or replace function public.write_audit(p_action text,p_entity_type text,p_entity_id uuid,p_model_id uuid,p_version_id uuid,p_metadata jsonb default '{}') returns void
language sql security definer set search_path=pg_catalog,public as $$
  insert into public.audit_logs(user_id,action,entity_type,entity_id,model_id,version_id,metadata)
  values(auth.uid(),p_action,p_entity_type,p_entity_id,p_model_id,p_version_id,coalesce(p_metadata,'{}'::jsonb))
$$;
revoke all on function public.write_audit(text,text,uuid,uuid,uuid,jsonb) from public,authenticated;

create or replace function public.create_model(p_model_code text,p_model_name text default null,p_description text default null)
returns public.models language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_model public.models;
begin
  if not public.is_admin() then raise exception 'admin_required_to_create_model' using errcode='42501'; end if;
  if nullif(trim(p_model_code),'') is null then raise exception 'model_code_required' using errcode='22023'; end if;
  insert into public.models(model_code,model_name,description,created_by)
  values(upper(trim(p_model_code)),nullif(trim(p_model_name),''),nullif(trim(p_description),''),auth.uid()) returning * into v_model;
  insert into public.model_permissions(model_id,user_id,permission,created_by) values(v_model.id,auth.uid(),'MANAGE',auth.uid());
  perform public.write_audit('MODEL_CREATED','model',v_model.id,v_model.id,null,jsonb_build_object('model_code',v_model.model_code));
  return v_model;
end $$;

create or replace function public.create_layout_version(p_model_id uuid,p_source_version_id uuid,p_version_number text,p_change_note text default null)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_source public.layout_versions; v_new public.layout_versions; v_layout jsonb;
begin
  if not public.can_edit_model(p_model_id) then raise exception 'edit_permission_required' using errcode='42501'; end if;
  if nullif(trim(p_version_number),'') is null then raise exception 'version_number_required' using errcode='22023'; end if;
  if p_source_version_id is not null then
    select * into v_source from public.layout_versions where id=p_source_version_id and model_id=p_model_id;
    if not found then raise exception 'source_version_not_found' using errcode='P0002'; end if;
    v_layout:=v_source.layout_data;
  else
    v_layout:='{"schemaVersion":1,"page":{"width":33,"height":8,"unit":"m","background":"#ffffff","gridSize":0.25},"objects":[]}'::jsonb;
  end if;
  insert into public.layout_versions(model_id,version_number,status,change_note,based_on_version_id,layout_data,created_by,updated_by)
  values(p_model_id,trim(p_version_number),'DRAFT',p_change_note,p_source_version_id,v_layout,auth.uid(),auth.uid()) returning * into v_new;
  perform public.write_audit('VERSION_CREATED','layout_version',v_new.id,p_model_id,v_new.id,jsonb_build_object('based_on_version_id',p_source_version_id));
  return v_new;
end $$;

create or replace function public.save_layout_version(p_version_id uuid,p_expected_revision integer,p_layout_data jsonb,p_change_note text default null)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_current public.layout_versions; v_saved public.layout_versions;
begin
  select * into v_current from public.layout_versions where id=p_version_id;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.can_edit_model(v_current.model_id) then raise exception 'edit_permission_required' using errcode='42501'; end if;
  if v_current.status<>'DRAFT' then raise exception 'published_or_archived_version_is_immutable' using errcode='55000'; end if;
  if jsonb_typeof(p_layout_data)<>'object' then raise exception 'invalid_layout_data' using errcode='22023'; end if;
  update public.layout_versions set layout_data=p_layout_data,change_note=coalesce(p_change_note,change_note),revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=p_version_id and revision=p_expected_revision and status='DRAFT' returning * into v_saved;
  if not found then raise exception 'revision_conflict' using errcode='40001', detail='Reload the current version before saving.'; end if;
  perform public.write_audit('LAYOUT_SAVED','layout_version',v_saved.id,v_saved.model_id,v_saved.id,jsonb_build_object('previous_revision',p_expected_revision,'revision',v_saved.revision));
  return v_saved;
end $$;

create or replace function public.publish_layout_version(p_version_id uuid)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions;
begin
  select * into v from public.layout_versions where id=p_version_id for update;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.can_manage_model(v.model_id) then raise exception 'manage_permission_required' using errcode='42501'; end if;
  if v.status not in ('DRAFT','REVIEW') then raise exception 'invalid_publish_transition' using errcode='55000'; end if;
  update public.layout_versions set status='PUBLISHED',published_by=auth.uid(),published_at=now(),updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  update public.models set current_published_version_id=v.id,updated_at=now() where id=v.model_id;
  perform public.write_audit('VERSION_PUBLISHED','layout_version',v.id,v.model_id,v.id,jsonb_build_object('version_number',v.version_number));
  return v;
end $$;

create or replace function public.archive_layout_version(p_version_id uuid)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions;
begin
  select lv.* into v from public.layout_versions lv join public.models m on m.id=lv.model_id where lv.id=p_version_id and m.current_published_version_id is distinct from lv.id for update;
  if not found then raise exception 'version_not_found_or_currently_published' using errcode='55000'; end if;
  if not public.can_manage_model(v.model_id) then raise exception 'manage_permission_required' using errcode='42501'; end if;
  update public.layout_versions set status='ARCHIVED',updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  perform public.write_audit('VERSION_ARCHIVED','layout_version',v.id,v.model_id,v.id,'{}'); return v;
end $$;

create or replace function public.set_model_permission(p_model_id uuid,p_user_id uuid,p_permission public.model_permission)
returns public.model_permissions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.model_permissions; v_action text;
begin
  if not public.can_manage_model(p_model_id) then raise exception 'manage_permission_required' using errcode='42501'; end if;
  select case when exists(select 1 from public.model_permissions where model_id=p_model_id and user_id=p_user_id) then 'PERMISSION_CHANGED' else 'PERMISSION_GRANTED' end into v_action;
  insert into public.model_permissions(model_id,user_id,permission,created_by) values(p_model_id,p_user_id,p_permission,auth.uid())
  on conflict(model_id,user_id) do update set permission=excluded.permission returning * into v;
  perform public.write_audit(v_action,'model_permission',v.id,p_model_id,null,jsonb_build_object('user_id',p_user_id,'permission',p_permission)); return v;
end $$;

create or replace function public.remove_model_permission(p_model_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  if not public.can_manage_model(p_model_id) then raise exception 'manage_permission_required' using errcode='42501'; end if;
  if p_user_id=auth.uid() and not public.is_admin() then raise exception 'cannot_remove_own_manage_permission' using errcode='55000'; end if;
  delete from public.model_permissions where model_id=p_model_id and user_id=p_user_id returning id into v_id;
  if v_id is not null then perform public.write_audit('PERMISSION_REMOVED','model_permission',v_id,p_model_id,null,jsonb_build_object('user_id',p_user_id)); end if;
end $$;

create or replace function public.register_asset(p_model_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_byte_size bigint default null,p_checksum_sha256 text default null)
returns public.assets language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.assets;
begin
  if not public.can_edit_model(p_model_id) then raise exception 'edit_permission_required' using errcode='42501'; end if;
  if p_storage_path not like p_model_id::text||'/%' then raise exception 'asset_path_must_start_with_model_id' using errcode='22023'; end if;
  insert into public.assets(model_id,storage_path,file_name,mime_type,byte_size,checksum_sha256,created_by)
  values(p_model_id,p_storage_path,p_file_name,p_mime_type,p_byte_size,p_checksum_sha256,auth.uid()) returning * into v;
  perform public.write_audit('ASSET_UPLOADED','asset',v.id,p_model_id,null,jsonb_build_object('storage_path',p_storage_path)); return v;
end $$;

create or replace function public.delete_asset_record(p_asset_id uuid) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.assets;
begin
  select * into v from public.assets where id=p_asset_id;
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  if not public.can_manage_model(v.model_id) then raise exception 'manage_permission_required' using errcode='42501'; end if;
  delete from public.assets where id=p_asset_id;
  perform public.write_audit('ASSET_DELETED','asset',v.id,v.model_id,null,jsonb_build_object('storage_path',v.storage_path)); return v.storage_path;
end $$;

revoke all on function public.create_model(text,text,text) from public;
revoke all on function public.create_layout_version(uuid,uuid,text,text) from public;
revoke all on function public.save_layout_version(uuid,integer,jsonb,text) from public;
revoke all on function public.publish_layout_version(uuid) from public;
revoke all on function public.archive_layout_version(uuid) from public;
revoke all on function public.set_model_permission(uuid,uuid,public.model_permission) from public;
revoke all on function public.remove_model_permission(uuid,uuid) from public;
revoke all on function public.register_asset(uuid,text,text,text,bigint,text) from public;
revoke all on function public.delete_asset_record(uuid) from public;
grant execute on function public.create_model(text,text,text) to authenticated;
grant execute on function public.create_layout_version(uuid,uuid,text,text) to authenticated;
grant execute on function public.save_layout_version(uuid,integer,jsonb,text) to authenticated;
grant execute on function public.publish_layout_version(uuid) to authenticated;
grant execute on function public.archive_layout_version(uuid) to authenticated;
grant execute on function public.set_model_permission(uuid,uuid,public.model_permission) to authenticated;
grant execute on function public.remove_model_permission(uuid,uuid) to authenticated;
grant execute on function public.register_asset(uuid,text,text,text,bigint,text) to authenticated;
grant execute on function public.delete_asset_record(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('factory-assets','factory-assets',false,10485760,array['image/svg+xml','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy factory_assets_read on storage.objects for select to authenticated using (
  bucket_id='factory-assets'
  and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  and public.can_view_model(((storage.foldername(name))[1])::uuid)
);
create policy factory_assets_upload on storage.objects for insert to authenticated with check (
  bucket_id='factory-assets'
  and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  and public.can_edit_model(((storage.foldername(name))[1])::uuid)
);
create policy factory_assets_update on storage.objects for update to authenticated using (
  bucket_id='factory-assets'
  and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  and public.can_edit_model(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id='factory-assets'
  and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  and public.can_edit_model(((storage.foldername(name))[1])::uuid)
);
create policy factory_assets_delete on storage.objects for delete to authenticated using (
  bucket_id='factory-assets'
  and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  and public.can_manage_model(((storage.foldername(name))[1])::uuid)
);

commit;
