-- READ-ONLY FIRST ADMIN VERIFICATION
-- auth.uid() is null in a normal SQL Editor session, so this query evaluates
-- the exact profile predicate used by public.is_admin() for the target auth user.

with target_auth as (
  select id, email
  from auth.users
  where lower(email) = lower('ilsungdata@gmail.com')
),
admin_function as (
  select count(*) = 1 as is_admin_function_exists,
         bool_and(p.prosecdef) as is_security_definer,
         bool_and(pg_get_functiondef(p.oid) ilike '%id=auth.uid()%'
                  and pg_get_functiondef(p.oid) ilike '%global_role=''ADMIN''%'
                  and pg_get_functiondef(p.oid) ilike '%is_active%') as expected_logic_present
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'is_admin'
    and pg_get_function_identity_arguments(p.oid) = ''
)
select
  a.id as user_id,
  a.email,
  p.display_name,
  p.global_role,
  p.is_active,
  (p.global_role = 'ADMIN'::public.app_role) as account_is_admin,
  (p.is_active is true) as profile_is_active,
  (p.id = a.id and p.global_role = 'ADMIN'::public.app_role and p.is_active is true)
    as is_admin_will_return_true_when_authenticated,
  f.is_admin_function_exists,
  f.is_security_definer,
  f.expected_logic_present,
  case
    when p.id = a.id
      and p.global_role = 'ADMIN'::public.app_role
      and p.is_active is true
      and f.is_admin_function_exists
      and f.is_security_definer
      and f.expected_logic_present
    then 'PASS'
    else 'FAIL'
  end as status
from target_auth a
left join public.profiles p on p.id = a.id
cross join admin_function f;
