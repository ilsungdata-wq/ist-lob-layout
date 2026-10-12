begin;
alter table public.assets drop constraint if exists assets_mime_type_check;
alter table public.assets add constraint assets_mime_type_check check (mime_type in (
 'image/svg+xml','image/png','image/jpeg','application/pdf',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-excel.sheet.macroEnabled.12'
));
update storage.buckets
set allowed_mime_types=array[
 'image/svg+xml','image/png','image/jpeg','application/pdf',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-excel.sheet.macroEnabled.12'
]
where id='factory-assets';
-- Keep original PDFs private. Existing publication policy shares only the PNG
-- preview of the chosen page, using the published snapshot's exact asset path.
commit;
