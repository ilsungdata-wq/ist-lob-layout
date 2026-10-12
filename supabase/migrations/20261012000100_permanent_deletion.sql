-- Explicit, permission-checked permanent deletion requested by the web application.
create or replace function public.hard_delete_layout_version(p_version_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.layout_versions;
begin
  select * into v from public.layout_versions where id=p_version_id for update;
  if not found then raise exception 'version_not_found' using errcode='P0002'; end if;
  if not public.has_capability('version.delete',v.model_id,v.id) then raise exception 'version_delete_required' using errcode='42501'; end if;
  update public.models set current_published_version_id=null where current_published_version_id=v.id;
  update public.layout_versions set based_on_version_id=null where based_on_version_id=v.id;
  update public.version_revisions set restored_from_id=null where version_id=v.id or restored_from_id in (select id from public.version_revisions where version_id=v.id);
  delete from public.audit_logs where version_id=v.id;
  delete from public.version_revisions where version_id=v.id;
  delete from public.layout_versions where id=v.id;
end $$;

create or replace function public.hard_delete_model(p_model_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare p text;
begin
  if not public.has_capability('model.delete',p_model_id,null) then raise exception 'model_delete_required' using errcode='42501'; end if;
  if not exists(select 1 from public.models where id=p_model_id) then raise exception 'model_not_found' using errcode='P0002'; end if;
  for p in select storage_path from public.assets where model_id=p_model_id loop
    delete from storage.objects where bucket_id='factory-assets' and name=p;
  end loop;
  update public.models set current_published_version_id=null where id=p_model_id;
  update public.layout_versions set based_on_version_id=null where model_id=p_model_id;
  update public.version_revisions set restored_from_id=null where model_id=p_model_id or restored_from_id in (select id from public.version_revisions where model_id=p_model_id);
  delete from public.audit_logs where model_id=p_model_id;
  delete from public.version_revisions where model_id=p_model_id;
  delete from public.assets where model_id=p_model_id;
  delete from public.layout_versions where model_id=p_model_id;
  delete from public.models where id=p_model_id;
end $$;

revoke all on function public.hard_delete_layout_version(uuid),public.hard_delete_model(uuid) from public;
grant execute on function public.hard_delete_layout_version(uuid),public.hard_delete_model(uuid) to authenticated;
