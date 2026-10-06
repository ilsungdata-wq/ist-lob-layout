begin;

alter table public.models add column if not exists deleted_at timestamptz;
alter table public.models add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.layout_versions add column if not exists deleted_at timestamptz;
alter table public.layout_versions add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.layout_versions add column if not exists published_snapshot jsonb;
alter table public.layout_versions add column if not exists published_revision integer;

update public.layout_versions
set published_snapshot=layout_data, published_revision=revision
where status='PUBLISHED' and published_snapshot is null;

create table if not exists public.capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid references public.models(id) on delete cascade,
  version_id uuid references public.layout_versions(id) on delete cascade,
  capability text not null check (capability in (
    'layout.view','layout.edit','lob.view','lob.edit','tt.measure',
    'equipment.view','equipment.edit','jig.edit','excel.import',
    'model.create','model.manage','model.delete','version.create',
    'version.manage','version.delete','version.publish','history.view',
    'history.restore','permission.manage'
  )),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (version_id is null or model_id is not null),
  unique nulls not distinct(user_id,model_id,version_id,capability)
);
create index if not exists capability_grants_user_idx on public.capability_grants(user_id);
create index if not exists capability_grants_model_idx on public.capability_grants(model_id);

create table if not exists public.version_revisions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete restrict,
  version_id uuid not null references public.layout_versions(id) on delete restrict,
  revision integer not null check (revision > 0),
  module text not null check (module in ('LAYOUT','LOB','EQUIPMENT','JIG','MODEL','VERSION')),
  action text not null check (action in ('INITIAL','SAVE','RESTORE','PUBLISH')),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  restored_from_id uuid references public.version_revisions(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  created_at timestamptz not null default now(),
  unique(version_id,revision,action)
);
create index if not exists version_revisions_version_idx on public.version_revisions(version_id,revision desc);
create index if not exists version_revisions_model_idx on public.version_revisions(model_id,created_at desc);

alter table public.version_revisions add column if not exists user_email text;

insert into public.version_revisions(model_id,version_id,revision,module,action,snapshot,user_id,user_email,created_at)
select lv.model_id,lv.id,lv.revision,'LAYOUT','INITIAL',lv.layout_data,coalesce(lv.updated_by,lv.created_by),p.email,lv.updated_at
from public.layout_versions lv left join public.profiles p on p.id=coalesce(lv.updated_by,lv.created_by)
on conflict(version_id,revision,action) do nothing;

alter table public.capability_grants enable row level security;
alter table public.version_revisions enable row level security;

create or replace function public.has_capability(p_capability text,p_model_id uuid default null,p_version_id uuid default null)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.is_admin() or exists(
    select 1 from public.capability_grants cg
    join public.profiles p on p.id=cg.user_id
    where cg.user_id=auth.uid() and cg.is_active and p.is_active
      and cg.capability=p_capability
      and (cg.model_id is null or cg.model_id=p_model_id)
      and (cg.version_id is null or cg.version_id=p_version_id)
  ) or exists(
    select 1 from public.model_permissions mp join public.profiles p on p.id=mp.user_id
    where mp.user_id=auth.uid() and mp.model_id=p_model_id and p.is_active and (
      (mp.permission='VIEW' and p_capability in ('layout.view','lob.view','equipment.view')) or
      (mp.permission='EDIT' and p_capability in ('layout.view','layout.edit','lob.view','lob.edit','tt.measure','equipment.view','equipment.edit','jig.edit','excel.import','version.create','history.view')) or
      (mp.permission='MANAGE' and p_capability not in ('model.create','permission.manage'))
    )
  )
$$;
revoke all on function public.has_capability(text,uuid,uuid) from public;
grant execute on function public.has_capability(text,uuid,uuid) to authenticated;

create or replace function public.can_view_model(p_model_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.models where id=p_model_id and deleted_at is null)
    and (public.has_capability('layout.view',p_model_id,null) or public.has_capability('lob.view',p_model_id,null) or public.has_capability('equipment.view',p_model_id,null))
$$;
create or replace function public.can_edit_model(p_model_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.models where id=p_model_id and deleted_at is null)
    and (public.has_capability('layout.edit',p_model_id,null) or public.has_capability('lob.edit',p_model_id,null) or public.has_capability('equipment.edit',p_model_id,null))
$$;
create or replace function public.can_manage_model(p_model_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.models where id=p_model_id and deleted_at is null)
    and public.has_capability('model.manage',p_model_id,null)
$$;

drop policy if exists capability_grants_read on public.capability_grants;
create policy capability_grants_read on public.capability_grants for select to authenticated
using (user_id=auth.uid() or public.is_admin());
drop policy if exists version_revisions_read on public.version_revisions;
create policy version_revisions_read on public.version_revisions for select to authenticated
using (public.has_capability('history.view',model_id,version_id));
revoke all on public.capability_grants,public.version_revisions from anon,authenticated;
grant select on public.capability_grants,public.version_revisions to authenticated;

create or replace function public.get_my_capabilities(p_model_id uuid,p_version_id uuid default null)
returns table(capability text) language sql stable security definer set search_path=pg_catalog,public as $$
  select c.capability from (values
    ('layout.view'),('layout.edit'),('lob.view'),('lob.edit'),('tt.measure'),
    ('equipment.view'),('equipment.edit'),('jig.edit'),('excel.import'),
    ('model.create'),('model.manage'),('model.delete'),('version.create'),
    ('version.manage'),('version.delete'),('version.publish'),('history.view'),
    ('history.restore'),('permission.manage')
  ) c(capability) where public.has_capability(c.capability,p_model_id,p_version_id)
$$;

create or replace function public.create_model(p_model_code text,p_model_name text default null,p_description text default null)
returns public.models language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.models;
begin
  if not public.has_capability('model.create',null,null) then raise exception 'model_create_required' using errcode='42501'; end if;
  if nullif(trim(p_model_code),'') is null then raise exception 'model_code_required' using errcode='22023'; end if;
  insert into public.models(model_code,model_name,description,created_by)
  values(upper(trim(p_model_code)),nullif(trim(p_model_name),''),nullif(trim(p_description),''),auth.uid()) returning * into v;
  insert into public.model_permissions(model_id,user_id,permission,created_by)
  values(v.id,auth.uid(),'MANAGE',auth.uid()) on conflict(model_id,user_id) do nothing;
  perform public.write_audit('MODEL_CREATED','model',v.id,v.id,null,jsonb_build_object('model_code',v.model_code));
  return v;
end $$;

create or replace function public.create_layout_version(p_model_id uuid,p_source_version_id uuid,p_version_number text,p_change_note text default null)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare source public.layout_versions; v public.layout_versions; payload jsonb;
begin
  if not public.has_capability('version.create',p_model_id,p_source_version_id) then raise exception 'version_create_required' using errcode='42501'; end if;
  if nullif(trim(p_version_number),'') is null then raise exception 'version_number_required' using errcode='22023'; end if;
  if p_source_version_id is not null then
    select * into source from public.layout_versions where id=p_source_version_id and model_id=p_model_id and deleted_at is null;
    if not found then raise exception 'source_version_not_found' using errcode='P0002'; end if;
    payload:=source.layout_data;
  else payload:='{"schemaVersion":1,"page":{"width":33,"height":8,"unit":"m","background":"#ffffff","gridSize":0.25},"objects":[]}'::jsonb;
  end if;
  insert into public.layout_versions(model_id,version_number,status,change_note,based_on_version_id,layout_data,created_by,updated_by)
  values(p_model_id,trim(p_version_number),'DRAFT',p_change_note,p_source_version_id,payload,auth.uid(),auth.uid()) returning * into v;
  insert into public.version_revisions(model_id,version_id,revision,module,action,snapshot,user_id,user_email)
  values(v.model_id,v.id,v.revision,'VERSION','INITIAL',v.layout_data,auth.uid(),(select email from public.profiles where id=auth.uid()));
  perform public.write_audit('VERSION_CREATED','layout_version',v.id,p_model_id,v.id,jsonb_build_object('based_on_version_id',p_source_version_id));
  return v;
end $$;

create or replace function public.save_layout_revision(p_version_id uuid,p_expected_revision integer,p_layout_data jsonb,p_module text default 'LAYOUT',p_change_note text default null)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions; v_cap text;
begin
  select * into v from public.layout_versions where id=p_version_id and deleted_at is null for update;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  v_cap:=case upper(p_module) when 'LOB' then 'lob.edit' when 'EQUIPMENT' then 'equipment.edit' when 'JIG' then 'jig.edit' else 'layout.edit' end;
  if not public.has_capability(v_cap,v.model_id,v.id) then raise exception 'capability_required:%',v_cap using errcode='42501'; end if;
  if v.status='ARCHIVED' then raise exception 'archived_version_is_immutable' using errcode='55000'; end if;
  if jsonb_typeof(p_layout_data)<>'object' then raise exception 'invalid_layout_data' using errcode='22023'; end if;
  if v.revision<>p_expected_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
  update public.layout_versions set layout_data=p_layout_data,change_note=coalesce(p_change_note,change_note),revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=v.id and revision=p_expected_revision returning * into v;
  insert into public.version_revisions(model_id,version_id,revision,module,action,snapshot,user_id,user_email)
  values(v.model_id,v.id,v.revision,upper(p_module),'SAVE',v.layout_data,auth.uid(),(select email from public.profiles where id=auth.uid()));
  perform public.write_audit(upper(p_module)||'_SAVED','layout_version',v.id,v.model_id,v.id,jsonb_build_object('revision',v.revision));
  return v;
end $$;

create or replace function public.restore_layout_revision(p_history_id uuid,p_expected_revision integer)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare h public.version_revisions; v public.layout_versions;
begin
  select * into h from public.version_revisions where id=p_history_id;
  if not found then raise exception 'history_not_found' using errcode='P0002'; end if;
  if not public.has_capability('history.restore',h.model_id,h.version_id) then raise exception 'history_restore_required' using errcode='42501'; end if;
  select * into v from public.layout_versions where id=h.version_id and deleted_at is null for update;
  if v.status='ARCHIVED' then raise exception 'archived_version_is_immutable' using errcode='55000'; end if;
  if v.revision<>p_expected_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
  update public.layout_versions set layout_data=h.snapshot,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  insert into public.version_revisions(model_id,version_id,revision,module,action,snapshot,restored_from_id,user_id,user_email)
  values(v.model_id,v.id,v.revision,h.module,'RESTORE',v.layout_data,h.id,auth.uid(),(select email from public.profiles where id=auth.uid()));
  perform public.write_audit('REVISION_RESTORED','layout_version',v.id,v.model_id,v.id,jsonb_build_object('revision',v.revision,'restored_from_revision',h.revision,'history_id',h.id));
  return v;
end $$;

create or replace function public.publish_layout_version(p_version_id uuid)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions;
begin
  select * into v from public.layout_versions where id=p_version_id and deleted_at is null for update;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.has_capability('version.publish',v.model_id,v.id) then raise exception 'version_publish_required' using errcode='42501'; end if;
  if v.status='ARCHIVED' then raise exception 'archived_version_is_immutable' using errcode='55000'; end if;
  update public.layout_versions set status='PUBLISHED',published_snapshot=layout_data,published_revision=revision,published_by=auth.uid(),published_at=now(),updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  update public.models set current_published_version_id=v.id,updated_at=now() where id=v.model_id;
  insert into public.version_revisions(model_id,version_id,revision,module,action,snapshot,user_id,user_email)
  values(v.model_id,v.id,v.revision,'VERSION','PUBLISH',v.layout_data,auth.uid(),(select email from public.profiles where id=auth.uid())) on conflict(version_id,revision,action) do nothing;
  perform public.write_audit('VERSION_PUBLISHED','layout_version',v.id,v.model_id,v.id,jsonb_build_object('version_number',v.version_number,'revision',v.revision));
  return v;
end $$;

create or replace function public.get_published_versions(p_model_id uuid default null)
returns table(id uuid,model_id uuid,version_number text,status public.version_status,change_note text,layout_data jsonb,revision integer,created_at timestamptz,updated_at timestamptz,published_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
  select lv.id,lv.model_id,lv.version_number,lv.status,lv.change_note,coalesce(lv.published_snapshot,lv.layout_data),coalesce(lv.published_revision,lv.revision),lv.created_at,lv.updated_at,lv.published_at
  from public.layout_versions lv join public.models m on m.id=lv.model_id
  where lv.status='PUBLISHED' and lv.deleted_at is null and m.deleted_at is null and m.status='ACTIVE'
    and (p_model_id is null or lv.model_id=p_model_id)
$$;

create or replace function public.set_capability_grant(p_user_id uuid,p_model_id uuid,p_version_id uuid,p_capability text,p_active boolean default true)
returns public.capability_grants language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.capability_grants;
begin
  if not public.has_capability('permission.manage',p_model_id,p_version_id) then raise exception 'permission_manage_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'profile_not_found' using errcode='P0002'; end if;
  if p_version_id is not null and not exists(select 1 from public.layout_versions where id=p_version_id and model_id=p_model_id and deleted_at is null) then raise exception 'invalid_version_scope' using errcode='22023'; end if;
  insert into public.capability_grants(user_id,model_id,version_id,capability,is_active,created_by)
  values(p_user_id,p_model_id,p_version_id,p_capability,p_active,auth.uid())
  on conflict(user_id,model_id,version_id,capability)
  do update set is_active=excluded.is_active,updated_at=now() returning * into v;
  perform public.write_audit('CAPABILITY_CHANGED','capability_grant',v.id,p_model_id,p_version_id,jsonb_build_object('user_id',p_user_id,'capability',p_capability,'active',p_active));
  return v;
end $$;

create or replace function public.set_profile_active(p_user_id uuid,p_active boolean)
returns public.profiles language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.profiles;
begin
  if not public.has_capability('permission.manage',null,null) then raise exception 'permission_manage_required' using errcode='42501'; end if;
  if p_user_id=auth.uid() and not p_active then raise exception 'cannot_deactivate_current_account' using errcode='22023'; end if;
  update public.profiles set is_active=p_active,updated_at=now() where id=p_user_id and global_role<>'ADMIN' returning * into v;
  if not found then raise exception 'profile_not_found_or_admin_protected' using errcode='P0002'; end if;
  perform public.write_audit('PROFILE_ACCESS_CHANGED','profile',v.id,null,null,jsonb_build_object('is_active',p_active));
  return v;
end $$;

create or replace function public.rename_model(p_model_id uuid,p_name text)
returns public.models language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.models; begin
  if not public.has_capability('model.manage',p_model_id,null) then raise exception 'model_manage_required' using errcode='42501'; end if;
  update public.models set model_name=nullif(trim(p_name),''),updated_at=now() where id=p_model_id and deleted_at is null returning * into v;
  if not found then raise exception 'model_not_found' using errcode='P0002'; end if;
  perform public.write_audit('MODEL_RENAMED','model',v.id,v.id,null,jsonb_build_object('model_name',v.model_name)); return v;
end $$;
create or replace function public.soft_delete_model(p_model_id uuid)
returns public.models language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.models; begin
  if not public.has_capability('model.delete',p_model_id,null) then raise exception 'model_delete_required' using errcode='42501'; end if;
  update public.models set status='ARCHIVED',deleted_at=now(),deleted_by=auth.uid(),current_published_version_id=null where id=p_model_id and deleted_at is null returning * into v;
  if not found then raise exception 'model_not_found' using errcode='P0002'; end if;
  perform public.write_audit('MODEL_SOFT_DELETED','model',v.id,v.id,null,'{}'); return v;
end $$;
create or replace function public.rename_layout_version(p_version_id uuid,p_version_number text)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions; begin
  select * into v from public.layout_versions where id=p_version_id and deleted_at is null;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.has_capability('version.manage',v.model_id,v.id) then raise exception 'version_manage_required' using errcode='42501'; end if;
  update public.layout_versions set version_number=trim(p_version_number),updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  perform public.write_audit('VERSION_RENAMED','layout_version',v.id,v.model_id,v.id,jsonb_build_object('version_number',v.version_number)); return v;
end $$;
create or replace function public.soft_delete_layout_version(p_version_id uuid)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions; begin
  select * into v from public.layout_versions where id=p_version_id and deleted_at is null for update;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.has_capability('version.delete',v.model_id,v.id) then raise exception 'version_delete_required' using errcode='42501'; end if;
  update public.models set current_published_version_id=null where id=v.model_id and current_published_version_id=v.id;
  update public.layout_versions set status='ARCHIVED',deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  perform public.write_audit('VERSION_SOFT_DELETED','layout_version',v.id,v.model_id,v.id,'{}'); return v;
end $$;

create or replace function public.archive_layout_version(p_version_id uuid)
returns public.layout_versions language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions;
begin
  select * into v from public.layout_versions where id=p_version_id and deleted_at is null for update;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.has_capability('version.manage',v.model_id,v.id) then raise exception 'version_manage_required' using errcode='42501'; end if;
  if exists(select 1 from public.models where id=v.model_id and current_published_version_id=v.id) then raise exception 'currently_published_version_cannot_be_archived' using errcode='55000'; end if;
  update public.layout_versions set status='ARCHIVED',updated_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  perform public.write_audit('VERSION_ARCHIVED','layout_version',v.id,v.model_id,v.id,'{}'); return v;
end $$;

revoke select on public.layout_versions from anon;
grant execute on function public.get_published_versions(uuid) to anon,authenticated;
revoke all on function public.get_my_capabilities(uuid,uuid),public.save_layout_revision(uuid,integer,jsonb,text,text),public.restore_layout_revision(uuid,integer),public.set_capability_grant(uuid,uuid,uuid,text,boolean),public.set_profile_active(uuid,boolean),public.rename_model(uuid,text),public.soft_delete_model(uuid),public.rename_layout_version(uuid,text),public.soft_delete_layout_version(uuid) from public;
grant execute on function public.get_my_capabilities(uuid,uuid),public.save_layout_revision(uuid,integer,jsonb,text,text),public.restore_layout_revision(uuid,integer),public.set_capability_grant(uuid,uuid,uuid,text,boolean),public.set_profile_active(uuid,boolean),public.rename_model(uuid,text),public.soft_delete_model(uuid),public.rename_layout_version(uuid,text),public.soft_delete_layout_version(uuid) to authenticated;

drop policy if exists models_read_published_anon on public.models;
create policy models_read_published_anon on public.models for select to anon using (
  status='ACTIVE' and deleted_at is null and current_published_version_id is not null
);
drop policy if exists versions_read_published_anon on public.layout_versions;
drop policy if exists versions_read_allowed on public.layout_versions;
create policy versions_read_allowed on public.layout_versions for select to authenticated
using (deleted_at is null and public.can_view_model(model_id));

commit;
