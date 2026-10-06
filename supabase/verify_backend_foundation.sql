-- Read-only verification queries for the first Supabase deployment.

-- 1. Tables created.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','models','layout_versions','model_permissions','factory_symbols','assets','audit_logs')
order by table_name;

-- 2. RLS enabled and forced state.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','models','layout_versions','model_permissions','factory_symbols','assets','audit_logs')
order by c.relname;

-- 3. Public and Storage policies created.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('profiles','models','layout_versions','model_permissions','factory_symbols','assets','audit_logs'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'factory_assets_%')
order by schemaname, tablename, policyname;

-- 4. Functions/RPC and trigger functions created.
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('touch_updated_at','handle_new_user','is_admin','get_model_permission','can_view_model','can_edit_model','can_manage_model','write_audit','create_model','create_layout_version','save_layout_version','publish_layout_version','archive_layout_version','set_model_permission','remove_model_permission','register_asset','delete_asset_record')
order by p.proname;

-- 5. Triggers created, including the auth.users profile trigger.
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_name in ('profiles_touch','models_touch','symbols_touch','on_auth_user_created')
order by event_object_schema, event_object_table, trigger_name;

-- 6. Private factory-assets bucket created with expected limits.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'factory-assets';

-- 7. Indexes created.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('profiles','models','layout_versions','model_permissions','factory_symbols','assets','audit_logs')
order by tablename, indexname;

-- 8. Constraints created.
select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
       case con.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
         when 'u' then 'UNIQUE' when 'c' then 'CHECK' else con.contype::text end as constraint_type,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','models','layout_versions','model_permissions','factory_symbols','assets','audit_logs')
order by c.relname, con.conname;

-- 9. Required extension available.
select extname, extversion from pg_extension where extname = 'pgcrypto';
