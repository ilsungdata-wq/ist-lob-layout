-- One anonymous/public Viewer request replaces one models request plus one RPC per Model.
-- This preserves the existing published-only access rule and does not change RLS policies.
create or replace function public.get_published_workspace()
returns table(
  id uuid,
  model_id uuid,
  model_code text,
  model_name text,
  description text,
  current_published_version_id uuid,
  version_number text,
  layout_data jsonb,
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
    coalesce(lv.published_snapshot,lv.layout_data) as layout_data,
    coalesce(lv.published_revision,lv.revision) as revision,
    lv.updated_at
  from public.layout_versions lv
  join public.models m on m.id=lv.model_id
  where lv.status='PUBLISHED'
    and lv.deleted_at is null
    and m.deleted_at is null
    and m.status='ACTIVE'
  order by m.model_code,lv.published_at desc nulls last,lv.created_at desc;
$$;

revoke all on function public.get_published_workspace() from public;
grant execute on function public.get_published_workspace() to anon,authenticated;
