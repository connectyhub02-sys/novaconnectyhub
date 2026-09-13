-- Irreversible, tenant-scoped lead reset. The service route owns authorization.
-- A job keeps only deletion progress, never a backup of the deleted conversation.
create table public.lead_reset_jobs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 target_lead_id uuid not null,
 requested_by uuid not null,
 contact_hash text,
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 assets jsonb not null default '[]',
 counts jsonb not null default '{}',
 unique(organization_id,target_lead_id)
);
alter table public.lead_reset_jobs enable row level security;
revoke all on public.lead_reset_jobs from public,anon,authenticated;
grant all on public.lead_reset_jobs to service_role;

create schema if not exists lead_reset_internal;
revoke all on schema lead_reset_internal from public,anon,authenticated;

-- Transaction-only deletion markers. Clients cannot insert these or disable
-- archiving; normal writes and concurrent transactions keep their full archive.
create table lead_reset_internal.active_targets (
 transaction_id bigint not null, table_id oid not null, row_id uuid not null,
 primary key(transaction_id,table_id,row_id)
);
revoke all on lead_reset_internal.active_targets from public,anon,authenticated,service_role;
create function lead_reset_internal.is_deleting(p_table oid,p_id uuid) returns boolean
language sql set search_path=pg_catalog,lead_reset_internal as $$
 select exists(select 1 from lead_reset_internal.active_targets
 where transaction_id=txid_current() and table_id=p_table and row_id=p_id)
$$;
revoke all on function lead_reset_internal.is_deleting(oid,uuid) from public,anon,authenticated,service_role;
do $archive_guard$
declare fn regprocedure; definition text;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('archive_lead_message_trigger','archive_lead_record_change','archive_whatsapp_outbound') and p.pronargs=0
 loop
   definition:=pg_get_functiondef(fn);
   if position('lead_reset_internal.is_deleting' in definition)=0 then
     definition:=regexp_replace(definition,'\mbegin\M',
       'begin if lead_reset_internal.is_deleting(tg_relid,coalesce(new.id,old.id)) then if tg_op=''DELETE'' then return old; else return new; end if; end if;', 'i');
     execute definition;
   end if;
 end loop;
end $archive_guard$;

create function lead_reset_internal.collect(p_table regclass,p_condition text,p_depth integer,p_org uuid)
returns integer language plpgsql set search_path=public,pg_temp as $$
declare pk text; snapshot_fields text; inserted integer; has_other boolean; has_rows boolean;
begin
 execute format('select exists(select 1 from %s r where %s)',p_table,p_condition) into has_rows;
 if not has_rows then return 0; end if;
 select string_agg(format('%L,r.%I',a.attname,a.attname),',') into pk
 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
 where i.indrelid=p_table and i.indisprimary;
 if pk is null then raise exception 'RESET_TABLE_WITHOUT_PRIMARY_KEY: %',p_table; end if;
 if exists(select 1 from pg_attribute where attrelid=p_table and attname='organization_id' and not attisdropped) then
   execute format('select exists(select 1 from %s r where (%s) and r.organization_id<>%L::uuid)',p_table,p_condition,p_org::text) into has_other;
   if has_other then raise exception 'RESET_CROSS_ORGANIZATION_REFERENCE: %',p_table; end if;
 end if;
 -- Keep only dependency keys and the storage manifest. Message bodies, model
 -- traces and archived JSON are never copied/decompressed into the working set.
 select string_agg(format('%L,r.%I',a.attname,a.attname),',') into snapshot_fields
 from pg_attribute a where a.attrelid=p_table and a.attnum>0 and not a.attisdropped and
 (a.attname in ('id','object_key','byte_size','r2_object_key','bytes_size') or exists
   (select 1 from pg_constraint c where c.contype='f' and c.confrelid=p_table and a.attnum=any(c.confkey)));
 snapshot_fields:=coalesce(snapshot_fields,pk);
 if p_table='public.conversation_messages'::regclass then
   snapshot_fields:=snapshot_fields||',''payload'',jsonb_build_object(''generated_audio_media_id'',r.payload->''generated_audio_media_id'')';
 elsif p_table='public.sales_catalog_orders'::regclass then
   snapshot_fields:=snapshot_fields||',''metadata'',jsonb_build_object(''latest_checkout_tracking_link_id'',r.metadata->''latest_checkout_tracking_link_id'')';
 elsif p_table='public.lead_files'::regclass then
   snapshot_fields:=snapshot_fields||',''metadata'',jsonb_build_object(''storage_bucket'',r.metadata->''storage_bucket'')';
 end if;
 execute format('insert into pg_temp.lead_reset_targets(table_id,row_key,depth,snapshot)
 select %s,jsonb_build_object(%s),%s,jsonb_build_object(%s) from %s r where %s on conflict do nothing',p_table::oid,pk,p_depth,snapshot_fields,p_table,p_condition);
 get diagnostics inserted=row_count;
 return inserted;
end $$;
revoke all on function lead_reset_internal.collect(regclass,text,integer,uuid) from public,anon,authenticated;

-- Constant key arrays let PostgreSQL use each table's primary-key index instead
-- of joining large JSON snapshots against the complete message/archive tables.
create function lead_reset_internal.key_filter(p_table regclass)
returns text language plpgsql set search_path=public,pg_temp as $$
declare key_column record; cols text; vals text; keys text[];
begin
 if (select indnkeyatts from pg_index where indrelid=p_table and indisprimary)=1 then
   select a.* into key_column from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0] where i.indrelid=p_table and i.indisprimary;
   select coalesce(array_agg(row_key->>key_column.attname),'{}') into keys from pg_temp.lead_reset_targets where table_id=p_table;
   return format('r.%I=any(%L::%s[])',key_column.attname,keys,format_type(key_column.atttypid,key_column.atttypmod));
 end if;
 select string_agg(format('r.%I',a.attname),','),string_agg(format('(z.row_key->>%L)::%s',a.attname,format_type(a.atttypid,a.atttypmod)),',') into cols,vals
 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=p_table and i.indisprimary;
 return format('(%s) in (select %s from pg_temp.lead_reset_targets z where z.table_id=%s)',cols,vals,p_table::oid);
end $$;
revoke all on function lead_reset_internal.key_filter(regclass) from public,anon,authenticated;

create function public.reset_lead_data(p_organization_id uuid,p_lead_id uuid,p_actor_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 lead_row public.leads; job public.lead_reset_jobs; cids text[]; chats text[]; lids text[]; contact_phone text;
 t record; fk record; entry record; join_sql text; condition_sql text; added integer;
 changed integer; pass integer; remaining integer; counts jsonb; assets jsonb; reset_at timestamptz;
begin
 if p_organization_id is null or p_lead_id is null or p_actor_id is null then raise exception 'RESET_SCOPE_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_lead_id::text,134));
 select * into job from public.lead_reset_jobs where organization_id=p_organization_id and target_lead_id=p_lead_id;
 if job.id is not null then return jsonb_build_object('jobId',job.id,'deleted',true,'complete',job.completed_at is not null,'counts',job.counts); end if;
 -- Serialize writers only for the short database transaction. In-flight external
 -- sends must finish first; queued work is removed with its old identifiers.
 if p_confirm then
   lock table public.leads,public.conversations in share row exclusive mode;
 end if;
 select * into lead_row from public.leads where id=p_lead_id and organization_id=p_organization_id for update;
 if not found then raise exception 'RESET_LEAD_NOT_FOUND'; end if;
 contact_phone:=nullif(regexp_replace(coalesce(lead_row.phone_number,lead_row.metadata->>'archived_reopened_original_phone'),'\D','','g'),'');
 select array_agg(id::text) into lids from public.leads where organization_id=p_organization_id and
   (id=p_lead_id or (contact_phone is not null and channel=lead_row.channel and
     regexp_replace(coalesce(phone_number,metadata->>'archived_reopened_original_phone'),'\D','','g')=contact_phone));
 select coalesce(array_agg(id::text),'{}'),coalesce(array_agg(coalesce(provider_chat_id,metadata->>'original_provider_chat_id')) filter(where coalesce(provider_chat_id,metadata->>'original_provider_chat_id') is not null),'{}') into cids,chats
 from public.conversations where organization_id=p_organization_id and
 (lead_id=any(lids::uuid[]) or metadata->>'original_lead_id'=any(lids) or metadata->>'archived_reset_original_lead_id'=any(lids)
   or (lead_id is null and contact_phone is not null and lead_row.channel::text='whatsapp'
     and coalesce(provider_chat_id,metadata->>'original_provider_chat_id')=contact_phone||'@s.whatsapp.net'));
 select array(select distinct unnest(lids||coalesce(array_agg(metadata->>'original_lead_id') filter(where metadata->>'original_lead_id' ~* '^[a-f0-9-]{36}$'),'{}'))) into lids
   from public.conversations where id=any(cids::uuid[]);
 if contact_phone is not null and lead_row.channel::text='whatsapp' then chats:=array_append(chats,contact_phone||'@s.whatsapp.net'); end if;
 if exists(select 1 from public.agent_runs where organization_id=p_organization_id and run_status='running'
   and (metadata->>'leadId'=any(lids) or metadata->>'conversationId'=any(cids))) then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
 if exists(select 1 from public.automation_dispatches where organization_id=p_organization_id and lead_id=any(lids::uuid[]) and status in ('processing','sending')) then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
 if exists(select 1 from public.lead_message_archive where organization_id=p_organization_id and lead_id=any(lids::uuid[]) and claimed_at is not null) then raise exception 'RESET_ARCHIVE_BUSY'; end if;
 create temporary table if not exists lead_reset_targets(table_id oid not null,row_key jsonb not null,depth integer not null,snapshot jsonb not null,primary key(table_id,row_key)) on commit drop;
 truncate pg_temp.lead_reset_targets;
 perform lead_reset_internal.collect('public.leads',format('id=any(%L::uuid[])',lids),0,p_organization_id);
 -- Seed foreign-key and JSON-only associations. Never seed shared configuration
 -- or company billing merely because a historical run referred to a lead.
 for t in select c.oid::regclass as tab,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relname not in
   ('leads','lead_reset_jobs','organizations','profiles','organization_members','agent_registry','whatsapp_instances','integration_credentials','usage_events','intelligence_memory')
 loop
   if exists(select 1 from pg_attribute where attrelid=t.tab and attname in ('lead_id','conversation_id') and not attisdropped) then
     select string_agg(case when attname='lead_id' then format('r.lead_id=any(%L::%s[])',lids,format_type(atttypid,atttypmod))
       else format('r.conversation_id=any(%L::%s[])',cids,format_type(atttypid,atttypmod)) end,' or ')
       into condition_sql from pg_attribute where attrelid=t.tab and attname in ('lead_id','conversation_id') and not attisdropped;
     perform lead_reset_internal.collect(t.tab,condition_sql,1,p_organization_id);
   end if;
 end loop;
 perform lead_reset_internal.collect('public.conversations',format('id::text=any(%L::text[])',cids),1,p_organization_id);
 perform lead_reset_internal.collect('public.agent_runs',format('organization_id=%L::uuid and (metadata->>''leadId''=any(%L::text[]) or metadata->>''conversationId''=any(%L::text[]))',p_organization_id,lids,cids),1,p_organization_id);
 perform lead_reset_internal.collect('public.intelligence_events',format('organization_id=%L::uuid and (payload->>''lead_id''=any(%L::text[]) or payload->>''conversation_id''=any(%L::text[]))',p_organization_id,lids,cids),1,p_organization_id);
 perform lead_reset_internal.collect('public.intelligence_memory',format('(organization_id=%L::uuid or organization_id is null) and ''agent_learning''=any(tags) and metadata->>''source_conversation_id''=any(%L::text[])',p_organization_id,cids),1,p_organization_id);
 perform lead_reset_internal.collect('public.intelligence_memory',format('organization_id=%L::uuid and (metadata->>''lead_id''=any(%L::text[]) or metadata->>''conversation_id''=any(%L::text[]))',p_organization_id,lids,cids),1,p_organization_id);
 perform lead_reset_internal.collect('public.whatsapp_webhook_events',format('organization_id=%L::uuid and provider_chat_id=any(%L::text[])',p_organization_id,chats),1,p_organization_id);
 perform lead_reset_internal.collect('public.generated_media',format('organization_id=%L::uuid and id::text in (select snapshot#>>''{payload,generated_audio_media_id}'' from pg_temp.lead_reset_targets where table_id=''public.conversation_messages''::regclass)',p_organization_id),1,p_organization_id);
 -- Checkout tracking memory belongs to this order, unlike shared agent knowledge.
 perform lead_reset_internal.collect('public.intelligence_memory',format('organization_id=%L::uuid and id::text in (select snapshot#>>''{metadata,latest_checkout_tracking_link_id}'' from pg_temp.lead_reset_targets where table_id=''public.sales_catalog_orders''::regclass)',p_organization_id),1,p_organization_id);
 -- Follow descendants, including NO ACTION and SET NULL associations that a
 -- plain DELETE FROM leads would retain. Do not follow ancestors (catalog/account).
 for pass in 1..40 loop
   added:=0;
   for fk in select c.*,c.conrelid::regclass as child,c.confrelid::regclass as parent
     from pg_constraint c join pg_namespace n on n.oid=c.connamespace
     where c.contype='f' and n.nspname='public' and c.conrelid<>'public.usage_events'::regclass
       and exists(select 1 from pg_temp.lead_reset_targets where table_id=c.confrelid)
   loop
     select string_agg(format('r.%I=(z.snapshot->>%L)::%s',ca.attname,pa.attname,format_type(ca.atttypid,ca.atttypmod)),' and ') into join_sql
       from unnest(fk.conkey,fk.confkey) k(ck,pk)
       join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.ck
       join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.pk;
     condition_sql:=format('exists(select 1 from pg_temp.lead_reset_targets z where z.table_id=%s and %s)',fk.confrelid,join_sql);
     if array_length(fk.conkey,1)=1 then
       -- Materialize parent values once. A correlated scan would repeatedly
       -- decompress archived JSON for every message in a large tenant.
       select format('r.%I=any(%L::%s[])',ca.attname,
         coalesce(array_agg(z.snapshot->>pa.attname) filter(where z.snapshot->>pa.attname is not null),'{}'),
         format_type(ca.atttypid,ca.atttypmod)) into condition_sql
         from pg_attribute ca join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=fk.confkey[1]
         left join pg_temp.lead_reset_targets z on z.table_id=fk.confrelid
         where ca.attrelid=fk.conrelid and ca.attnum=fk.conkey[1]
         group by ca.attname,ca.atttypid,ca.atttypmod;
     end if;
     -- A visit in another tenant can reference this checkout. SET NULL already
     -- defines the safe outcome: detach that reference, never erase its lead.
     if fk.confdeltype='n' and exists(select 1 from pg_attribute where attrelid=fk.conrelid and attname='organization_id' and not attisdropped) then
       condition_sql:=format('(%s) and (r.organization_id=%L::uuid or r.organization_id is null)',condition_sql,p_organization_id);
     end if;
     added:=added+lead_reset_internal.collect(fk.child,condition_sql,pass+1,p_organization_id);
   end loop;
   exit when added=0;
   if pass=40 then raise exception 'RESET_DEPENDENCY_LIMIT'; end if;
 end loop;
 if p_confirm then
   -- Wait for row writers, then recheck leases before deleting anything. A
   -- queued worker cannot claim one of these rows after this check.
   for entry in select distinct table_id from pg_temp.lead_reset_targets order by table_id loop
     execute format('select 1 from %s r where %s for update',entry.table_id::regclass,lead_reset_internal.key_filter(entry.table_id::regclass));
   end loop;
   if exists(select 1 from public.agent_runs where organization_id=p_organization_id and run_status='running'
     and (metadata->>'leadId'=any(lids) or metadata->>'conversationId'=any(cids))) then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
   for t in select distinct table_id from pg_temp.lead_reset_targets loop
     select string_agg(case attname
       when 'status' then 'r.status::text in (''processing'',''sending'',''dispatching'')'
       when 'state' then 'r.state::text in (''processing'',''dispatching'')'
       else 'r.claimed_at is not null' end,' or ') into join_sql
       from pg_attribute where attrelid=t.table_id and attname in ('status','state','claimed_at') and not attisdropped;
     if join_sql is null then continue; end if;
     execute format('select exists(select 1 from %s r where (%s) and (%s))',t.table_id::regclass,lead_reset_internal.key_filter(t.table_id::regclass),join_sql) into condition_sql;
     if condition_sql::boolean then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
   end loop;
 end if;
 select coalesce(jsonb_object_agg(tab,cnt),'{}') into counts from (select table_id::regclass::text as tab,count(*) as cnt from pg_temp.lead_reset_targets group by table_id) totals;
 select coalesce(jsonb_agg(asset),'[]') into assets from (
 select jsonb_build_object('key',snapshot->>'object_key','bucket',coalesce(snapshot#>>'{metadata,storage_bucket}','r2'),'bytes',coalesce((snapshot->>'byte_size')::bigint,0),'category','lead_file') asset
 from pg_temp.lead_reset_targets where table_id='public.lead_files'::regclass and snapshot->>'object_key' is not null
 union
 select jsonb_build_object('key',snapshot->>'r2_object_key','bucket','r2','bytes',coalesce((snapshot->>'bytes_size')::bigint,0),'category','generated_media')
 from pg_temp.lead_reset_targets where table_id='public.generated_media'::regclass and snapshot->>'r2_object_key' is not null
 ) a;
 if not p_confirm then return jsonb_build_object('deleted',false,'counts',counts,'files',jsonb_array_length(assets),'leadIds',lids); end if;
 reset_at:=clock_timestamp();
 insert into public.lead_reset_jobs(organization_id,target_lead_id,requested_by,contact_hash,started_at,assets,counts)
 values(p_organization_id,p_lead_id,p_actor_id,case when contact_phone is not null then md5(p_organization_id::text||':'||contact_phone) end,reset_at,assets,counts) returning * into job;
 insert into lead_reset_internal.active_targets(transaction_id,table_id,row_id)
 select txid_current(),table_id,(row_key->>'id')::uuid from pg_temp.lead_reset_targets
 where table_id in ('public.leads'::regclass,'public.conversation_messages'::regclass,'public.sales_catalog_orders'::regclass)
   or table_id=to_regclass('public.whatsapp_outbound_deliveries');
 -- Break nullable cycles only within the deletion set. The target keys remain
 -- stable because primary-key columns are never nullable.
 for fk in select c.*,c.conrelid::regclass as child,c.confrelid::regclass as parent
   from pg_constraint c join pg_namespace n on n.oid=c.connamespace
   where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1
     and exists(select 1 from pg_temp.lead_reset_targets where table_id=c.conrelid)
     and exists(select 1 from pg_temp.lead_reset_targets where table_id=c.confrelid)
     and exists(select 1 from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1] and not attnotnull)
 loop
   -- Ordinary descendants can be deleted directly. Only a path back to the
   -- child makes this FK part of a cycle requiring an UPDATE before deletion.
   if not exists(with recursive reachable(rel) as (
     select fk.confrelid union select c.confrelid from pg_constraint c join reachable r on c.conrelid=r.rel
     where c.contype='f' and exists(select 1 from pg_temp.lead_reset_targets where table_id=c.confrelid)
   ) select 1 from reachable where rel=fk.conrelid) then continue; end if;
   select format('r.%I=any(%L::%s[])',ca.attname,coalesce(array_agg(z.snapshot->>pa.attname) filter(where z.snapshot->>pa.attname is not null),'{}'),format_type(ca.atttypid,ca.atttypmod)),ca.attname into join_sql,condition_sql
     from pg_attribute ca join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=fk.confkey[1]
     left join pg_temp.lead_reset_targets z on z.table_id=fk.confrelid
     where ca.attrelid=fk.conrelid and ca.attnum=fk.conkey[1] group by ca.attname,ca.atttypid,ca.atttypmod;
   execute format('update %s r set %I=null where (%s) and (%s)',fk.child,condition_sql,lead_reset_internal.key_filter(fk.child),join_sql);
 end loop;
 -- Company usage/cost totals are not the lead's CRM records. Remove only the
 -- conversational metadata attached to affected runs; FK detaches their run ID.
 update public.usage_events set metadata='{}' where agent_run_id::text in
   (select row_key->>'id' from pg_temp.lead_reset_targets where table_id='public.agent_runs'::regclass);
 for pass in 1..40 loop
   changed:=0;
   for entry in select table_id,max(depth) as depth from pg_temp.lead_reset_targets group by table_id order by max(depth) desc,table_id loop
     begin
       execute format('delete from %s r where %s',entry.table_id::regclass,lead_reset_internal.key_filter(entry.table_id::regclass));
       delete from pg_temp.lead_reset_targets where table_id=entry.table_id;
       changed:=changed+1;
     exception when foreign_key_violation then condition_sql:=sqlerrm;
     end;
   end loop;
   select count(*) into remaining from pg_temp.lead_reset_targets;
   exit when remaining=0;
   if changed=0 or pass=40 then raise exception 'RESET_DEPENDENCY_BLOCKED: %',condition_sql; end if;
 end loop;
 -- Archive triggers may add diagnostic events during the purge. No lead content
 -- from those deletes is kept, and the archive itself cascades with the lead.
 delete from public.intelligence_events where organization_id=p_organization_id and (payload->>'lead_id'=any(lids) or payload->>'conversation_id'=any(cids));
 delete from lead_reset_internal.active_targets where transaction_id=txid_current();
 if jsonb_array_length(assets)=0 then update public.lead_reset_jobs set completed_at=clock_timestamp() where id=job.id; end if;
 return jsonb_build_object('jobId',job.id,'deleted',true,'complete',jsonb_array_length(assets)=0,'counts',counts,'leadIds',lids);
end $$;
revoke all on function public.reset_lead_data(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reset_lead_data(uuid,uuid,uuid,boolean) to service_role;

-- A provider replay or a delayed outbound operation must not recreate an erased
-- contact. A fresh inbound message carries a newer last_message_at.
create function public.guard_reset_lead_recreation() returns trigger language plpgsql security definer set search_path=public as $$
declare reset_job public.lead_reset_jobs;
begin
 if new.phone_number is null then return new; end if;
 select * into reset_job from public.lead_reset_jobs where organization_id=new.organization_id
   and contact_hash=md5(new.organization_id::text||':'||regexp_replace(new.phone_number,'\D','','g')) order by started_at desc limit 1;
 if reset_job.id is not null and (reset_job.completed_at is null or new.last_message_at is null or new.last_message_at<=reset_job.started_at) then
   raise exception 'LEAD_RESET_OLD_EVENT';
 end if;
 return new;
end $$;
revoke all on function public.guard_reset_lead_recreation() from public,anon,authenticated;
create trigger lead_reset_recreation_guard before insert on public.leads for each row execute function public.guard_reset_lead_recreation();

-- Consult before saving a webhook, including outbound echoes. Old payloads are
-- discarded without storing their content again; pending file cleanup is retried.
create function public.lead_reset_message_status(p_organization_id uuid,p_phone text,p_occurred_at timestamptz,p_inbound boolean)
returns text language sql security definer set search_path=public as $$
 select coalesce((select case when p_occurred_at is null or p_occurred_at<=started_at then 'old'
   when completed_at is null then 'pending'
   when not p_inbound and not exists(select 1 from public.leads l where l.organization_id=p_organization_id and regexp_replace(l.phone_number,'\D','','g')=regexp_replace(p_phone,'\D','','g')) then 'old'
   else 'allowed' end from public.lead_reset_jobs where organization_id=p_organization_id
   and contact_hash=md5(p_organization_id::text||':'||regexp_replace(p_phone,'\D','','g')) order by started_at desc limit 1),'allowed');
$$;
revoke all on function public.lead_reset_message_status(uuid,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.lead_reset_message_status(uuid,text,timestamptz,boolean) to service_role;

-- Storage acknowledgement and quota release commit together, so retries can
-- delete a missing object safely without releasing the company's quota twice.
create function public.complete_lead_reset_asset(p_organization_id uuid,p_job_id uuid,p_index integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.lead_reset_jobs; a jsonb;
begin
 select * into j from public.lead_reset_jobs where id=p_job_id and organization_id=p_organization_id for update;
 if not found then raise exception 'RESET_JOB_NOT_FOUND'; end if;
 a:=j.assets->p_index;
 if a is null or p_index<0 then raise exception 'RESET_ASSET_NOT_FOUND'; end if;
 if coalesce((a->>'done')::boolean,false) then return true; end if;
 perform public.release_organization_storage_usage(p_organization_id,(a->>'bytes')::bigint,1,a->>'category','{}'::jsonb);
 j.assets:=jsonb_set(j.assets,array[p_index::text],jsonb_build_object('done',true));
 update public.lead_reset_jobs set assets=j.assets,completed_at=case when not exists(select 1 from jsonb_array_elements(j.assets) e where not coalesce((e->>'done')::boolean,false)) then clock_timestamp() else null end where id=j.id;
 return true;
end $$;
revoke all on function public.complete_lead_reset_asset(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_lead_reset_asset(uuid,uuid,integer) to service_role;
