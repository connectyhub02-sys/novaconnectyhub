-- Include old archived-test memory and detach the lead from company usage.
-- Company consumption totals remain unchanged; no conversational metadata stays.
do $fix$
declare definition text; needle text; start_at integer; end_at integer; replacement text;
begin
 if to_regprocedure('public.release_organization_storage_usage(uuid,bigint,integer,text,jsonb)') is null then
   raise exception 'Apply 0062_release_storage_usage before enabling lead reset';
 end if;
 definition:=pg_get_functiondef('public.reset_lead_data(uuid,uuid,uuid,boolean)'::regprocedure);
 needle:=$needle$metadata->>''lead_id''=any(%L::text[]) or metadata->>''conversation_id''=any(%L::text[])$needle$;
 if position(needle in definition)=0 then raise exception 'RESET_MIGRATION_SOURCE_MISMATCH'; end if;
 definition:=replace(definition,needle,needle||$more$ or metadata->>''source_conversation_id''=any(%3$L::text[])$more$);
 start_at:=position('update public.usage_events set metadata=' in definition);
 if start_at=0 then raise exception 'RESET_MIGRATION_SOURCE_MISMATCH'; end if;
 end_at:=position(';' in substring(definition from start_at));
 replacement:=$update$
 condition_sql:='agent_run_id::text in (select row_key->>''id'' from pg_temp.lead_reset_targets where table_id=''public.agent_runs''::regclass)';
 join_sql:='';
 for t in select attname,atttypid,atttypmod from pg_attribute where attrelid='public.usage_events'::regclass
   and attname in ('lead_id','conversation_id') and not attisdropped loop
   condition_sql:=condition_sql||format(' or %I=any(%L::%s[])',t.attname,case when t.attname='lead_id' then lids else cids end,format_type(t.atttypid,t.atttypmod));
   join_sql:=join_sql||format(',%I=null',t.attname);
 end loop;
 execute format('update public.usage_events set metadata=''{}''%s where %s',join_sql,condition_sql);
 $update$;
 definition:=left(definition,start_at-1)||replacement||substring(definition from start_at+end_at);
 execute definition;
end $fix$;
