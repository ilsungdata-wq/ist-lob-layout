begin;

alter table public.assets drop constraint if exists assets_mime_type_check;
alter table public.assets add constraint assets_mime_type_check check (mime_type in (
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12'
));

update storage.buckets
set file_size_limit=26214400,
    allowed_mime_types=array[
      'image/svg+xml',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ]
where id='factory-assets';

commit;
