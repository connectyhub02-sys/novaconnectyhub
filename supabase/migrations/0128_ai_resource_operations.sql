-- Resource operations share the same request ledger and wallet as text calls.
alter table public.ai_requests add column execution_kind text not null default 'generation';
alter table public.ai_resources drop constraint ai_resources_kind_check;
alter table public.ai_resources add constraint ai_resources_kind_check check(kind in
  ('file','cache','batch','operation','store','document','interaction','live','agent','environment','webhook','trigger'));
alter table public.ai_resources add column worker_lease_until timestamptz;
create unique index ai_resource_request on public.ai_resources(request_id) where request_id is not null;
create index ai_resource_reconcile on public.ai_resources(status,updated_at) where request_id is not null;

create table public.ai_operation_rates (
 id uuid primary key default gen_random_uuid(),model_id text not null,meter text not null,plan_code text,
 provider_cost numeric(24,12) not null check(provider_cost>=0),credit_price numeric(24,12) not null check(credit_price>0),
 effective_from timestamptz not null default now(),effective_to timestamptz,active boolean not null default true,
 metadata jsonb not null default '{}'
);
alter table public.ai_operation_rates enable row level security;
revoke all on public.ai_operation_rates from public,anon,authenticated;
grant all on public.ai_operation_rates to service_role;

-- Top up only from unreserved funds. On insufficient funds, retain the complete
-- settlement snapshot for retry; never drop unbilled usage or return the output.
create function public.settle_ai_operation(p_request uuid,p_status text,p_usage jsonb default '{}',p_response jsonb default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.ai_requests; w public.credit_wallets; extra numeric; result jsonb; feature text;
begin
 select * into r from public.ai_requests where id=p_request;
 select * into w from public.credit_wallets where organization_id=r.organization_id for update;
 select * into r from public.ai_requests where id=p_request for update;
 if r.id is null then raise exception 'ai_request_missing'; end if;
 if r.status in ('completed','failed') then return to_jsonb(r); end if;
 if p_status<>'completed' or r.status not in ('processing','uncertain') then raise exception 'ai_finish_state'; end if;
 if w.id is null or (p_usage->>'charge') is null or (p_usage->>'charge')::numeric<0 or (p_usage->>'charge')::numeric::text in ('NaN','Infinity','-Infinity') or coalesce((p_usage->>'cost')::numeric,0)<0 then raise exception 'ai_usage_invalid';end if;
 extra:=greatest(0,(p_usage->>'charge')::numeric-r.reserved_credits);
 if w.balance_credits-greatest(0,w.reserved_credits-r.reserved_credits)<(p_usage->>'charge')::numeric then raise exception 'ai_insufficient_credits'; end if;
 if extra>0 then
  update public.credit_wallets set reserved_credits=reserved_credits+extra where id=w.id;
  update public.ai_requests set reserved_credits=reserved_credits+extra where id=r.id;
 end if;
 result:=public.finish_ai_request(p_request,p_status,p_usage,p_response,p_error);
 feature:=coalesce(p_usage->>'featureCode','external_ai');
 if feature !~ '^external_ai(_[a-z_]+)?$' then raise exception 'ai_feature_invalid'; end if;
 update public.usage_events set feature_code=feature where id=(result->>'usage_event_id')::uuid;
 return result;
end $$;
revoke all on function public.settle_ai_operation(uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.settle_ai_operation(uuid,text,jsonb,jsonb,text) to service_role;

create function public.claim_ai_resource_worker(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.ai_resources set worker_lease_until=now()+interval '3 minutes'
 where id=p_id and status in ('processing','active','cancelling','settling','uncertain')
 and (worker_lease_until is null or worker_lease_until<now());
 return found;
end $$;
revoke all on function public.claim_ai_resource_worker(uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_resource_worker(uuid) to service_role;

insert into public.provider_features(cost_center_id,feature_code,name,description,unit,enabled,billable)
select c.id,'external_ai_'||r.code,r.name,'Consumo da API por projeto e carteira.','request',true,true
from public.provider_cost_centers c cross join (values
 ('media','Geração de mídia'),('video','Geração de vídeo'),('music','Geração de música'),
 ('batch','Processamento em lote'),('cache','Armazenamento de contexto'),('indexing','Indexação de arquivos'),
 ('interaction','Interações e pesquisa'),('live','Sessão em tempo real'),('generation','Geração de conteúdo'),
 ('agent','Agentes especializados'),('environment','Ambiente de execução')
) r(code,name) where c.provider='gemini' on conflict(cost_center_id,feature_code) do nothing;

-- Register routing identities; preserve existing operational suspensions.
insert into public.provider_models(cost_center_id,provider_model_id,display_name,feature_code,supports_billing,enabled,input_unit,output_unit,metadata)
select c.id,m.provider_model_id,m.name,'external_ai',true,true,'input_token','output_token',jsonb_build_object('external_ai_available',true)
from public.ai_public_models m cross join public.provider_cost_centers c where c.provider='gemini'
on conflict(cost_center_id,provider_model_id) do nothing;

-- Prices are in USD before conversion: FX 6, 4x cost, BRL .01 per credit.
-- Free provider allowances are not assumed when reserving customer consumption.
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,metadata)
select model,meter,usd*6,usd*2400,'{"source":"https://ai.google.dev/gemini-api/docs/pricing","verified_at":"2026-09-10","fx":6,"markup":4}'::jsonb
from (values
 ('*','search',.014::numeric),('*','maps',.014),('*','indexing_input',.15/1000000),
 ('flash-3.1-tts-preview','input',1.0/1000000),('flash-3.1-tts-preview','audio_output',20.0/1000000),
 ('flash-2.5-preview-tts','input',.5/1000000),('flash-2.5-preview-tts','audio_output',10.0/1000000),
 ('pro-2.5-preview-tts','input',1.0/1000000),('pro-2.5-preview-tts','audio_output',20.0/1000000),
 ('flash-3.1-image','input',.5/1000000),('flash-3.1-image','output',3.0/1000000),('flash-3.1-image','image_output',60.0/1000000),
 ('flash-3.1-image-preview','input',.5/1000000),('flash-3.1-image-preview','output',3.0/1000000),('flash-3.1-image-preview','image_output',60.0/1000000),
 ('flash-lite-3.1-image','input',.25/1000000),('flash-lite-3.1-image','output',1.5/1000000),('flash-lite-3.1-image','image_output',30.0/1000000),
 ('pro-3-image','input',2.0/1000000),('pro-3-image','output',12.0/1000000),('pro-3-image','image_output',120.0/1000000),
 ('pro-3-image-preview','input',2.0/1000000),('pro-3-image-preview','output',12.0/1000000),('pro-3-image-preview','image_output',120.0/1000000),
 ('image-pro-preview','input',2.0/1000000),('image-pro-preview','output',12.0/1000000),('image-pro-preview','image_output',120.0/1000000),
 ('flash-2.5-image','input',.3/1000000),('flash-2.5-image','output',2.5/1000000),('flash-2.5-image','image_output',30.0/1000000),
 ('music-3-clip-preview','song',.04),('music-3-pro-preview','song',.08),('music-3.5','song',.08),
 ('video-3.1-generate-preview','video_720p',.4),('video-3.1-generate-preview','video_1080p',.4),('video-3.1-generate-preview','video_4k',.6),
 ('video-3.1-fast-generate-preview','video_720p',.1),('video-3.1-fast-generate-preview','video_1080p',.12),('video-3.1-fast-generate-preview','video_4k',.3),
 ('video-3.1-lite-generate-preview','video_720p',.05),('video-3.1-lite-generate-preview','video_1080p',.08),
 ('omni-1.1-flash','input',1.5/1000000),('omni-1.1-flash','output',9.0/1000000),('omni-1.1-flash','video_output',17.5/1000000),
 ('omni-flash-preview','input',1.5/1000000),('omni-flash-preview','output',9.0/1000000),('omni-flash-preview','video_output',17.5/1000000),
 ('3.5-transcribe','audio_input',2.0/1000000),('3.5-transcribe','output',12.0/1000000),
 ('3.5-transcribe-live','audio_input',3.5/1000000),('3.5-transcribe-live','output',21.0/1000000),
 ('3.5-live-translate-preview','audio_input',3.5/1000000),('3.5-live-translate-preview','audio_output',21.0/1000000)
) p(model,meter,usd);

insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,metadata)
select model,meter,usd*6/1000000,usd*2400/1000000,'{"verified_at":"2026-09-10","source":"https://ai.google.dev/gemini-api/docs/pricing"}'::jsonb
from (values
 ('embedding-2','image_input',.45::numeric),('embedding-2','document_input',.45),('embedding-2','audio_input',6.5),('embedding-2','video_input',12),
 ('embedding-2-preview','image_input',.45),('embedding-2-preview','document_input',.45),('embedding-2-preview','audio_input',6.5),('embedding-2-preview','video_input',12)
) p(model,meter,usd);

-- Batch inference uses its own tariff. Tool queries keep their normal price.
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,effective_from,effective_to,metadata)
select p.id,'batch_'||case r.unit when 'input_token' then 'input' else 'output' end,
 r.provider_cost_per_unit/2,r.connecty_price_per_unit/2,r.effective_from,r.effective_to,jsonb_build_object('source_rate',r.id)
from public.billing_rates r join public.provider_features f on f.id=r.feature_id and f.feature_code='external_ai'
join public.provider_models m on m.id=r.model_id join public.ai_public_models p on p.provider_model_id=m.provider_model_id
where r.active and r.plan_code is null and r.unit in ('input_token','output_token');
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,metadata)
select model_id,'batch_'||meter,provider_cost/2,credit_price/2,metadata from public.ai_operation_rates
where meter in ('input','output','audio_output','image_output','image_input','document_input','audio_input','video_input');

-- Cache reading is priced independently from full input; storage is per unit-hour.
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,effective_from,effective_to,metadata)
select p.id,'cached_input',r.provider_cost_per_unit/10,r.connecty_price_per_unit/10,r.effective_from,r.effective_to,jsonb_build_object('source_rate',r.id)
from public.billing_rates r join public.provider_features f on f.id=r.feature_id and f.feature_code='external_ai'
join public.provider_models m on m.id=r.model_id join public.ai_public_models p on p.provider_model_id=m.provider_model_id
where r.active and r.plan_code is null and r.unit='input_token' and p.capabilities ? 'cache';
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,metadata)
select id,'cache_hour',case when id like 'pro-%' then 4.5 else 1 end*6/1000000,
 case when id like 'pro-%' then 4.5 else 1 end*2400/1000000,'{"verified_at":"2026-09-10","unit":"context_unit_hour"}'::jsonb
from public.ai_public_models where capabilities ? 'cache';
update public.ai_operation_rates set provider_cost=.5*6/1000000,credit_price=.5*2400/1000000,effective_to='2027-01-01T00:00:00Z'
where meter='cache_hour' and model_id in ('flash-3.6','flash-3.7','flash-3.8');
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,effective_from)
select id,'cache_hour',6.0/1000000,2400.0/1000000,'2027-01-01T00:00:00Z' from public.ai_public_models where id in ('flash-3.6','flash-3.7','flash-3.8');

-- Publication still requires a positive price for each required dimension.
-- Keep operational suspensions. Application availability additionally requires tariffs.
update public.ai_public_models set enabled=true where family in ('image','voice','music','video','live','transcription');

create function public.extend_ai_reservation(p_request uuid,p_amount numeric) returns void
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests;w public.credit_wallets;extra numeric;
begin
 select * into r from public.ai_requests where id=p_request;
 select * into w from public.credit_wallets where organization_id=r.organization_id for update;
 select * into r from public.ai_requests where id=p_request for update;
 if r.status not in ('reserved','processing','uncertain') or p_amount is null or p_amount<0 or w.status<>'active' then raise exception 'ai_request_state';end if;
 if not exists(select 1 from public.ai_api_keys k join public.ai_projects p on p.id=k.project_id where k.id=r.key_id and k.status='active' and p.status='active') then raise exception 'ai_key_inactive';end if;
 if not coalesce((public.resolve_organization_contract_access(r.organization_id)->>'allowed')::boolean,false) then raise exception 'ai_contract_inactive';end if;
 extra:=greatest(0,p_amount-r.reserved_credits);
 if w.balance_credits-w.reserved_credits<extra then raise exception 'ai_insufficient_credits';end if;
 update public.credit_wallets set reserved_credits=reserved_credits+extra,updated_at=now() where id=w.id;
 update public.ai_requests set reserved_credits=reserved_credits+extra,updated_at=now() where id=r.id;
end $$;
revoke all on function public.extend_ai_reservation(uuid,numeric) from public,anon,authenticated;
grant execute on function public.extend_ai_reservation(uuid,numeric) to service_role;

create function public.consume_ai_live_ticket(p_id uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.ai_resources;
begin
 select * into r from public.ai_resources where id=p_id for update;
 if r.kind<>'live' or r.status<>'preparing' or r.expires_at<now() or r.metadata->>'ticket_hash' is distinct from p_hash then raise exception 'ai_key_inactive';end if;
 perform public.start_ai_request(r.request_id);
 update public.ai_resources set status='processing',metadata=metadata-'ticket_hash',updated_at=now() where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.consume_ai_live_ticket(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_ai_live_ticket(uuid,text) to service_role;

create function public.expire_ai_live_ticket(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.ai_resources;
begin
 select * into r from public.ai_resources where id=p_id for update;
 if r.id is null or r.kind<>'live' or r.status<>'preparing' or r.expires_at>now() then return;end if;
 perform public.expire_unstarted_ai_request(r.request_id);
 update public.ai_resources set status='expired',metadata=metadata-'ticket_hash',updated_at=now() where id=r.id;
end $$;
revoke all on function public.expire_ai_live_ticket(uuid) from public,anon,authenticated;
grant execute on function public.expire_ai_live_ticket(uuid) to service_role;

-- Live audio prices use the reported modality, never the text rate for audio.
insert into public.ai_operation_rates(model_id,meter,provider_cost,credit_price,metadata)
select model,meter,usd*6/1000000,usd*2400/1000000,'{"verified_at":"2026-09-10","source":"https://ai.google.dev/gemini-api/docs/pricing"}'::jsonb
from (values
 ('flash-3.1-live-preview','input',.75::numeric),('flash-3.1-live-preview','output',4.5),
 ('flash-3.1-live-preview','audio_input',3),('flash-3.1-live-preview','audio_output',12),('flash-3.1-live-preview','video_input',1),('flash-3.1-live-preview','image_input',1),
 ('flash-2.5-native-audio-latest','input',.5),('flash-2.5-native-audio-latest','output',2),('flash-2.5-native-audio-latest','audio_input',3),('flash-2.5-native-audio-latest','video_input',3),('flash-2.5-native-audio-latest','audio_output',12),
 ('flash-2.5-native-audio-preview-09-2025','input',.5),('flash-2.5-native-audio-preview-09-2025','output',2),('flash-2.5-native-audio-preview-09-2025','audio_input',3),('flash-2.5-native-audio-preview-09-2025','video_input',3),('flash-2.5-native-audio-preview-09-2025','audio_output',12),
 ('flash-2.5-native-audio-preview-12-2025','input',.5),('flash-2.5-native-audio-preview-12-2025','output',2),('flash-2.5-native-audio-preview-12-2025','audio_input',3),('flash-2.5-native-audio-preview-12-2025','video_input',3),('flash-2.5-native-audio-preview-12-2025','audio_output',12)
) p(model,meter,usd);
