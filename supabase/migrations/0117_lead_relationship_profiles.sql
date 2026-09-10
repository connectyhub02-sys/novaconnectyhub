create table public.automation_lead_profiles (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete cascade,
 evidence jsonb not null default '{}',
 preferences jsonb not null default '{}',
 next_review_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(organization_id,lead_id)
);
alter table public.automation_lead_profiles enable row level security;
revoke all on public.automation_lead_profiles from anon,authenticated;
grant all on public.automation_lead_profiles to service_role;
create function public.automation_profile_candidates(p_limit integer default 20)
returns table(organization_id uuid,lead_id uuid) language sql security definer set search_path=public as $$
 select l.organization_id,l.id from public.leads l
 join public.automation_policies policy on policy.organization_id=l.organization_id and policy.follow_up_enabled
 left join public.automation_lead_profiles profile on profile.organization_id=l.organization_id and profile.lead_id=l.id
 where l.status<>'archived' and coalesce(profile.preferences->>'paused','false')<>'true' and l.last_message_at>now()-interval '180 days' and (profile.next_review_at is null or profile.next_review_at<=now())
 order by profile.next_review_at nulls first,l.last_message_at desc limit least(greatest(p_limit,1),50)
$$;
revoke all on function public.automation_profile_candidates(integer) from public,anon,authenticated;
grant execute on function public.automation_profile_candidates(integer) to service_role;

create function public.record_customer_visit(p_org uuid,p_lead uuid,p_description text,p_kind text,p_occurred timestamptz,p_return timestamptz,p_key text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare visit public.customer_lead_visits;
begin
 if not exists(select 1 from public.leads where id=p_lead and organization_id=p_org) then raise exception 'LEAD_SCOPE';end if;
 if p_description is null or length(trim(p_description)) not between 1 and 300 or p_kind is null or p_kind not in ('visit','purchase','service') or p_occurred is null or p_occurred>now() or (p_return is not null and p_return<=p_occurred) or p_key is null or length(p_key) not between 1 and 180 then raise exception 'INVALID_VISIT';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_lead::text,117));
 select * into visit from public.customer_lead_visits where organization_id=p_org and request_key=p_key;
 if visit.id is not null then
   if visit.lead_id<>p_lead or visit.description<>trim(p_description) or visit.occurred_at<>p_occurred or visit.kind<>p_kind or visit.return_at is distinct from p_return then raise exception 'REQUEST_KEY_CONFLICT';end if;
   return to_jsonb(visit);
 end if;
 update public.customer_lead_visits set return_status='cancelled' where organization_id=p_org and lead_id=p_lead and lower(description)=lower(trim(p_description)) and occurred_at<=p_occurred and return_status in ('pending','scheduled');
 insert into public.customer_lead_visits(organization_id,lead_id,description,kind,occurred_at,return_at,request_key,created_by,return_status)
 values(p_org,p_lead,trim(p_description),p_kind,p_occurred,p_return,p_key,p_actor,case when exists(select 1 from public.customer_lead_visits where organization_id=p_org and lead_id=p_lead and lower(description)=lower(trim(p_description)) and occurred_at>p_occurred) then 'cancelled' else 'pending' end) returning * into visit;
 insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
 values('organization',p_org,'lead',p_lead,'lead.visit.recorded','Visita ou compra registrada',trim(p_description),'organization',array['lead','return'],jsonb_build_object('lead_id',p_lead,'visit_id',visit.id,'occurred_at',p_occurred,'return_at',p_return,'kind',p_kind));
 return to_jsonb(visit);
end $$;
revoke all on function public.record_customer_visit(uuid,uuid,text,text,timestamptz,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.record_customer_visit(uuid,uuid,text,text,timestamptz,timestamptz,text,uuid) to service_role;
