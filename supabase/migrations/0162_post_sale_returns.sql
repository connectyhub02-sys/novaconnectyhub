-- Returns scheduled by the owner, by a product rule or by the agent, plus post-sale and birthday
-- follow-ups. Additive: existing visits, dispatches and policies keep their values.

alter table public.customer_lead_visits
  add column if not exists return_note text check (return_note is null or length(return_note) between 1 and 300),
  add column if not exists repeat_every_days integer check (repeat_every_days is null or repeat_every_days between 1 and 365),
  add column if not exists repeat_remaining integer not null default 0 check (repeat_remaining between 0 and 6),
  add column if not exists source text not null default 'manual' check (source in ('manual','product_rule','agent')),
  add column if not exists catalog_item_id uuid;

alter table public.automation_dispatches drop constraint if exists automation_dispatches_journey_check;
alter table public.automation_dispatches add constraint automation_dispatches_journey_check
  check (journey in ('conversation','recovery','return','recommendation','post_sale','birthday'));

-- Returns follow their own switch, independent of the smart follow-up. On by default.
alter table public.automation_policies add column if not exists returns_enabled boolean not null default true;

-- Same contract as record_customer_visit (0117), with the note, repetition, origin and product.
-- A newer visit with the same description still cancels the pending return (the customer came back).
create or replace function public.record_customer_visit_v2(p_org uuid,p_lead uuid,p_description text,p_kind text,p_occurred timestamptz,
  p_return timestamptz,p_key text,p_actor uuid,p_note text,p_repeat_days integer,p_repeat_remaining integer,p_source text,p_order uuid,p_item uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare visit public.customer_lead_visits;
begin
 if not exists(select 1 from public.leads where id=p_lead and organization_id=p_org) then raise exception 'LEAD_SCOPE';end if;
 if p_description is null or length(trim(p_description)) not between 1 and 300 or p_kind is null or p_kind not in ('visit','purchase','service')
   or p_occurred is null or p_occurred>now() or (p_return is not null and p_return<=p_occurred) or p_key is null or length(p_key) not between 1 and 180
   or (p_note is not null and length(trim(p_note)) not between 1 and 300) or coalesce(p_source,'manual') not in ('manual','product_rule','agent')
   or (p_repeat_days is not null and p_repeat_days not between 1 and 365) or coalesce(p_repeat_remaining,0) not between 0 and 6
   or (coalesce(p_repeat_remaining,0)>0 and (p_repeat_days is null or p_return is null)) then raise exception 'INVALID_VISIT';end if;
 if p_order is not null and not exists(select 1 from public.sales_catalog_orders where id=p_order and organization_id=p_org and lead_id=p_lead) then raise exception 'LEAD_SCOPE';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_lead::text,117));
 select * into visit from public.customer_lead_visits where organization_id=p_org and request_key=p_key;
 if visit.id is not null then
   if visit.lead_id<>p_lead or visit.description<>trim(p_description) or visit.occurred_at<>p_occurred or visit.kind<>p_kind or visit.return_at is distinct from p_return then raise exception 'REQUEST_KEY_CONFLICT';end if;
   return to_jsonb(visit);
 end if;
 update public.customer_lead_visits set return_status='cancelled' where organization_id=p_org and lead_id=p_lead and lower(description)=lower(trim(p_description)) and occurred_at<=p_occurred and return_status in ('pending','scheduled');
 insert into public.customer_lead_visits(organization_id,lead_id,description,kind,occurred_at,return_at,request_key,created_by,return_status,
   return_note,repeat_every_days,repeat_remaining,source,order_id,catalog_item_id)
 values(p_org,p_lead,trim(p_description),p_kind,p_occurred,p_return,p_key,p_actor,case when exists(select 1 from public.customer_lead_visits where organization_id=p_org and lead_id=p_lead and lower(description)=lower(trim(p_description)) and occurred_at>p_occurred) then 'cancelled' else 'pending' end,
   nullif(trim(p_note),''),p_repeat_days,coalesce(p_repeat_remaining,0),coalesce(p_source,'manual'),p_order,p_item) returning * into visit;
 insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
 values('organization',p_org,'lead',p_lead,'lead.visit.recorded','Visita ou compra registrada',trim(p_description),'organization',array['lead','return'],
   jsonb_build_object('lead_id',p_lead,'visit_id',visit.id,'occurred_at',p_occurred,'return_at',p_return,'kind',p_kind,'source',coalesce(p_source,'manual')));
 return to_jsonb(visit);
end $$;
revoke all on function public.record_customer_visit_v2(uuid,uuid,text,text,timestamptz,timestamptz,text,uuid,text,integer,integer,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_customer_visit_v2(uuid,uuid,text,text,timestamptz,timestamptz,text,uuid,text,integer,integer,text,uuid,uuid) to service_role;

notify pgrst, 'reload schema';
