-- One compact RPC supplies layout staffing metrics for the model summary, avoiding one database call per model.
create or replace function public.get_st_all_model_layout_metrics()
returns table(model_name text,direct_mp numeric,line_value text,type_value text,version_number text,process_count integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select m.model_name,
   coalesce(stats.direct_mp,0),
   coalesce(data.doc->>'line',data.doc->'model'->>'line','—'),
   coalesce(data.doc->>'type',data.doc->'model'->>'type','—'),
   lv.version_number,
   coalesce(stats.process_count,0)
 from public.models m
 join public.layout_versions lv on lv.id=m.current_published_version_id
 cross join lateral (select coalesce(lv.published_snapshot,lv.layout_data,'{}'::jsonb) as doc) data
 left join lateral (
   select
    sum(coalesce(nullif(regexp_replace(coalesce(p.value->>'mp',p.value->>'manpower','0'),'[^0-9.]','','g'),''),'0')::numeric)
      filter (where lower(coalesce(p.value->>'name',p.value->>'stationName','')) !~ '(iqc|vision|oqc|pqc|leader|support)') as direct_mp,
    count(*)::integer as process_count
   from jsonb_array_elements(coalesce(data.doc->'processes','[]'::jsonb)) p
 ) stats on true
 where m.model_name is not null
 order by m.model_name;
$$;
revoke all on function public.get_st_all_model_layout_metrics() from public;
grant execute on function public.get_st_all_model_layout_metrics() to anon,authenticated;
