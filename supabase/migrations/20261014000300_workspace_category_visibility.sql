-- Navigation categories are global viewer settings, not per-version layout data.
-- This makes the selected menu survive reloads, private windows and model changes.
create table if not exists public.workspace_settings (
  singleton boolean primary key default true check (singleton),
  visible_categories jsonb not null default '["lob-summary","overview","processes","jigs"]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_settings enable row level security;

insert into public.workspace_settings(singleton,visible_categories)
values (true,'["lob-summary","overview","processes","jigs"]'::jsonb)
on conflict (singleton) do nothing;

create or replace function public.set_workspace_visible_categories(p_visible_categories jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_admin() then
    raise exception 'admin_required_to_manage_categories' using errcode='42501';
  end if;
  if jsonb_typeof(p_visible_categories) <> 'array' or jsonb_array_length(p_visible_categories)=0 then
    raise exception 'visible_categories_must_be_a_non_empty_array' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_visible_categories) value
    where value not in ('lob-summary','overview','processes','jigs')
  ) then
    raise exception 'invalid_visible_category' using errcode='22023';
  end if;
  insert into public.workspace_settings(singleton,visible_categories,updated_at)
  values (true,p_visible_categories,now())
  on conflict (singleton) do update set visible_categories=excluded.visible_categories,updated_at=excluded.updated_at;
  return p_visible_categories;
end;
$$;

revoke all on function public.set_workspace_visible_categories(jsonb) from public;
grant execute on function public.set_workspace_visible_categories(jsonb) to authenticated;

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
  updated_at timestamptz,
  lob_summary jsonb,
  visible_categories jsonb
)
language sql stable security definer set search_path=pg_catalog,public as $$
  with published as (
    select lv.id, lv.model_id, lv.version_number, coalesce(lv.published_revision,lv.revision) as revision,
      lv.updated_at, m.model_code, m.model_name, m.description, m.current_published_version_id,
      coalesce(lv.published_snapshot,lv.layout_data,'{}'::jsonb) as layout_data
    from public.models m
    join public.layout_versions lv on lv.id=m.current_published_version_id
    where lv.status='PUBLISHED' and lv.deleted_at is null and m.deleted_at is null and m.status='ACTIVE'
  )
  select p.id, p.model_id, p.model_code, p.model_name, p.description, p.current_published_version_id,
    p.version_number, p.revision, p.updated_at,
    jsonb_build_object(
      'neckTime', coalesce(nullif(p.layout_data #>> '{lobSummary,neckTime}','')::numeric, metrics.neck_time, 0),
      'operationTime', coalesce(nullif(p.layout_data #>> '{lobSummary,operationTime}','')::numeric, metrics.operation_time, 0),
      'processCount', coalesce(nullif(p.layout_data #>> '{lobSummary,processCount}','')::numeric, metrics.process_count, 0),
      'mp', metrics.mp,
      'uph', coalesce(nullif(p.layout_data #>> '{lobSummary,uph}','')::numeric, case when metrics.neck_time > 0 then 3600 / metrics.neck_time else 0 end),
      'st', coalesce(nullif(p.layout_data #>> '{lobSummary,st}','')::numeric, nullif(p.layout_data #>> '{lobSummary,tt}','')::numeric, metrics.operation_time, 0),
      'lob', coalesce(nullif(p.layout_data #>> '{lobSummary,lob}','')::numeric, case when metrics.neck_time > 0 and metrics.process_count > 0 then metrics.operation_time / (metrics.neck_time * metrics.process_count) else 0 end)
    ) as lob_summary,
    settings.visible_categories
  from published p
  cross join public.workspace_settings settings
  left join lateral (
    select count(*)::numeric as process_count,
      coalesce(sum(coalesce(nullif(item->>'mp','')::numeric,0)),0) as mp,
      coalesce(sum(coalesce(nullif(item->>'time','')::numeric,nullif(item->>'tt','')::numeric,0)),0) as operation_time,
      coalesce(max(coalesce(nullif(item->>'time','')::numeric,nullif(item->>'tt','')::numeric,0) / greatest(1,coalesce(nullif(item->>'mp','')::numeric,0))),0) as neck_time
    from jsonb_array_elements(coalesce(p.layout_data->'processes','[]'::jsonb)) item
  ) metrics on true
  order by p.model_code;
$$;

revoke all on function public.get_published_workspace() from public;
grant execute on function public.get_published_workspace() to anon,authenticated;
