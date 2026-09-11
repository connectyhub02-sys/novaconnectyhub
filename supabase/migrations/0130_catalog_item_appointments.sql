-- Item action is independent from price and from the profession's suggested default.
alter table public.sales_catalog_import_jobs drop constraint if exists sales_catalog_import_jobs_default_sales_destination_check;
alter table public.sales_catalog_import_jobs add constraint sales_catalog_import_jobs_default_sales_destination_check check(default_sales_destination in ('connectyhub_checkout','external_site','manual_handoff','appointment'));
alter table public.sales_catalog_import_items drop constraint if exists sales_catalog_import_items_sales_destination_check;
alter table public.sales_catalog_import_items add constraint sales_catalog_import_items_sales_destination_check check(sales_destination in ('connectyhub_checkout','external_site','manual_handoff','appointment'));

create or replace function public.catalog_activity_destination(activity text) returns text language sql immutable as $$
 select case when activity is null or activity in ('generic_sales','pizzaria_delivery','restaurante_lanchonete','farmacia','moda_varejo','academia_suplementos','educacao_cursos','autopecas','ecommerce','loja_suplementos') then 'connectyhub_checkout' else 'appointment' end
$$;

-- Old WhatsApp previews must not silently publish an inherited retail action.
-- A destination explicitly saved during review has its own action version.
create or replace function public.apply_import_activity_default() returns trigger language plpgsql security definer set search_path=public as $$
declare activity text; candidate text;
begin
 if new.status not in ('draft','ready','error') or new.sales_destination<>'connectyhub_checkout' or coalesce(new.metadata,'{}'::jsonb) ? 'action_version' then return new; end if;
 candidate:=coalesce(new.source_evidence->>'source_agent_id',new.source_evidence->>'sourceAgentId');
 select coalesce(metadata->'prompt_builder_config'->>'templateId',metadata->'prompt_builder_config'->>'template_id') into activity
 from public.agent_registry where id::text=candidate and organization_id=new.organization_id;
 if activity is not null and public.catalog_activity_destination(activity)='appointment' then
   new.sales_destination:='appointment';
   new.status:='draft';
   new.fulfillment:=coalesce(new.fulfillment,'{}'::jsonb) || '{"mode":"service","scheduling_required":true}'::jsonb;
   new.metadata:=coalesce(new.metadata,'{}'::jsonb) || '{"action_origin":"activity_default"}'::jsonb;
   new.warnings:=array_append(coalesce(new.warnings,array[]::text[]),'Agendamento sugerido pela atividade. Revise a ação e a agenda deste item antes de publicar.');
 end if;
 return new;
end $$;
create trigger import_activity_default before insert or update on public.sales_catalog_import_items for each row execute function public.apply_import_activity_default();
update public.sales_catalog_import_items set metadata=coalesce(metadata,'{}'::jsonb) where status in ('draft','ready','error');
revoke all on function public.apply_import_activity_default() from public,anon,authenticated;

create or replace function public.apply_catalog_activity_profile() returns trigger language plpgsql security definer set search_path=public as $$
declare agent public.agent_registry; candidate text; config jsonb; resource text; agent_count integer;
begin
 if new.scope <> 'organization' or new.memory_type <> 'sales_catalog_item' then return new; end if;
 new.metadata := coalesce(new.metadata,'{}'::jsonb);
 candidate := coalesce(new.metadata->>'source_agent_id',new.metadata->>'agent_id');
 if candidate is null and jsonb_typeof(new.metadata->'assigned_agent_ids')='array' then
   if jsonb_array_length(new.metadata->'assigned_agent_ids')=1 then candidate:=new.metadata->'assigned_agent_ids'->>0; end if;
 end if;
 if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select * into agent from public.agent_registry where id=candidate::uuid and organization_id=new.organization_id;
 elsif candidate is null then
   select count(*) into agent_count from public.agent_registry where organization_id=new.organization_id and metadata ? 'prompt_builder_config' and coalesce(metadata->>'controls_all_whatsapp_agents','false')<>'true';
   if agent_count=1 then select * into agent from public.agent_registry where organization_id=new.organization_id and metadata ? 'prompt_builder_config' and coalesce(metadata->>'controls_all_whatsapp_agents','false')<>'true' limit 1; end if;
 end if;
 -- Never trust an activity supplied by a public URL or another tenant's agent.
 new.metadata := new.metadata - 'activity_profile' - 'profile_agent_id';
 if agent.id is not null then
   config := coalesce(agent.metadata->'prompt_builder_config','{}'::jsonb);
   new.metadata := new.metadata || jsonb_build_object('activity_profile',jsonb_build_object('templateId',coalesce(config->>'templateId',config->>'template_id','generic_sales'),'professionalIdentity',config->'professionalIdentity'),'profile_agent_id',agent.id);
   if not (new.metadata ? 'action_version') and (coalesce(new.metadata->>'sales_destination','connectyhub_checkout')='connectyhub_checkout' or new.metadata->>'action_origin'='activity_default') then
     new.metadata := new.metadata || jsonb_build_object('sales_destination',public.catalog_activity_destination(coalesce(config->>'templateId',config->>'template_id')),'action_origin','activity_default');
   end if;
 end if;
 resource:=new.metadata->'fulfillment'->>'agenda_resource_id';
 if nullif(resource,'') is not null and not exists(select 1 from public.customer_agenda_resources where id::text=resource and organization_id=new.organization_id and kind='service') then raise exception 'AGENDA_RESOURCE_SCOPE'; end if;
 return new;
end $$;
create trigger catalog_activity_profile before insert or update of metadata on public.intelligence_memory for each row execute function public.apply_catalog_activity_profile();

-- Preserve explicit new item choices. Legacy inherited checkout receives the activity default.
update public.intelligence_memory set metadata=coalesce(metadata,'{}'::jsonb) where scope='organization' and memory_type='sales_catalog_item';

create or replace function public.refresh_catalog_activity_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.metadata->'prompt_builder_config' is distinct from new.metadata->'prompt_builder_config' then
   update public.intelligence_memory set metadata=metadata where organization_id=new.organization_id and memory_type='sales_catalog_item' and scope='organization'
   and (metadata->>'profile_agent_id'=new.id::text or metadata->>'source_agent_id'=new.id::text or metadata->'assigned_agent_ids' @> to_jsonb(array[new.id::text]));
 end if;
 return new;
end $$;
create trigger refresh_catalog_activity_profile after update of metadata on public.agent_registry for each row execute function public.refresh_catalog_activity_profile();
revoke all on function public.apply_catalog_activity_profile(), public.refresh_catalog_activity_profile() from public,anon,authenticated;

-- Block new charges through legacy checkout URLs without rewriting financial history.
create or replace function public.guard_catalog_item_charge() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='sales_catalog_card_attempts' then
   if new.state not in ('processing','pending') then return new; end if;
 end if;
 if exists (
   select 1 from public.sales_catalog_order_items line
   join public.intelligence_memory item on item.id=line.catalog_item_id and item.organization_id=line.organization_id
   where line.order_id=new.order_id and line.organization_id=new.organization_id
     and item.scope='organization' and item.memory_type='sales_catalog_item'
     and coalesce(item.metadata->>'sales_destination','connectyhub_checkout')<>'connectyhub_checkout'
 ) then raise exception 'CATALOG_ITEM_NOT_FOR_CHECKOUT'; end if;
 return new;
end $$;
create trigger catalog_item_charge before insert on public.sales_catalog_payment_sessions for each row execute function public.guard_catalog_item_charge();
create trigger catalog_item_card_charge before insert or update of state on public.sales_catalog_card_attempts for each row execute function public.guard_catalog_item_charge();
revoke all on function public.guard_catalog_item_charge() from public,anon,authenticated;
