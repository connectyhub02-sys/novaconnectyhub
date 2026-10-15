-- NULL keeps the existing automatic distribution until the owner changes it.
create or replace function public.valid_traffic_daily_times(times text[])
returns boolean language sql immutable set search_path = public as $$
  select times is null or (
    cardinality(times) between 1 and 5 and array_ndims(times) = 1
    and not exists(select 1 from unnest(times) t where t is null or t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    and (select count(distinct t) from unnest(times) t) = cardinality(times)
  );
$$;
alter table public.whatsapp_traffic_campaigns add column daily_times text[]
  check (public.valid_traffic_daily_times(daily_times));

-- An edited routine and cancellation of its old pending posts commit together.
-- Planner/health/status updates must not cancel their own work.
create or replace function public.reset_edited_traffic_campaign()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.post_status,new.target_ids,new.product_mode,new.catalog_item_ids,new.idea,new.manual_text,
    new.post_format,new.intensity,new.start_hour,new.schedule_mode,new.starts_at,new.status_audience,new.status_style,new.status_color,new.carousel_size,new.include_audio,new.daily_times)
    is distinct from row(old.post_status,old.target_ids,old.product_mode,old.catalog_item_ids,old.idea,old.manual_text,
    old.post_format,old.intensity,old.start_hour,old.schedule_mode,old.starts_at,old.status_audience,old.status_style,old.status_color,old.carousel_size,old.include_audio,old.daily_times) then
    update public.content_pipeline_items set status='archived', updated_at=now()
    where organization_id=old.organization_id and status='scheduled'
      and tags @> array['traffic_campaign:' || old.id::text];
    new.planned_until := null;
    new.last_run_at := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_edited_traffic_campaign on public.whatsapp_traffic_campaigns;
create trigger reset_edited_traffic_campaign before update on public.whatsapp_traffic_campaigns
for each row execute function public.reset_edited_traffic_campaign();
