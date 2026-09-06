-- Message history and archive jobs commit with the message, independently of agent execution.
create table public.lead_message_archive (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, conversation_id uuid, message_id uuid not null,
  operation text not null, fingerprint text not null, snapshot jsonb not null, created_at timestamptz not null default now(),
  media_status text not null default 'pending', attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz, last_error text, unique(message_id,fingerprint,operation)
);
create index lead_message_archive_history on public.lead_message_archive(organization_id,lead_id,created_at desc);
create index lead_message_archive_queue on public.lead_message_archive(next_attempt_at) where media_status in ('pending','retry');
alter table public.lead_message_archive enable row level security;
revoke all on public.lead_message_archive from anon,authenticated;
grant all on public.lead_message_archive to service_role;
alter table public.lead_files add column if not exists archive_id uuid references public.lead_message_archive(id) on delete set null;
create unique index lead_files_archive_id on public.lead_files(archive_id) where archive_id is not null;

create or replace function public.lead_archive_safe_json(value jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb; item record; text_value text; ids text[]; token text; i int;
begin
  if jsonb_typeof(value)='object' then
    result:='{}';
    for item in select * from jsonb_each(value) loop
      if item.key !~* '(credit.?card|card.?number|card.?token|ccv|cvv|cvc|security.?code|access.?token|api.?key|authorization|password|secret)' then
        result:=result||jsonb_build_object(item.key,public.lead_archive_safe_json(item.value));
      end if;
    end loop;
    return result;
  elsif jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(public.lead_archive_safe_json(v)),'[]') into result from jsonb_array_elements(value) v;
    return result;
  elsif jsonb_typeof(value)='string' then
    text_value:=value#>>'{}';
    select array_agg(matches[1]) into ids from regexp_matches(text_value,'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','gi') matches;
    if ids is not null then for i in 1..array_length(ids,1) loop text_value:=replace(text_value,ids[i],'__archive_uuid_'||i||'__'); end loop; end if;
    text_value:=regexp_replace(regexp_replace(text_value,'(^|[^0-9])([0-9][ -]?){14,18}[0-9]([^0-9]|$)','\1[dados de cartão removidos]\3','g'),'(cvv|cvc|ccv|password|senha)[[:space:]]*[:=][[:space:]]*[^[:space:]]+','\1: [removido]','gi');
    if ids is not null then for i in 1..array_length(ids,1) loop token:='__archive_uuid_'||i||'__'; text_value:=replace(text_value,token,ids[i]); end loop; end if;
    return to_jsonb(text_value);
  end if;
  return value;
end $$;

create or replace function public.archive_lead_message_snapshot(p_snapshot jsonb,p_operation text) returns void language plpgsql security definer set search_path=public as $$
declare saved public.lead_message_archive; safe jsonb;
begin
  if p_snapshot->>'lead_id' is null then return; end if;
  safe:=public.lead_archive_safe_json(p_snapshot);
  insert into public.lead_message_archive(organization_id,lead_id,conversation_id,message_id,operation,fingerprint,snapshot,media_status)
    values((safe->>'organization_id')::uuid,(safe->>'lead_id')::uuid,(safe->>'conversation_id')::uuid,(safe->>'id')::uuid,p_operation,md5((safe-'updated_at')::text),safe,
      case when coalesce(safe->>'message_type','') ~* '^(text|conversation|extendedtextmessage)$' and coalesce(safe->'payload','{}')::text !~* '(audio|image|video|document|sticker|media)' then 'not_media' else 'pending' end)
    on conflict do nothing returning * into saved;
  if saved.id is not null and p_operation in ('updated','deleted') then
    insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
      values('organization',saved.organization_id,'conversation_message',saved.message_id,'lead.message_'||p_operation,
      case when p_operation='deleted' then 'Mensagem removida na origem' else 'Mensagem atualizada' end,
      'Versão anterior preservada no arquivo do lead.','organization',array['lead_tracking','message_archive'],
      jsonb_build_object('lead_id',saved.lead_id,'conversation_id',saved.conversation_id,'message_id',saved.message_id,'archive_id',saved.id,'origin','backend'));
  end if;
end $$;
create or replace function public.archive_lead_message_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
    perform public.archive_lead_message_snapshot(to_jsonb(old),'received');
    perform public.archive_lead_message_snapshot(to_jsonb(new),'updated');
  elsif tg_op='DELETE' then
    -- Explicit deletion of the entire lead still cascades and removes its archive.
    if exists(select 1 from public.leads where id=old.lead_id) then perform public.archive_lead_message_snapshot(to_jsonb(old),'deleted'); end if;
    return old;
  else perform public.archive_lead_message_snapshot(to_jsonb(new),'received'); end if;
  return new;
end $$;
create trigger lead_message_archive_write after insert or update or delete on public.conversation_messages for each row execute function public.archive_lead_message_trigger();

create or replace function public.claim_lead_media_archives(p_limit int default 10) returns setof public.lead_message_archive language sql security definer set search_path=public as $$
  update public.lead_message_archive set claimed_at=now(),attempts=attempts+1
    where id in (select id from public.lead_message_archive where media_status in ('pending','retry') and next_attempt_at<=now()
      and (claimed_at is null or claimed_at<now()-interval '5 minutes') order by next_attempt_at for update skip locked limit least(greatest(p_limit,1),30)) returning *;
$$;
create or replace function public.backfill_lead_message_archive(p_limit int default 100) returns integer language plpgsql security definer set search_path=public as $$
declare row record; count int:=0;
begin
  for row in select m.* from public.conversation_messages m where m.lead_id is not null and not exists(select 1 from public.lead_message_archive a where a.message_id=m.id)
    order by m.created_at desc limit least(greatest(p_limit,1),200) loop
    perform public.archive_lead_message_snapshot(to_jsonb(row),'received'); count:=count+1;
  end loop;
  return count;
end $$;
revoke all on function public.archive_lead_message_snapshot(jsonb,text),public.claim_lead_media_archives(int),public.backfill_lead_message_archive(int) from public,anon,authenticated;
grant execute on function public.archive_lead_message_snapshot(jsonb,text),public.claim_lead_media_archives(int),public.backfill_lead_message_archive(int) to service_role;

insert into storage.buckets(id,name,public,file_size_limit) values('lead-archive','lead-archive',false,104857600) on conflict(id) do nothing;

-- A retry acknowledges the same event without duplicating the journey.
alter table public.intelligence_events add column if not exists tracking_event_key text;
create unique index intelligence_events_tracking_event_key on public.intelligence_events(tracking_event_key) where tracking_event_key is not null;

create table public.lead_record_archive (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, entity_type text not null, entity_id uuid not null,
  before_snapshot jsonb, after_snapshot jsonb, created_at timestamptz not null default now()
);
create index lead_record_archive_history on public.lead_record_archive(organization_id,lead_id,created_at desc);
alter table public.lead_record_archive enable row level security;
revoke all on public.lead_record_archive from anon,authenticated;
grant all on public.lead_record_archive to service_role;
create or replace function public.archive_lead_record_change() returns trigger language plpgsql security definer set search_path=public as $$
declare lead_key uuid; before_value jsonb; after_value jsonb; change_id uuid; changed_keys jsonb;
begin
  after_value:=public.lead_archive_safe_json(to_jsonb(new)-'updated_at');
  before_value:=case when tg_op='UPDATE' then public.lead_archive_safe_json(to_jsonb(old)-'updated_at') else null end;
  if before_value is not distinct from after_value then return new; end if;
  lead_key:=case when tg_table_name='leads' then new.id else (after_value->>'lead_id')::uuid end;
  if lead_key is null or not exists(select 1 from public.leads where id=lead_key and organization_id=new.organization_id) then return new; end if;
  insert into public.lead_record_archive(organization_id,lead_id,entity_type,entity_id,before_snapshot,after_snapshot)
    values(new.organization_id,lead_key,tg_table_name,new.id,before_value,after_value) returning id into change_id;
  select jsonb_agg(key) into changed_keys from jsonb_each(after_value) where value is distinct from before_value->key;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',new.organization_id,tg_table_name,new.id,'lead.record_changed',case when tg_table_name='leads' then 'Cadastro do lead atualizado' else 'Pedido atualizado' end,
      'Alteração preservada no arquivo do lead.','organization',array['lead_tracking','record_archive'],jsonb_build_object('lead_id',lead_key,'order_id',case when tg_table_name='sales_catalog_orders' then new.id else null end,'archive_id',change_id,'origin','backend','changed_fields',changed_keys));
  return new;
end $$;
create trigger lead_profile_archive_write after insert or update on public.leads for each row execute function public.archive_lead_record_change();
create trigger lead_order_archive_write after insert or update on public.sales_catalog_orders for each row execute function public.archive_lead_record_change();
