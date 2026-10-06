-- Read-only verification. Anonymous reads Models plus immutable Published snapshots through one RPC.
with checks(check_name, expected, actual) as (
  values
  ('anon direct Model SELECT', '1', (
    select count(*)::text from information_schema.role_table_grants
    where grantee='anon' and table_schema='public' and table_name='models' and privilege_type='SELECT'
  )),
  ('anon direct Version SELECT', '0', (
    select count(*)::text from information_schema.role_table_grants
    where grantee='anon' and table_schema='public' and table_name='layout_versions' and privilege_type='SELECT'
  )),
  ('anon Published RPC', '1', (
    select count(*)::text from information_schema.routine_privileges
    where grantee='anon' and routine_schema='public' and routine_name='get_published_versions' and privilege_type='EXECUTE'
  )),
  ('anonymous Model read policy', '1', (
    select count(*)::text from pg_policies where schemaname='public' and policyname='models_read_published_anon' and cmd='SELECT' and roles=array['anon']::name[]
  )),
  ('anonymous Version direct policy', '0', (
    select count(*)::text from pg_policies where schemaname='public' and policyname='versions_read_published_anon'
  )),
  ('anonymous write grants', '0', (
    select count(*)::text from information_schema.role_table_grants where grantee='anon' and table_schema='public' and table_name in ('models','layout_versions','capability_grants','version_revisions') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ))
)
select check_name,expected,actual,case when expected=actual then 'PASS' else 'FAIL' end status from checks order by check_name;