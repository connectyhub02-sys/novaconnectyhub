-- Stable caller keys protect a multi-part delivery across retries and workers.
create table public.whatsapp_outbound_operations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 whatsapp_instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
 lead_id uuid references public.leads(id) on delete cascade,
 operation_key text not null, request_hash text not null,
 status text not null default 'preparing' check(status in ('preparing','sending','sent','failed','uncertain')),
 claim_token uuid not null, delivery_ids uuid[] not null default '{}',
 response jsonb, response_status integer,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(whatsapp_instance_id,operation_key)
);
alter table public.whatsapp_outbound_operations enable row level security;
revoke all on public.whatsapp_outbound_operations from public,anon,authenticated;
grant all on public.whatsapp_outbound_operations to service_role;

create function public.claim_whatsapp_outbound_operation(p_instance uuid,p_key text,p_hash text,p_claim uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare org uuid; op public.whatsapp_outbound_operations;
begin
 select organization_id into org from public.whatsapp_instances where id=p_instance;
 if org is null then raise exception 'OUTBOUND_INSTANCE_REQUIRED'; end if;
 if p_key is null or length(p_key)<>64 or p_hash is null or length(p_hash)<>64 or p_claim is null then raise exception 'INVALID_OUTBOUND_OPERATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_instance::text||p_key,138));
 select * into op from public.whatsapp_outbound_operations where whatsapp_instance_id=p_instance and operation_key=p_key for update;
 if op.id is null then
   insert into public.whatsapp_outbound_operations(organization_id,whatsapp_instance_id,operation_key,request_hash,claim_token)
     values(org,p_instance,p_key,p_hash,p_claim) returning * into op;
   return to_jsonb(op)||'{"claimed":true}'::jsonb;
 end if;
 if op.request_hash<>p_hash then raise exception 'OUTBOUND_KEY_CONFLICT'; end if;
 -- A crash after an HTTP request is uncertain. Never automatically resend it.
 if op.status in ('preparing','sending') and op.updated_at<now()-interval '5 minutes' then
   update public.whatsapp_outbound_operations set status='uncertain',updated_at=now() where id=op.id returning * into op;
 end if;
 if op.status='failed' then
   update public.whatsapp_outbound_operations set status='preparing',claim_token=p_claim,updated_at=now() where id=op.id returning * into op;
   return to_jsonb(op)||'{"claimed":true}'::jsonb;
 end if;
 return to_jsonb(op)||'{"claimed":false}'::jsonb;
end $$;
revoke all on function public.claim_whatsapp_outbound_operation(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_outbound_operation(uuid,text,text,uuid) to service_role;
