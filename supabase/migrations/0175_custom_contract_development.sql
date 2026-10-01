-- Project scope is part of the negotiated version, not a record of work done.
create function public.valid_contract_development_scope(p_scope jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare k text; v jsonb; item jsonb; labels text[]:='{}'; label text;
begin
  if p_scope is null or p_scope='null'::jsonb then return true; end if;
  if jsonb_typeof(p_scope)<>'object' then return false; end if;
  for k,v in select * from jsonb_each(p_scope) loop
    if k not in ('project_name','description','deliverables','recurring_services','exclusions','additional_fields') then return false; end if;
    if k<>'additional_fields' and (jsonb_typeof(v)<>'string' or length(p_scope->>k)>case when k='project_name' then 160 else 6000 end) then return false; end if;
  end loop;
  if coalesce(btrim(p_scope->>'project_name'),'')='' or coalesce(btrim(p_scope->>'description'),'')='' then return false; end if;
  v:=coalesce(p_scope->'additional_fields','[]'::jsonb);
  if jsonb_typeof(v)<>'array' then return false; end if;
  if jsonb_array_length(v)>12 then return false; end if;
  for item in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(item)<>'object' then return false; end if;
    if (item-'label'-'value')<>'{}'::jsonb or jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'value') is distinct from 'string' then return false; end if;
    label:=btrim(item->>'label');
    if label='' or length(label)>100 or btrim(item->>'value')='' or length(item->>'value')>2000 or lower(label)=any(labels) then return false; end if;
    labels:=array_append(labels,lower(label));
  end loop;
  return true;
end $$;
revoke all on function public.valid_contract_development_scope(jsonb) from public,anon,authenticated;
grant execute on function public.valid_contract_development_scope(jsonb) to service_role;

alter table public.organization_custom_contracts add column development_scope jsonb;
alter table public.organization_custom_contracts add constraint custom_contract_development_scope_valid check (public.valid_contract_development_scope(development_scope));

create or replace function public.save_custom_contract(p_organization uuid,p_actor uuid,p_terms jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.organization_custom_contracts; access jsonb; org uuid;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
  access:=public.resolve_organization_contract_access(p_organization);
  org:=coalesce((access->>'billing_organization_id')::uuid,p_organization);
  perform 1 from public.organizations where id=org for update;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
  insert into public.organization_custom_contracts(organization_id,version,name,base_plan_code,monthly_price_brl,included_credits,resource_limits,features,effective_at,first_period_end,created_by,development_scope)
    values(org,(select coalesce(max(version),0)+1 from public.organization_custom_contracts where organization_id=org),p_terms->>'name',p_terms->>'base_plan_code',(p_terms->>'monthly_price_brl')::numeric,(p_terms->>'included_credits')::numeric,coalesce(p_terms->'resource_limits','{}'),coalesce(p_terms->'features','{}'),(p_terms->>'effective_at')::timestamptz,(p_terms->>'first_period_end')::timestamptz,p_actor,nullif(p_terms->'development_scope','null'::jsonb)) returning * into c;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',org,'custom_contract',c.id,'billing.custom_contract_version_created','Condições personalizadas cadastradas','Nova versão registrada. Faturas emitidas e saldos permanecem preservados.','organization',array['billing','custom_contract'],to_jsonb(c));
  return to_jsonb(c);
end $$;
revoke all on function public.save_custom_contract(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_custom_contract(uuid,uuid,jsonb) to service_role;

-- PostgreSQL runs BEFORE triggers in name order. The existing price/cycle stamp
-- selects the version first; this trigger adds its scope without repricing.
create function public.stamp_custom_contract_development() returns trigger
language plpgsql security definer set search_path=public as $$
declare scope jsonb;
begin
  if new.payload#>>'{commercial_terms,custom_contract_id}' is null then return new; end if;
  select development_scope into scope from public.organization_custom_contracts
    where id=(new.payload#>>'{commercial_terms,custom_contract_id}')::uuid and organization_id=new.organization_id;
  if not found then raise exception 'CUSTOM_CONTRACT_SCOPE_NOT_FOUND'; end if;
  new.payload:=jsonb_set(new.payload,'{commercial_terms,development_scope}',coalesce(scope,'null'::jsonb));
  return new;
end $$;
create trigger zz_stamp_custom_contract_development before insert on public.billing_payments
for each row execute function public.stamp_custom_contract_development();
revoke all on function public.stamp_custom_contract_development() from public,anon,authenticated;

-- Existing invoices/subscriptions deliberately retain their original snapshots.
