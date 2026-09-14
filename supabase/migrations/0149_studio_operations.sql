-- Add operation metadata to the shared voice receipt, so legacy TTS/clone and
-- Studio share wallet holds, monthly limits, concurrency and idempotency keys.
alter table public.voice_generations drop constraint voice_generations_operation_check;
alter table public.voice_generations add constraint voice_generations_operation_check check(operation in ('text_to_speech','voice_clone','voice_clone_preview','studio'));
alter table public.voice_generations drop constraint voice_generations_bytes_size_check;
alter table public.voice_generations add constraint voice_generations_bytes_size_check check(bytes_size between 1 and 20000000);
create table public.studio_capabilities (
 operation text not null, model_id text not null, provider public.billing_provider not null, feature_code text not null,
 updated_at timestamptz not null default now(), updated_by uuid,
 enabled boolean not null default false, confirmed_at timestamptz, cost_evidence text,
 confirmed_rates jsonb not null default '[]' check(jsonb_typeof(confirmed_rates)='array'),
 primary key(operation,model_id),
 check(operation in ('transcription','audio_isolation','voice_change','forced_alignment','dialogue','voice_design','voice_design_save','dictionary_create','dubbing','gemini_tts')),
 check(not enabled or (confirmed_at is not null and length(cost_evidence)>10 and jsonb_array_length(confirmed_rates)>0))
);
create table public.studio_operations (
 id uuid primary key references public.voice_generations(id), operation text not null, model_id text not null,
 provider public.billing_provider not null, feature_code text not null,
 input jsonb not null, reserved_units jsonb not null, actual_units jsonb,
 provider_receipt text, result_mime text, result_file_count integer, result_manifest jsonb,
 result_state text not null default 'available' check(result_state in ('available','deleting','deleted')),
 storage_reserved_bytes integer not null check(storage_reserved_bytes between 1 and 20000000),
 storage_reserved_files integer not null check(storage_reserved_files between 1 and 4),
 foreign key(operation,model_id) references public.studio_capabilities(operation,model_id)
);
create table public.studio_resources (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.voice_projects(id),
 organization_id uuid not null references public.organizations(id), operation_id uuid not null references public.studio_operations(id),
 kind text not null check(kind in ('voice_preview','voice','dictionary','dub')),
 name text not null, provider_id text not null, provider_version text, object_path text,
 metadata jsonb not null default '{}', status text not null default 'ready' check(status in ('ready','deleting','deleted')),
 created_at timestamptz not null default now(), unique(operation_id,provider_id)
);
alter table public.studio_capabilities enable row level security;
alter table public.studio_operations enable row level security;
alter table public.studio_resources enable row level security;
revoke all on public.studio_capabilities,public.studio_operations,public.studio_resources from public,anon,authenticated;
grant all on public.studio_capabilities,public.studio_operations,public.studio_resources to service_role;

create function public.reserve_studio_operation(p_project uuid,p_key uuid,p_idempotency text,p_hash text,p_operation text,p_model text,p_voice text,p_characters integer,p_charge numeric,p_cost numeric,p_rates jsonb,p_input jsonb,p_units jsonb,p_storage_bytes integer,p_storage_files integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; c public.studio_capabilities; g public.voice_generations; e record; u public.organization_storage_usage;
begin
 select * into c from public.studio_capabilities where operation=p_operation and model_id=p_model and enabled;
 if c.operation is null then raise exception 'voice_capability_unavailable'; end if;
 if p_charge is null or p_charge<0 or p_charge::text in ('NaN','Infinity','-Infinity') or p_storage_bytes is null or p_storage_bytes not between 1 and 20000000 or p_storage_files is null or p_storage_files not between 1 and 4 then raise exception 'voice_price_invalid'; end if;
 -- The existing function creates the hold and applies all shared limits. The
 -- placeholder is replaced in this same transaction, never visible as a clone.
 r:=public.reserve_voice_generation(p_project,p_key,p_idempotency,p_hash,p_voice,p_model,p_characters,p_charge,p_cost,p_rates,'voice_clone');
 if not (r->>'claimed')::boolean then
  if not exists(select 1 from public.studio_operations where id=(r->>'id')::uuid) then raise exception 'voice_idempotency_conflict'; end if;
  return r;
 end if;
 select * into g from public.voice_generations where id=(r->>'id')::uuid;
 perform public.record_organization_storage_usage(g.billing_organization_id,0,0,'generated_media','{}');
 select * into u from public.organization_storage_usage where organization_id=g.billing_organization_id for update;
 select * into e from public.get_organization_storage_entitlement(g.organization_id);
 if e.total_storage_limit_bytes is null or e.total_storage_limit_bytes<=0 or p_storage_bytes>e.storage_file_max_bytes
 or u.used_bytes+p_storage_bytes>e.total_storage_limit_bytes or (e.total_storage_file_limit>0 and u.billable_file_count+p_storage_files>e.total_storage_file_limit) then raise exception 'voice_storage_limit'; end if;
 if p_input?'asset_id' then
  perform 1 from public.studio_assets where id=(p_input->>'asset_id')::uuid and project_id=g.project_id and organization_id=g.organization_id and status='ready' for update;
  if not found then raise exception 'voice_asset_state'; end if;
 end if;
 if p_input?'preview_id' then
  perform 1 from public.studio_resources sr join public.voice_generations parent on parent.id=sr.operation_id
  where sr.id=(p_input->>'preview_id')::uuid and sr.project_id=g.project_id and sr.organization_id=g.organization_id
  and sr.kind='voice_preview' and sr.status='ready' and parent.status='completed' for update of sr;
  if not found then raise exception 'voice_resource_state'; end if;
 end if;
 insert into public.studio_operations(id,operation,model_id,provider,feature_code,input,reserved_units,storage_reserved_bytes,storage_reserved_files)
 values(g.id,p_operation,p_model,c.provider,c.feature_code,p_input,p_units,p_storage_bytes,p_storage_files);
 update public.voice_generations set operation='studio' where id=g.id returning * into g;
 perform public.record_organization_storage_usage(g.billing_organization_id,p_storage_bytes,p_storage_files,'generated_media',jsonb_build_object('studio_operation_id',g.id,'reserved',true));
 return to_jsonb(g)||'{"claimed":true}'::jsonb;
end $$;

-- Legacy recovery must never settle a Studio receipt as ElevenLabs character TTS.
alter function public.finish_voice_generation(uuid,text,text) rename to finish_voice_generation_before_studio;
revoke all on function public.finish_voice_generation_before_studio(uuid,text,text) from service_role,public,anon,authenticated;
create function public.finish_voice_generation(p_id uuid,p_status text,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.voice_generations where id=p_id and operation='studio') then raise exception 'voice_studio_receipt'; end if;
 return public.finish_voice_generation_before_studio(p_id,p_status,p_error);
end $$;

create function public.finish_studio_operation(p_id uuid,p_status text,p_charge numeric default null,p_cost numeric default null,p_units jsonb default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.voice_generations; s public.studio_operations; w public.credit_wallets; charge numeric; cost numeric; event_id uuid; keep_bytes integer:=0; keep_files integer:=0; it bigint:=0; ot bigint:=0;
begin
 select * into r from public.voice_generations where id=p_id and operation='studio';
 if r.id is null then raise exception 'voice_not_found'; end if;
 select * into w from public.credit_wallets where organization_id=r.billing_organization_id for update;
 select * into r from public.voice_generations where id=p_id for update;
 select * into s from public.studio_operations where id=p_id for update;
 if r.status in ('completed','failed') then return to_jsonb(r); end if;
 if p_status='uncertain' then update public.voice_generations set status='uncertain',error_code=p_error,updated_at=now() where id=p_id returning * into r;return to_jsonb(r);end if;
 if p_status not in ('completed','failed') or p_status is null then raise exception 'voice_finish_invalid'; end if;
 charge:=case when p_status='completed' then p_charge else 0 end;
 cost:=case when p_status='completed' then p_cost else 0 end;
 if charge is null or cost is null or charge<0 or cost<0 or charge::text in ('NaN','Infinity','-Infinity') or cost::text in ('NaN','Infinity','-Infinity')
 or charge>r.reserved_credits or charge>w.balance_credits-(w.reserved_credits-r.reserved_credits) then raise exception 'voice_settlement_pending'; end if;
 if p_status='completed' then
  if r.object_path is null or r.bytes_size is null or s.result_mime is null or s.result_file_count is null or s.result_file_count<1
  or r.bytes_size>s.storage_reserved_bytes or s.result_file_count>s.storage_reserved_files or p_units is null then raise exception 'voice_result_missing'; end if;
  keep_bytes:=r.bytes_size;keep_files:=s.result_file_count;
  if s.operation='gemini_tts' then
   if jsonb_typeof(p_units->'inputTokens')<>'number' or jsonb_typeof(p_units->'outputTokens')<>'number' or not(p_units?'inputTokens' and p_units?'outputTokens') then raise exception 'voice_usage_missing'; end if;
   it:=(p_units->>'inputTokens')::bigint;ot:=(p_units->>'outputTokens')::bigint;
   if it<0 or ot<=0 then raise exception 'voice_usage_missing'; end if;
  end if;
 end if;
 perform public.release_organization_storage_usage(r.billing_organization_id,s.storage_reserved_bytes-keep_bytes,s.storage_reserved_files-keep_files,'generated_media',jsonb_build_object('studio_operation_id',r.id));
 insert into public.usage_events(organization_id,provider,feature_code,model_id,status,input_units,output_units,input_tokens,output_tokens,total_tokens,provider_cost,connecty_charge_credits,request_id,billing_mode,metadata,error_message,connecty_revenue_estimate,gross_margin_estimate)
 values(r.billing_organization_id,s.provider,s.feature_code,r.model_id,p_status::public.usage_event_status,coalesce((p_units->>'characters')::numeric,(p_units->>'minutes')::numeric,(p_units->>'requests')::numeric,it),ot,it,ot,it+ot,cost,charge,'studio:'||r.id,'customer_billable',
 jsonb_build_object('source','voice_studio','organization_id',r.organization_id,'project_id',r.project_id,'operation',s.operation,'units',p_units,'rate_snapshot',r.rate_snapshot,'provider_cost_basis','confirmed_tariff_estimate'),p_error,round(charge*.01,8),round(charge*.01-cost,8)) returning id into event_id;
 update public.credit_wallets set reserved_credits=reserved_credits-r.reserved_credits,balance_credits=balance_credits-charge,lifetime_used_credits=lifetime_used_credits+charge,updated_at=now() where id=w.id;
 if charge>0 then
  insert into public.credit_transactions(organization_id,wallet_id,transaction_type,amount_credits,balance_after_credits,provider,usage_event_id,description,metadata)
  values(r.billing_organization_id,w.id,'debit',-charge,w.balance_credits-charge,s.provider,event_id,'ConnectyHub Estúdio',jsonb_build_object('request_id',r.id,'project_id',r.project_id,'operation',s.operation));
  update public.billing_cycles set used_credits=used_credits+charge,updated_at=now() where id=(select id from public.billing_cycles where organization_id=r.billing_organization_id and status='open' and cycle_start<=r.created_at and cycle_end>r.created_at order by cycle_end limit 1);
 end if;
 update public.studio_operations set actual_units=p_units where id=p_id;
 update public.voice_generations set status=p_status,reserved_credits=0,charged_credits=charge,usage_event_id=event_id,error_code=p_error,updated_at=now() where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.reserve_studio_operation(uuid,uuid,text,text,text,text,text,integer,numeric,numeric,jsonb,jsonb,jsonb,integer,integer),public.finish_voice_generation(uuid,text,text),public.finish_studio_operation(uuid,text,numeric,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_studio_operation(uuid,uuid,text,text,text,text,text,integer,numeric,numeric,jsonb,jsonb,jsonb,integer,integer),public.finish_voice_generation(uuid,text,text),public.finish_studio_operation(uuid,text,numeric,numeric,jsonb,text) to service_role;

alter function public.consume_studio_asset_ticket(uuid,text,text) rename to consume_studio_asset_ticket_before_operations;
revoke all on function public.consume_studio_asset_ticket_before_operations(uuid,text,text) from service_role,public,anon,authenticated;
create function public.consume_studio_asset_ticket(p_id uuid,p_hash text,p_purpose text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.studio_assets where id=p_id for update;
 if p_purpose='delete' and exists(select 1 from public.studio_operations s join public.voice_generations g on g.id=s.id where s.input->>'asset_id'=p_id::text and g.status in ('reserved','processing','uncertain')) then raise exception 'voice_asset_in_use'; end if;
 return public.consume_studio_asset_ticket_before_operations(p_id,p_hash,p_purpose);
end $$;
revoke all on function public.consume_studio_asset_ticket(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_studio_asset_ticket(uuid,text,text) to service_role;
create function public.fail_reserved_studio_operation(p_id uuid,p_error text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.voice_generations;
begin
 select * into r from public.voice_generations where id=p_id and operation='studio';
 if r.id is null then raise exception 'voice_not_found'; end if;
 perform 1 from public.credit_wallets where organization_id=r.billing_organization_id for update;
 select * into r from public.voice_generations where id=p_id for update;
 if r.status<>'reserved' then return to_jsonb(r);end if;
 return public.finish_studio_operation(p_id,'failed',null,null,null,p_error);
end $$;
revoke all on function public.fail_reserved_studio_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.fail_reserved_studio_operation(uuid,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('connectyhub-studio','connectyhub-studio',false,20000000,array['audio/mpeg','audio/wav','application/json','text/plain']) on conflict(id) do nothing;

-- Availability starts disabled; this does not insert or change commercial rates.
insert into public.studio_capabilities(operation,model_id,provider,feature_code) values
('transcription','scribe_v2','elevenlabs','studio_transcription'),
('audio_isolation','audio-isolation-v1','elevenlabs','studio_audio_isolation'),
('voice_change','eleven_multilingual_sts_v2','elevenlabs','studio_voice_change'),
('forced_alignment','forced-alignment-v1','elevenlabs','studio_forced_alignment'),
('dialogue','eleven_v3','elevenlabs','studio_dialogue'),
('voice_design','voice-design-default','elevenlabs','studio_voice_design'),
('voice_design_save','voice-design-save','elevenlabs','studio_voice_design_save'),
('dictionary_create','pronunciation-dictionary','elevenlabs','studio_dictionary'),
('dubbing','dubbing-v1','elevenlabs','studio_dubbing'),
('gemini_tts','gemini-3.1-flash-tts-preview','gemini','voice_generation_audio'),
('gemini_tts','gemini-2.5-flash-preview-tts','gemini','voice_generation_audio'),
('gemini_tts','gemini-2.5-pro-preview-tts','gemini','voice_generation_audio');
-- Only the relay may call this after checking that no local file/manifest exists.
-- Recheck age and state atomically; a concurrent completed upload stays intact.
create function public.fail_stale_studio_asset(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assets;
begin
 select * into a from public.studio_assets where id=p_id;
 if a.id is null then raise exception 'voice_asset_not_found'; end if;
 perform 1 from public.organization_storage_usage where organization_id=a.billing_organization_id for update;
 select * into a from public.studio_assets where id=p_id for update;
 if a.status='processing' and a.updated_at<now()-interval '10 minutes' then return public.finish_studio_asset(a.id,'failed'); end if;
 return to_jsonb(a);
end $$;
revoke all on function public.fail_stale_studio_asset(uuid) from public,anon,authenticated;
grant execute on function public.fail_stale_studio_asset(uuid) to service_role;

-- Result removal is recoverable and never changes the credit receipt. The
-- shared wallet lock serializes preview removal against a new save operation.
create function public.prepare_studio_result_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g public.voice_generations; s public.studio_operations; paths jsonb;
begin
 select * into g from public.voice_generations where id=p_id and operation='studio';
 if g.id is null then raise exception 'voice_not_found'; end if;
 perform 1 from public.credit_wallets where organization_id=g.billing_organization_id for update;
 select * into g from public.voice_generations where id=p_id for update;
 select * into s from public.studio_operations where id=p_id for update;
 if g.status<>'completed' then raise exception 'voice_result_pending'; end if;
 if s.result_state='deleted' then return jsonb_build_object('state','deleted','paths','[]'::jsonb); end if;
 if exists(select 1 from public.studio_operations pending join public.voice_generations pg on pg.id=pending.id
  join public.studio_resources sr on sr.id::text=pending.input->>'preview_id'
  where sr.operation_id=p_id and pg.status in ('reserved','processing','uncertain')) then raise exception 'voice_result_in_use'; end if;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into paths from (
  select g.object_path as path where g.object_path is not null
  union select sr.object_path from public.studio_resources sr where sr.operation_id=p_id and sr.object_path is not null
 ) files;
 update public.studio_operations set result_state='deleting' where id=p_id;
 update public.studio_resources set status='deleting' where operation_id=p_id and kind='voice_preview';
 return jsonb_build_object('state','deleting','paths',paths);
end $$;
create function public.finish_studio_result_delete(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare g public.voice_generations; s public.studio_operations;
begin
 select * into g from public.voice_generations where id=p_id and operation='studio';
 if g.id is null then raise exception 'voice_not_found'; end if;
 perform 1 from public.credit_wallets where organization_id=g.billing_organization_id for update;
 select * into g from public.voice_generations where id=p_id for update;
 select * into s from public.studio_operations where id=p_id for update;
 if s.result_state='deleted' then return; end if;
 if g.status<>'completed' or s.result_state<>'deleting' then raise exception 'voice_result_state'; end if;
 perform public.release_organization_storage_usage(g.billing_organization_id,g.bytes_size,s.result_file_count,'generated_media',jsonb_build_object('studio_operation_id',g.id,'deleted',true));
 update public.studio_operations set result_state='deleted' where id=p_id;
 update public.voice_generations set object_path=null where id=p_id;
 update public.studio_resources set status='deleted',object_path=null where operation_id=p_id and kind='voice_preview';
end $$;
revoke all on function public.prepare_studio_result_delete(uuid),public.finish_studio_result_delete(uuid) from public,anon,authenticated;
grant execute on function public.prepare_studio_result_delete(uuid),public.finish_studio_result_delete(uuid) to service_role;
