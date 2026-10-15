-- Null preserves the legacy up-to-four carousel until edited by its owner.
alter table public.whatsapp_traffic_campaigns
  add column carousel_size integer check (carousel_size between 2 and 4),
  add column include_audio boolean not null default false;

-- An edited routine and cancellation of its old pending posts commit together.
-- Planner/health/status updates must not cancel their own work.
create or replace function public.reset_edited_traffic_campaign()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.post_status,new.target_ids,new.product_mode,new.catalog_item_ids,new.idea,new.manual_text,
    new.post_format,new.intensity,new.start_hour,new.schedule_mode,new.starts_at,new.status_audience,new.status_style,new.status_color,new.carousel_size,new.include_audio)
    is distinct from row(old.post_status,old.target_ids,old.product_mode,old.catalog_item_ids,old.idea,old.manual_text,
    old.post_format,old.intensity,old.start_hour,old.schedule_mode,old.starts_at,old.status_audience,old.status_style,old.status_color,old.carousel_size,old.include_audio) then
    update public.content_pipeline_items set status='archived', updated_at=now()
    where organization_id=old.organization_id and status='scheduled'
      and tags @> array['traffic_campaign:' || old.id::text];
    new.planned_until := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_edited_traffic_campaign on public.whatsapp_traffic_campaigns;
create trigger reset_edited_traffic_campaign before update on public.whatsapp_traffic_campaigns
for each row execute function public.reset_edited_traffic_campaign();
