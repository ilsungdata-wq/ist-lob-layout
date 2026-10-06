-- ONE-TIME FIRST ADMIN BOOTSTRAP
-- Run manually in Supabase SQL Editor as the project database owner.
-- This script changes only public.profiles.global_role for ilsungdata@gmail.com.

begin;

do $$
declare
  v_email constant text := 'ilsungdata@gmail.com';
  v_user_count integer;
  v_user_id uuid;
  v_profile_count integer;
begin
  select count(*), (array_agg(id order by id))[1]
    into v_user_count, v_user_id
  from auth.users
  where lower(email) = lower(v_email);

  if v_user_count = 0 then
    raise exception 'ADMIN_BOOTSTRAP_FAILED: auth user % does not exist', v_email
      using errcode = 'P0002';
  elsif v_user_count <> 1 then
    raise exception 'ADMIN_BOOTSTRAP_FAILED: expected exactly one auth user for %, found %', v_email, v_user_count
      using errcode = '21000';
  end if;

  select count(*)
    into v_profile_count
  from public.profiles
  where id = v_user_id;

  if v_profile_count = 0 then
    raise exception 'ADMIN_BOOTSTRAP_FAILED: public.profiles row is missing for auth user % (%)', v_email, v_user_id
      using errcode = 'P0002';
  elsif v_profile_count <> 1 then
    raise exception 'ADMIN_BOOTSTRAP_FAILED: expected exactly one profile for auth user %, found %', v_email, v_profile_count
      using errcode = '21000';
  end if;

  update public.profiles
  set global_role = 'ADMIN'::public.app_role
  where id = v_user_id
    and global_role = 'USER'::public.app_role;
end
$$;

commit;

-- Final result shown by Supabase SQL Editor.
select
  p.id as user_id,
  u.email,
  p.display_name,
  p.global_role,
  p.is_active
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('ilsungdata@gmail.com');
