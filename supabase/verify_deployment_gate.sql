-- Read-only deployment gate. Raises an error when the production schema is incomplete.
do $$
declare
  missing text[] := array[]::text[];
  fn text;
begin
  if to_regclass('public.capability_grants') is null then missing := array_append(missing,'table capability_grants'); end if;
  if to_regclass('public.version_revisions') is null then missing := array_append(missing,'table version_revisions'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='layout_versions' and column_name='published_snapshot') then missing := array_append(missing,'layout_versions.published_snapshot'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='layout_versions' and column_name='published_revision') then missing := array_append(missing,'layout_versions.published_revision'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='models' and column_name='deleted_at') then missing := array_append(missing,'models.deleted_at'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='layout_versions' and column_name='deleted_at') then missing := array_append(missing,'layout_versions.deleted_at'); end if;
  foreach fn in array array['has_capability','get_my_capabilities','save_layout_revision','restore_layout_revision','get_published_versions','set_capability_grant','set_profile_active','rename_model','soft_delete_model','rename_layout_version','soft_delete_layout_version','publish_layout_version','archive_layout_version'] loop
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fn) then missing := array_append(missing,'function '||fn); end if;
  end loop;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='capability_grants' and c.relrowsecurity) then missing := array_append(missing,'RLS capability_grants'); end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='version_revisions' and c.relrowsecurity) then missing := array_append(missing,'RLS version_revisions'); end if;
  if has_table_privilege('anon','public.layout_versions','SELECT') then missing := array_append(missing,'anon direct layout_versions SELECT must be revoked'); end if;
  if has_table_privilege('anon','public.capability_grants','INSERT') or has_table_privilege('anon','public.version_revisions','INSERT') then missing := array_append(missing,'anon write privilege'); end if;
  if exists(select 1 from public.layout_versions where status='PUBLISHED' and (published_snapshot is null or published_revision is null)) then missing := array_append(missing,'Published snapshot backfill'); end if;
  if cardinality(missing)>0 then raise exception 'Deployment verification failed: %',array_to_string(missing,', '); end if;
end $$;
select 'permissions_revisions_workflow' as check_name,'PASS' as status,now() as verified_at;