-- Search the complete scoped catalog, including SKU codes and attributes.
create function public.catalog_search_document(p_title text,p_content text,p_metadata jsonb) returns tsvector
language sql immutable parallel safe set search_path=public as $$
 select setweight(to_tsvector('portuguese',coalesce(p_metadata->>'title',p_title,'')),'A')
 || setweight(to_tsvector('portuguese',coalesce(p_metadata->>'category','')||' '||coalesce(p_metadata->'attributes','[]')::text),'B')
 || setweight(to_tsvector('portuguese',coalesce(p_metadata->>'description',p_content,'')),'D');
$$;
create index catalog_runtime_search_idx on public.intelligence_memory using gin(public.catalog_search_document(title,content,metadata))
 where scope='organization' and memory_type='sales_catalog_item';
create index catalog_sku_runtime_search_idx on public.sales_catalog_skus using gin(to_tsvector('portuguese',coalesce(title,'')||' '||coalesce(sku_code,'')||' '||coalesce(attributes,'[]')::text));

create function public.search_runtime_catalog(p_org uuid,p_agent uuid,p_instance uuid,p_query text default '',p_offset integer default 0,p_limit integer default 20,p_ids uuid[] default '{}') returns jsonb
language sql stable security definer set search_path=public as $$
 with search as (
   select nullif((select string_agg(quote_literal(term),' | ') from unnest(tsvector_to_array(to_tsvector('portuguese',left(coalesce(p_query,''),400)))) term),'')::tsquery q
 ), ranked as (
   select m.*, case when search.q is null then 0 else ts_rank_cd(public.catalog_search_document(m.title,m.content,m.metadata),search.q) end
     + coalesce((select max(ts_rank_cd(to_tsvector('portuguese',coalesce(s.title,'')||' '||coalesce(s.sku_code,'')||' '||coalesce(s.attributes,'[]')::text),search.q))
       from public.sales_catalog_skus s where s.organization_id=p_org and s.catalog_item_id=m.id and s.status='active'),0) score
   from public.intelligence_memory m cross join search
   where m.organization_id=p_org and m.scope='organization' and m.memory_type='sales_catalog_item' and m.metadata->>'status'='active'
   and (
     (coalesce(m.metadata->'assigned_agent_ids',m.metadata->'agent_ids','[]')='[]'::jsonb and coalesce(m.metadata->'assigned_whatsapp_instance_ids',m.metadata->'whatsapp_instance_ids','[]')='[]'::jsonb)
     or coalesce(m.metadata->'assigned_agent_ids',m.metadata->'agent_ids','[]') @> jsonb_build_array(p_agent::text)
     or coalesce(m.metadata->'assigned_whatsapp_instance_ids',m.metadata->'whatsapp_instance_ids','[]') @> jsonb_build_array(p_instance::text)
   )
   and (search.q is null or public.catalog_search_document(m.title,m.content,m.metadata) @@ search.q
     or exists(select 1 from public.sales_catalog_skus s where s.organization_id=p_org and s.catalog_item_id=m.id and s.status='active'
       and to_tsvector('portuguese',coalesce(s.title,'')||' '||coalesce(s.sku_code,'')||' '||coalesce(s.attributes,'[]')::text) @@ search.q)
     or m.id=any(p_ids))
 ), matches as (
   select * from ranked where not(id=any(p_ids)) order by score desc,created_at desc,id
     offset greatest(0,least(coalesce(p_offset,0),100000)) limit greatest(1,least(coalesce(p_limit,20),40))+1
 ), page as (
   select * from matches order by score desc,created_at desc,id limit greatest(1,least(coalesce(p_limit,20),40))
 ), result as (
   select to_jsonb(page)-'score' item,score,created_at,id,0 priority from page
   union all select to_jsonb(ranked)-'score',score,created_at,id,1 from ranked where id=any(p_ids)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(item order by priority,score desc,created_at desc,id) from result),'[]'),
   'has_more',(select count(*)>greatest(1,least(coalesce(p_limit,20),40)) from matches));
$$;
revoke all on function public.search_runtime_catalog(uuid,uuid,uuid,text,integer,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.search_runtime_catalog(uuid,uuid,uuid,text,integer,integer,uuid[]) to service_role;
