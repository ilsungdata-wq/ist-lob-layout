-- Metadata is read for every visible version; the large JSON layout is fetched only
-- for the version that the user opens. This index keeps that metadata list ordered
-- without scanning older versions as the layout library grows.
create index if not exists layout_versions_model_created_idx
  on public.layout_versions(model_id, created_at desc);

-- Remote revision history is loaded per version and displayed newest first.
create index if not exists version_revisions_version_created_idx
  on public.version_revisions(version_id, created_at desc);

-- Return all effective capabilities in one call during editor startup. The old
-- client made one RPC per version, which grows linearly with a layout library.
create or replace function public.get_workspace_capabilities()
returns table(model_id uuid, version_id uuid, permission text, capability text)
language sql stable security definer set search_path=pg_catalog,public as $$
  with visible_models as (
    select m.id from public.models m
    where m.deleted_at is null and public.can_view_model(m.id)
  ), versions as (
    select lv.model_id,lv.id as version_id
    from public.layout_versions lv join visible_models vm on vm.id=lv.model_id
    where lv.deleted_at is null
  ), model_access as (
    select mp.model_id,mp.permission::text as permission
    from public.model_permissions mp join public.profiles p on p.id=mp.user_id
    where mp.user_id=auth.uid() and p.is_active
  ), direct_capabilities as (
    select v.model_id,v.version_id,ma.permission,cg.capability
    from versions v
    left join model_access ma on ma.model_id=v.model_id
    join public.capability_grants cg on cg.user_id=auth.uid() and cg.is_active
      and (cg.model_id is null or cg.model_id=v.model_id)
      and (cg.version_id is null or cg.version_id=v.version_id)
  ), permission_capabilities as (
    select v.model_id,v.version_id,ma.permission,c.capability
    from versions v join model_access ma on ma.model_id=v.model_id
    cross join lateral unnest(case ma.permission
      when 'VIEW' then array['layout.view','lob.view','equipment.view']
      when 'EDIT' then array['layout.view','layout.edit','lob.view','lob.edit','tt.measure','equipment.view','equipment.edit','jig.edit','excel.import','version.create','history.view']
      else array['layout.view','layout.edit','lob.view','lob.edit','tt.measure','equipment.view','equipment.edit','jig.edit','excel.import','model.manage','model.delete','version.create','version.manage','version.delete','version.publish','history.view','history.restore']
    end) as c(capability)
  )
  select distinct model_id,version_id,permission,capability from direct_capabilities
  union
  select distinct model_id,version_id,permission,capability from permission_capabilities
$$;
revoke all on function public.get_workspace_capabilities() from public;
grant execute on function public.get_workspace_capabilities() to authenticated;
