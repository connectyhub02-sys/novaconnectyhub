-- Service-only tables. All UI access is authorized against the active workspace.
create table public.meta_lead_forms (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 page_id text not null check (page_id ~ '^[0-9]+$'),
 form_id text not null check (form_id ~ '^[0-9]+$'),
 name text not null,
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (organization_id,form_id)
);
create table public.meta_lead_deliveries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 page_id text not null,
 form_id text not null,
 leadgen_id text not null check (leadgen_id ~ '^[0-9]+$'),
 lead_id uuid references public.leads(id) on delete set null,
 status text not null default 'pending' check (status in ('pending','imported','failed','ignored')),
 attempts integer not null default 0,
 error_message text,
 created_at timestamptz not null default now(),
 processed_at timestamptz,
 unique (organization_id,leadgen_id),
 foreign key (organization_id,form_id) references public.meta_lead_forms(organization_id,form_id) on delete cascade
);
alter table public.meta_lead_forms enable row level security;
alter table public.meta_lead_deliveries enable row level security;
revoke all on public.meta_lead_forms,public.meta_lead_deliveries from anon,authenticated;
grant all on public.meta_lead_forms,public.meta_lead_deliveries to service_role;
create index on public.meta_lead_deliveries(status,created_at) where status in ('pending','failed');

-- Lock a delivery and create its CRM lead in one transaction. Retries and
-- concurrent webhooks can never create duplicate leads. No conversation/send.
create function public.import_meta_lead_delivery(p_delivery_id uuid,p_organization_id uuid,p_data jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare d public.meta_lead_deliveries; new_lead uuid;
begin
 select * into d from public.meta_lead_deliveries where id=p_delivery_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Delivery not found'; end if;
 if d.status='imported' then return d.lead_id; end if;
 if not exists(select 1 from public.meta_lead_forms f where f.organization_id=d.organization_id and f.form_id=d.form_id and f.page_id=d.page_id and f.enabled) then
   raise exception 'Form not enabled';
 end if;
 insert into public.leads(organization_id,channel,display_name,source,status,last_event_summary,metadata)
 values(d.organization_id,'meta_lead_ads',coalesce(p_data->>'display_name','Lead Meta'),'meta_lead_ads','new','Formulário instantâneo Meta',
   p_data || jsonb_build_object('meta_leadgen_id',d.leadgen_id,'meta_form_id',d.form_id,'meta_page_id',d.page_id,'outreach_authorized',false))
 returning id into new_lead;
 update public.meta_lead_deliveries set lead_id=new_lead,status='imported',error_message=null,processed_at=now() where id=d.id;
 return new_lead;
end $$;
revoke all on function public.import_meta_lead_delivery(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_meta_lead_delivery(uuid,uuid,jsonb) to service_role;
