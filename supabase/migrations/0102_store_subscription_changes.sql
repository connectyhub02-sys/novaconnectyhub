create function public.prepare_store_agreement_replacement(p_agreement uuid,p_previous uuid,p_operation text) returns void language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; previous public.commercial_agreements; pending public.commercial_agreements;
begin
 perform 1 from public.commercial_agreements where id in (p_agreement,p_previous) order by id for update;
 select * into a from public.commercial_agreements where id=p_agreement;
 select * into previous from public.commercial_agreements where id=p_previous;
 if a.id is null or previous.id is null or a.id=previous.id or a.owner_type<>'store' or previous.owner_type<>'store'
  or a.organization_id<>previous.organization_id or a.lead_id is distinct from previous.lead_id or a.paid_cycles<>0
  or p_operation not in ('renewal','upgrade','reactivation') then raise exception 'COMMERCE_REPLACEMENT_INVALID'; end if;
 select * into pending from public.commercial_agreements where id=(previous.metadata->>'pending_replacement_id')::uuid;
 if pending.id is not null and pending.id<>a.id and pending.state='reserved' and pending.reservation_expires_at>now() then raise exception 'COMMERCE_REPLACEMENT_PENDING'; end if;
 update public.commercial_agreements set metadata=metadata||jsonb_build_object('replaces_agreement_id',previous.id,'replacement_operation',p_operation) where id=a.id;
 update public.commercial_agreements set metadata=metadata||jsonb_build_object('pending_replacement_id',a.id) where id=previous.id;
end $$;

create function public.store_agreement_change_pending(p_agreement uuid) returns boolean language sql stable set search_path=public as $$
 select exists(select 1 from public.commercial_agreements original join public.commercial_agreements replacement on replacement.id=(original.metadata->>'pending_replacement_id')::uuid
 where original.id=p_agreement and replacement.state='reserved' and replacement.reservation_expires_at>now());
$$;

create function public.finish_store_agreement_replacement() returns trigger language plpgsql security definer set search_path=public as $$
declare previous public.commercial_agreements; remaining interval;
begin
 if new.owner_type<>'store' or new.paid_cycles<>1 or old.period_end is not null or new.period_end is null or new.metadata->>'replaces_agreement_id' is null then return new; end if;
 select * into previous from public.commercial_agreements where id=(new.metadata->>'replaces_agreement_id')::uuid and organization_id=new.organization_id and lead_id=new.lead_id for update;
 if previous.id is null then raise exception 'COMMERCE_REPLACEMENT_INVALID'; end if;
 remaining:=greatest(interval '0',coalesce(previous.period_end,now())-new.period_start);
 -- Carry forward paid time instead of silently discarding it on a plan change.
 if remaining>interval '0' then update public.commercial_agreements set period_end=period_end+remaining where id=new.id; end if;
 perform public.cancel_store_commercial_agreement(previous.id,previous.organization_id);
 insert into public.commercial_events(organization_id,lead_id,agreement_id,campaign_id,event_key,event_type,payload)
 values(new.organization_id,new.lead_id,new.id,new.campaign_id,'agreement-changed:'||new.id,'subscription_changed',jsonb_build_object('previous_agreement_id',previous.id,'operation',new.metadata->>'replacement_operation','preserved_seconds',extract(epoch from remaining),'notice','Nova condição confirmada. O tempo restante pago foi preservado e as cobranças futuras do contrato anterior foram interrompidas.')) on conflict(event_key) do nothing;
 return new;
end $$;
create trigger finish_store_agreement_replacement after update of period_end on public.commercial_agreements for each row execute function public.finish_store_agreement_replacement();

do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('prepare_store_agreement_replacement','store_agreement_change_pending','finish_store_agreement_replacement') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
