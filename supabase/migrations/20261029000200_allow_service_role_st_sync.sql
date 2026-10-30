-- The Edge Function is the trusted scheduler.  A browser session still has to
-- be an active ADMIN; only the Supabase service role may execute unattended runs.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select auth.role()='service_role'
    or exists(select 1 from public.profiles where id=auth.uid() and global_role='ADMIN' and is_active);
$$;
