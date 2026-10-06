-- Optional development seed. Run explicitly; never as a production migration.
-- An ADMIN can assign permissions after creating auth users.
insert into public.models(model_code,model_name,description,status)
values('TEST-01','Development test model','Non-production seed','ACTIVE')
on conflict do nothing;

insert into public.layout_versions(model_id,version_number,status,change_note,layout_data)
select id,'0.1','DRAFT','Development seed',
  '{"schemaVersion":1,"page":{"width":33,"height":8,"unit":"m","background":"#ffffff","gridSize":0.25},"objects":[]}'::jsonb
from public.models where model_code='TEST-01'
on conflict do nothing;
