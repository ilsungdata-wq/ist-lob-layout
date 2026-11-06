-- Keep LOB KPIs aligned with the current Published layout station data.
-- Direct MP includes active Production + QC stations (IQC/OQC/etc).
-- Compute LOB using actual active operations; historical saved_lob can be stale
-- (e.g., S947 Block 3 had saved 1.16% while published stations imply ~85.6%).
-- Automated operations (MP=0) still contribute to the production bottleneck.
-- Normalize mixed historical LOB storage (ratio or percent) and report every
-- direct station MP from the currently published layout.
drop function if exists public.get_st_all_model_report_metrics();
create function public.get_st_all_model_report_metrics()
returns table(model_name text,direct_mp numeric,lob numeric,uph numeric,line_value text,type_value text,version_number text,process_count integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 with source as (
  select m.model_name,lv.version_number,
   coalesce(lv.published_snapshot,lv.layout_data,'{}'::jsonb) doc
  from public.models m
  join public.layout_versions lv on lv.id=m.current_published_version_id
  where m.model_name is not null
 ), calculated as (
  select source.*,
   nullif(regexp_replace(coalesce(source.doc->'lobSummary'->>'lob',''),'[^0-9.]','','g'),'')::numeric saved_lob,
   stats.*
  from source
  left join lateral (
   select
    sum(coalesce(nullif(regexp_replace(coalesce(p.value->>'mp',p.value->>'manpower','0'),'[^0-9.]','','g'),''),'0')::numeric) direct_mp,
    sum(coalesce(nullif(regexp_replace(coalesce(p.value->>'time',p.value->>'taktTime',p.value->>'tt','0'),'[^0-9.]','','g'),''),'0')::numeric) operation_time,
    max(coalesce(nullif(regexp_replace(coalesce(p.value->>'time',p.value->>'taktTime',p.value->>'tt','0'),'[^0-9.]','','g'),''),'0')::numeric /
      greatest(coalesce(nullif(regexp_replace(coalesce(p.value->>'mp',p.value->>'manpower','0'),'[^0-9.]','','g'),''),'0')::numeric,1)) neck_time,
    count(*)::integer process_count
   from jsonb_array_elements(coalesce(source.doc->'processes','[]'::jsonb)) p
   where coalesce(p.value->>'isActive','true')<>'false'
  ) stats on true
 )
 select calculated.model_name,
  coalesce(calculated.direct_mp,0),
  case
   when coalesce(calculated.neck_time,0)>0 and coalesce(calculated.process_count,0)>0
    then round(calculated.operation_time/(calculated.process_count*calculated.neck_time)*100,1)
   when calculated.saved_lob is not null then round(case when calculated.saved_lob<=1 then calculated.saved_lob*100 else calculated.saved_lob end,1)
   else 0
  end,
  coalesce(nullif(regexp_replace(coalesce(calculated.doc->'lobSummary'->>'uph',''),'[^0-9.]','','g'),'')::numeric,
   case when coalesce(calculated.neck_time,0)>0 then round(3600/calculated.neck_time,1) else 0 end),
  coalesce(calculated.doc->>'line',calculated.doc->'model'->>'line','—'),
  coalesce(calculated.doc->>'type',calculated.doc->'model'->>'type','—'),
  calculated.version_number,coalesce(calculated.process_count,0)
 from calculated order by calculated.model_name;
$$;
revoke all on function public.get_st_all_model_report_metrics() from public;
grant execute on function public.get_st_all_model_report_metrics() to anon,authenticated;
