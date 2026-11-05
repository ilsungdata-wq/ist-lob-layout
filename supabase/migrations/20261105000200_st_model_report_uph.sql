-- Add UPH to the consolidated report while preserving the single batched query.
drop function if exists public.get_st_all_model_report_metrics();
create function public.get_st_all_model_report_metrics()
returns table(model_name text,direct_mp numeric,lob numeric,uph numeric,line_value text,type_value text,version_number text,process_count integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select m.model_name,
   coalesce(stats.direct_mp,0),
   coalesce(nullif(regexp_replace(coalesce(data.doc->'lobSummary'->>'lob',''),'[^0-9.]','','g'),'')::numeric,
     case when coalesce(stats.neck_time,0)>0 and coalesce(stats.process_count,0)>0 then round(stats.operation_time/(stats.process_count*stats.neck_time)*100,1) else 0 end),
   coalesce(nullif(regexp_replace(coalesce(data.doc->'lobSummary'->>'uph',''),'[^0-9.]','','g'),'')::numeric,
     case when coalesce(stats.neck_time,0)>0 then round(3600/stats.neck_time,1) else 0 end),
   coalesce(data.doc->>'line',data.doc->'model'->>'line','—'),
   coalesce(data.doc->>'type',data.doc->'model'->>'type','—'),lv.version_number,coalesce(stats.process_count,0)
 from public.models m join public.layout_versions lv on lv.id=m.current_published_version_id
 cross join lateral(select coalesce(lv.published_snapshot,lv.layout_data,'{}'::jsonb) doc)data
 left join lateral(select
   sum(coalesce(nullif(regexp_replace(coalesce(p.value->>'mp',p.value->>'manpower','0'),'[^0-9.]','','g'),''),'0')::numeric) filter(where lower(coalesce(p.value->>'name',p.value->>'stationName','')) !~ '(iqc|vision|oqc|pqc|leader|support)') direct_mp,
   sum(coalesce(nullif(regexp_replace(coalesce(p.value->>'time',p.value->>'taktTime',p.value->>'tt','0'),'[^0-9.]','','g'),''),'0')::numeric) operation_time,
   max(coalesce(nullif(regexp_replace(coalesce(p.value->>'time',p.value->>'taktTime',p.value->>'tt','0'),'[^0-9.]','','g'),''),'0')::numeric/nullif(coalesce(nullif(regexp_replace(coalesce(p.value->>'mp',p.value->>'manpower','0'),'[^0-9.]','','g'),''),'0')::numeric,0)) neck_time,
   count(*)::integer process_count from jsonb_array_elements(coalesce(data.doc->'processes','[]'::jsonb)) p)stats on true
 where m.model_name is not null order by m.model_name;
$$;
revoke all on function public.get_st_all_model_report_metrics() from public;
grant execute on function public.get_st_all_model_report_metrics() to anon,authenticated;
