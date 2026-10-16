-- Allow managers to remove an obsolete recoverable revision from the history dialog.
create or replace function public.delete_layout_revision(p_history_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare h public.version_revisions;
begin
  select * into h from public.version_revisions where id=p_history_id for update;
  if not found then raise exception 'revision_not_found' using errcode='P0002'; end if;
  if not public.has_capability('version.delete',h.model_id,h.version_id) then
    raise exception 'version_delete_required' using errcode='42501';
  end if;
  update public.version_revisions set restored_from_id=null where restored_from_id=h.id;
  delete from public.version_revisions where id=h.id;
end $$;

revoke all on function public.delete_layout_revision(uuid) from public;
grant execute on function public.delete_layout_revision(uuid) to authenticated;
