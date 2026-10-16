-- Keep the Model name in every current and published layout payload authoritative.
-- This prevents a later Save, Restore or Pushlist from putting an old client-side name back.
create or replace function public.force_layout_model_name()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_name text;
begin
  select model_name into v_name from public.models where id=new.model_id;
  if coalesce(trim(v_name),'')<>'' then
    new.layout_data:=jsonb_set(coalesce(new.layout_data,'{}'::jsonb),'{name}',to_jsonb(v_name),true);
    if new.published_snapshot is not null then
      new.published_snapshot:=jsonb_set(new.published_snapshot,'{name}',to_jsonb(v_name),true);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists layout_versions_force_model_name on public.layout_versions;
create trigger layout_versions_force_model_name
before insert or update of model_id,layout_data,published_snapshot on public.layout_versions
for each row execute function public.force_layout_model_name();

-- Also normalize existing revision snapshots for audit/restore consistency.
update public.version_revisions h
set snapshot=jsonb_set(coalesce(h.snapshot,'{}'::jsonb),'{name}',to_jsonb(m.model_name),true)
from public.models m
where m.id=h.model_id and coalesce(trim(m.model_name),'')<>'';
