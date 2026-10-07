begin;

-- Anonymous users may read only active Models with a valid current Published version.
-- No profile, permission, audit, draft, review, archived, asset, or storage access is granted.
grant select on table public.models to anon;
grant select on table public.layout_versions to anon;

revoke insert, update, delete, truncate, references, trigger on table public.models from anon;
revoke insert, update, delete, truncate, references, trigger on table public.layout_versions from anon;

drop policy if exists models_read_published_anon on public.models;
create policy models_read_published_anon
on public.models
for select
to anon
using (
  status = 'ACTIVE'
  and current_published_version_id is not null
  and exists (
    select 1
    from public.layout_versions published
    where published.id = models.current_published_version_id
      and published.model_id = models.id
      and published.status = 'PUBLISHED'
  )
);

drop policy if exists versions_read_published_anon on public.layout_versions;
create policy versions_read_published_anon
on public.layout_versions
for select
to anon
using (status = 'PUBLISHED');

commit;
