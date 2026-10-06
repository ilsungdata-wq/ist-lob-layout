-- Read-only verification for permissions, revisions, public snapshots, and soft delete.
with checks(check_name,expected,actual) as (
  values
  ('capability_grants table',1,(select count(*)::int from information_schema.tables where table_schema='public' and table_name='capability_grants')),
  ('version_revisions table',1,(select count(*)::int from information_schema.tables where table_schema='public' and table_name='version_revisions')),
  ('models soft delete columns',2,(select count(*)::int from information_schema.columns where table_schema='public' and table_name='models' and column_name in ('deleted_at','deleted_by'))),
  ('versions soft delete columns',2,(select count(*)::int from information_schema.columns where table_schema='public' and table_name='layout_versions' and column_name in ('deleted_at','deleted_by'))),
  ('published snapshot columns',2,(select count(*)::int from information_schema.columns where table_schema='public' and table_name='layout_versions' and column_name in ('published_snapshot','published_revision'))),
  ('new tables RLS enabled',2,(select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('capability_grants','version_revisions') and c.relrowsecurity)),
  ('new table policies',2,(select count(*)::int from pg_policies where schemaname='public' and policyname in ('capability_grants_read','version_revisions_read'))),
  ('workflow RPC/functions',13,(select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('has_capability','get_my_capabilities','save_layout_revision','restore_layout_revision','get_published_versions','set_capability_grant','set_profile_active','rename_model','soft_delete_model','rename_layout_version','soft_delete_layout_version','publish_layout_version','archive_layout_version'))),
  ('revision/history indexes',4,(select count(*)::int from pg_indexes where schemaname='public' and indexname in ('capability_grants_user_idx','capability_grants_model_idx','version_revisions_version_idx','version_revisions_model_idx'))),
  ('published snapshots populated',0,(select count(*)::int from public.layout_versions where status='PUBLISHED' and (published_snapshot is null or published_revision is null))),
  ('deleted models still retained',0,(select count(*)::int from public.models where deleted_at is not null and status<>'ARCHIVED')),
  ('deleted versions archived',0,(select count(*)::int from public.layout_versions where deleted_at is not null and status<>'ARCHIVED')),
  ('revision snapshots valid',0,(select count(*)::int from public.version_revisions where jsonb_typeof(snapshot)<>'object'))
)
select check_name,expected,actual,case when expected=actual then 'PASS' else 'FAIL' end as status
from checks order by check_name;