create function public.archive_commercial_announcement() returns trigger language plpgsql security definer set search_path=public as $$
declare campaign public.commercial_campaigns; recipient jsonb; phase text;
begin
 if new.metadata->'commercial_campaign' is null or new.metadata->'commercial_campaign'='null'::jsonb then return new; end if;
 select * into campaign from public.commercial_campaigns where id=(new.metadata#>>'{commercial_campaign,campaign_id}')::uuid;
 if campaign.id is null or (campaign.owner_type='store' and campaign.organization_id is distinct from new.organization_id) or (campaign.owner_type='platform' and new.scope::text<>'platform') then raise exception 'CAMPAIGN_ANNOUNCEMENT_SCOPE_INVALID'; end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 phase:=case new.status::text when 'scheduled' then 'announcement_scheduled' when 'published' then 'announcement_submitted' when 'review' then 'announcement_needs_review' else null end;
 if phase is null then return new; end if;
 for recipient in select value from jsonb_array_elements(new.metadata#>'{commercial_campaign,recipients}') loop
  insert into public.commercial_events(organization_id,buyer_user_id,lead_id,campaign_id,event_key,event_type,payload)
  values((recipient->>'organizationId')::uuid,case when campaign.owner_type='platform' then (recipient->>'id')::uuid end,
   case when campaign.owner_type='store' then (recipient->>'id')::uuid end,campaign.id,'announcement:'||new.id||':'||phase||':'||(recipient->>'id'),phase,
   jsonb_build_object('campaign_name',campaign.configuration->>'name','revision',new.metadata#>'{commercial_campaign,revision}','scheduled_for',new.scheduled_for,'pipeline_id',new.id,'message',new.body,'notice',case phase when 'announcement_submitted' then 'Divulgação encaminhada ao provedor. A entrega segue os retornos do WhatsApp.' when 'announcement_scheduled' then 'Divulgação agendada.' else 'Divulgação precisa de conferência.' end)) on conflict(event_key) do nothing;
 end loop;
 return new;
end $$;
create trigger archive_commercial_announcement after insert or update of status on public.content_pipeline_items for each row execute function public.archive_commercial_announcement();
revoke all on function public.archive_commercial_announcement() from public,anon,authenticated;
