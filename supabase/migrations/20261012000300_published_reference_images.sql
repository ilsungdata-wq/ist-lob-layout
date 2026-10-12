-- Public viewers may read the exact preview image in a published snapshot.
-- Source workbooks (which can contain other sheets), drafts and other assets
-- remain private. No bucket-wide public access or write policy is added.
create or replace function public.is_published_reference_image(p_path text)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select exists (
  select 1 from public.layout_versions lv
  join public.models m on m.id=lv.model_id
  where lv.status='PUBLISHED' and lv.deleted_at is null
   and m.deleted_at is null and m.status='ACTIVE'
   and lv.published_snapshot->'referenceAsset'->>'path'=p_path
   and split_part(p_path,'/',1)=m.id::text
   and coalesce(lv.published_snapshot->'referenceAsset'->>'mimeType','') in ('image/svg+xml','image/png','image/jpeg')
 );
$$;
revoke all on function public.is_published_reference_image(text) from public;
grant execute on function public.is_published_reference_image(text) to anon,authenticated;

create policy factory_assets_published_reference_read on storage.objects
for select to anon,authenticated
using(bucket_id='factory-assets' and public.is_published_reference_image(name));
