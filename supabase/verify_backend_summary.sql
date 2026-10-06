-- IST LOB Layout · read-only backend verification summary.
-- Safe to run repeatedly. This statement only reads PostgreSQL/Supabase catalogs.

with
app_tables(table_name) as (
  values ('profiles'),('models'),('layout_versions'),('model_permissions'),
         ('factory_symbols'),('assets'),('audit_logs')
),
required_functions(function_name, identity_arguments) as (
  values
    ('touch_updated_at', ''),
    ('handle_new_user', ''),
    ('is_admin', ''),
    ('get_model_permission', 'p_model_id uuid'),
    ('can_view_model', 'p_model_id uuid'),
    ('can_edit_model', 'p_model_id uuid'),
    ('can_manage_model', 'p_model_id uuid'),
    ('write_audit', 'p_action text, p_entity_type text, p_entity_id uuid, p_model_id uuid, p_version_id uuid, p_metadata jsonb'),
    ('create_model', 'p_model_code text, p_model_name text, p_description text'),
    ('create_layout_version', 'p_model_id uuid, p_source_version_id uuid, p_version_number text, p_change_note text'),
    ('save_layout_version', 'p_version_id uuid, p_expected_revision integer, p_layout_data jsonb, p_change_note text'),
    ('publish_layout_version', 'p_version_id uuid'),
    ('archive_layout_version', 'p_version_id uuid'),
    ('set_model_permission', 'p_model_id uuid, p_user_id uuid, p_permission model_permission'),
    ('remove_model_permission', 'p_model_id uuid, p_user_id uuid'),
    ('register_asset', 'p_model_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_byte_size bigint, p_checksum_sha256 text'),
    ('delete_asset_record', 'p_asset_id uuid')
),
required_indexes(index_name) as (
  values
    ('models_model_code_key'),
    ('layout_versions_model_id_idx'),
    ('layout_versions_model_version_idx'),
    ('layout_versions_status_idx'),
    ('model_permissions_model_id_idx'),
    ('model_permissions_user_id_idx'),
    ('audit_logs_model_id_idx'),
    ('audit_logs_version_id_idx'),
    ('audit_logs_created_at_idx'),
    ('assets_model_id_idx')
),
required_constraints(table_name, constraint_name) as (
  values
    ('models','models_current_published_version_fk'),
    ('layout_versions','layout_versions_model_id_version_number_key'),
    ('model_permissions','model_permissions_model_id_user_id_key'),
    ('assets','assets_storage_path_key')
),
function_catalog as (
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as identity_arguments,
         pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
checks(sort_order, check_name, expected_number, actual_number, expected_text, actual_text) as (
  select 10, 'Application tables', 7::bigint, count(*)::bigint, null::text, null::text
  from information_schema.tables t join app_tables a using (table_name)
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'

  union all
  select 20, 'RLS enabled tables', 7, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join app_tables a on a.table_name=c.relname
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity

  union all
  -- FORCE RLS is intentionally not required by the approved migration. Supabase API
  -- roles are still governed by ENABLE RLS; table owners retain migration access.
  select 30, 'RLS forced tables (not required)', 0, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join app_tables a on a.table_name=c.relname
  where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity

  union all
  select 40, 'Application policies', 9, count(*), null, null
  from pg_policies p join app_tables a on a.table_name=p.tablename
  where p.schemaname='public'

  union all
  select 50, 'Storage policies', 4, count(*), null, null
  from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'factory_assets_%'

  union all
  select 60, 'Functions / RPC', 17, count(*), null, null
  from required_functions r join function_catalog f
    on f.proname=r.function_name and f.identity_arguments=r.identity_arguments

  union all
  select 70, 'Triggers', 4, count(*), null, null
  from information_schema.triggers
  where trigger_name in ('profiles_touch','models_touch','symbols_touch','on_auth_user_created')

  union all
  select 80, 'factory-assets bucket', 1, count(*), null, null
  from storage.buckets where id='factory-assets'

  union all
  select 90, 'factory-assets bucket private', 1,
         count(*) filter (where public is false), null, null
  from storage.buckets where id='factory-assets'

  union all
  select 100, 'pgcrypto extension', 1, count(*), null, null
  from pg_extension where extname='pgcrypto'

  union all
  select 110, 'Required named indexes', 10, count(*), null, null
  from required_indexes r join pg_indexes i on i.schemaname='public' and i.indexname=r.index_name

  union all
  select 120, 'Required named constraints', 4, count(*), null, null
  from required_constraints r
  join pg_constraint c on c.conname=r.constraint_name
  join pg_class t on t.oid=c.conrelid and t.relname=r.table_name
  join pg_namespace n on n.oid=t.relnamespace and n.nspname='public'

  union all
  select 130, 'PUBLISHED/ARCHIVED immutable on save', 1,
         count(*) filter (where definition ilike '%status<>''DRAFT''%'
                           and definition ilike '%published_or_archived_version_is_immutable%'), null, null
  from function_catalog where proname='save_layout_version'

  union all
  select 135, 'PUBLISHED requires published_at', 1, count(*), null, null
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='layout_versions' and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%status = ''PUBLISHED''%'
    and pg_get_constraintdef(c.oid) ilike '%published_at IS NOT NULL%'

  union all
  select 140, 'Current published version protected from archive', 1,
         count(*) filter (where definition ilike '%current_published_version_id is distinct from%'), null, null
  from function_catalog where proname='archive_layout_version'

  union all
  select 150, 'Revision positive constraint', 1, count(*), null, null
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='layout_versions' and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%revision > 0%'

  union all
  select 160, 'Optimistic concurrency in save RPC', 1,
         count(*) filter (where definition ilike '%revision = p_expected_revision%'
                           and definition ilike '%revision_conflict%'), null, null
  from function_catalog where proname='save_layout_version'

  union all
  select 170, 'RPC: create model', 1, count(*), null, null
  from function_catalog where proname='create_model'
  union all select 180, 'RPC: create version', 1, count(*), null, null from function_catalog where proname='create_layout_version'
  union all select 190, 'RPC: save layout', 1, count(*), null, null from function_catalog where proname='save_layout_version'
  union all select 200, 'RPC: publish version', 1, count(*), null, null from function_catalog where proname='publish_layout_version'
  union all select 210, 'RPC: archive version', 1, count(*), null, null from function_catalog where proname='archive_layout_version'
  union all select 220, 'RPC: permission management', 2, count(*), null, null
  from function_catalog where proname in ('set_model_permission','remove_model_permission')

  union all select 300, 'profiles RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='profiles' and c.relrowsecurity
  union all select 310, 'models RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='models' and c.relrowsecurity
  union all select 320, 'layout_versions RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='layout_versions' and c.relrowsecurity
  union all select 330, 'model_permissions RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='model_permissions' and c.relrowsecurity
  union all select 340, 'factory_symbols RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='factory_symbols' and c.relrowsecurity
  union all select 350, 'assets RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='assets' and c.relrowsecurity
  union all select 360, 'audit_logs RLS enabled', 1, count(*), null, null
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='audit_logs' and c.relrowsecurity
)
select check_name,
       coalesce(expected_text, expected_number::text) as expected,
       coalesce(actual_text, actual_number::text) as actual,
       case when expected_number = actual_number
                  and coalesce(expected_text, '') = coalesce(actual_text, '')
            then 'PASS' else 'FAIL' end as status
from checks
order by sort_order;
