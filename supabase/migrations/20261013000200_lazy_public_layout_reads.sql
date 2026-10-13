-- The public site is primarily a viewer.  Returning every layout_data JSON
-- document at startup makes Postgres serialize the entire layout library for
-- every visitor.  Return the lightweight picker data first, then fetch only
-- the layout selected by the visitor. PostgreSQL does not allow changing the
-- table return signature with CREATE OR REPLACE, so remove the old RPC first.
drop function if exists public.get_published_workspace();
create function public.get_published_workspace()
returns table(
  id uuid,
  model_id uuid,
  model_code text,
  model_name text,
  description text,
  current_published_version_id uuid,
  version_number text,
  revision integer,
  updated_at timestamptz
)
language sql stable security definer set search_path=pg_catalog,public as $$
  select
    lv.id,
    m.id as model_id,
    m.model_code,
    m.model_name,
    m.description,
    m.current_published_version_id,
    lv.version_number,
    coalesce(lv.published_revision,lv.revision) as revision,
    lv.updated_at
  from public.models m
  join public.layout_versions lv on lv.id=m.current_published_version_id
  where lv.status='PUBLISHED'
    and lv.deleted_at is null
    and m.deleted_at is null
    and m.status='ACTIVE'
  order by m.model_code;
$$;

create or replace function public.get_published_layout(p_version_id uuid)
returns table(
  id uuid,
  model_id uuid,
  version_number text,
  layout_data jsonb,
  revision integer,
  updated_at timestamptz
)
language sql stable security definer set search_path=pg_catalog,public as $$
  select
    lv.id,
    lv.model_id,
    lv.version_number,
    coalesce(lv.published_snapshot,lv.layout_data) as layout_data,
    coalesce(lv.published_revision,lv.revision) as revision,
    lv.updated_at
  from public.layout_versions lv
  join public.models m on m.id=lv.model_id
  where lv.id=p_version_id
    and lv.id=m.current_published_version_id
    and lv.status='PUBLISHED'
    and lv.deleted_at is null
    and m.deleted_at is null
    and m.status='ACTIVE';
$$;

revoke all on function public.get_published_workspace() from public;
revoke all on function public.get_published_layout(uuid) from public;
grant execute on function public.get_published_workspace() to anon,authenticated;
grant execute on function public.get_published_layout(uuid) to anon,authenticated;
