-- Read-only verification. This script does not create, update, or delete data.
with checks(check_name, expected, actual) as (
  values
  ('anon SELECT grants', '2', (
    select count(*)::text from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name in ('models','layout_versions') and privilege_type = 'SELECT'
  )),
  ('anon write grants', '0', (
    select count(*)::text from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name in ('models','layout_versions')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  )),
  ('anonymous read policies', '2', (
    select count(*)::text from pg_policies
    where schemaname = 'public'
      and policyname in ('models_read_published_anon','versions_read_published_anon')
      and cmd = 'SELECT' and roles = array['anon']::name[]
  )),
  ('anonymous write policies', '0', (
    select count(*)::text from pg_policies
    where schemaname = 'public'
      and tablename in ('models','layout_versions')
      and 'anon' = any(roles) and cmd in ('INSERT','UPDATE','DELETE','ALL')
  ))
)
select check_name, expected, actual,
       case when expected = actual then 'PASS' else 'FAIL' end as status
from checks
order by check_name;
