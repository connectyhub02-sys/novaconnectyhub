create table public.infrastructure_alert_states (
 metric text primary key check(metric in ('cpu','memory','disk')),
 active boolean not null default false,
 bad_samples integer not null default 0 check(bad_samples between 0 and 3),
 last_value numeric,
 last_sample_at timestamptz not null,
 last_event_at timestamptz
);
create table public.infrastructure_alert_events (
 id bigint generated always as identity primary key,
 metric text not null check(metric in ('cpu','memory','disk')),
 event text not null check(event in ('opened','recovered','reminder')),
 value numeric not null,
 threshold numeric not null,
 measured_at timestamptz not null,
 unique(metric,event,measured_at)
);
alter table public.infrastructure_alert_states enable row level security;
alter table public.infrastructure_alert_events enable row level security;
create policy infrastructure_alert_states_read on public.infrastructure_alert_states for select to authenticated using(public.is_infrastructure_admin());
create policy infrastructure_alert_events_read on public.infrastructure_alert_events for select to authenticated using(public.is_infrastructure_admin());
grant select on public.infrastructure_alert_states,public.infrastructure_alert_events to authenticated;
grant all on public.infrastructure_alert_states,public.infrastructure_alert_events to service_role;
grant usage,select on sequence public.infrastructure_alert_events_id_seq to service_role;

-- One transaction serializes sample, sustained state, events and retention.
create function public.managed_record_host_sample(p_sample jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
declare cfg infrastructure_alert_settings; previous infrastructure_alert_states;
 stamp timestamptz:=(p_sample->>'measured_at')::timestamptz;
 latest timestamptz; metric_name text; metric_value numeric; boundary numeric;
 is_active boolean; consecutive integer; event_name text; event_at timestamptz;
begin
 if stamp is null or abs(extract(epoch from (now()-stamp)))>300 then raise exception 'invalid_sample_time'; end if;
 select * into strict cfg from infrastructure_alert_settings where id=true for update;
 select max(measured_at) into latest from infrastructure_samples;
 if latest is not null and stamp<=latest then return false; end if;
 insert into infrastructure_samples(measured_at,cpu_percent,memory_total,memory_available,disk_total,disk_used,network_rx_bytes,network_tx_bytes,services)
 values(stamp,(p_sample->>'cpu_percent')::numeric,(p_sample->>'memory_total')::bigint,(p_sample->>'memory_available')::bigint,
 (p_sample->>'disk_total')::bigint,(p_sample->>'disk_used')::bigint,(p_sample->>'network_rx_bytes')::bigint,
 (p_sample->>'network_tx_bytes')::bigint,p_sample->'services');
 foreach metric_name in array array['cpu','memory','disk'] loop
  select * into previous from infrastructure_alert_states where metric=metric_name;
  is_active:=coalesce(previous.active,false);consecutive:=coalesce(previous.bad_samples,0);event_at:=previous.last_event_at;event_name:=null;
  if previous.last_sample_at is null or stamp-previous.last_sample_at>make_interval(secs=>cfg.stale_seconds) then consecutive:=0; end if;
  if metric_name='cpu' then metric_value:=(p_sample->>'cpu_percent')::numeric;boundary:=cfg.cpu_percent;
  elsif metric_name='memory' then metric_value:=100*(1-(p_sample->>'memory_available')::numeric/(p_sample->>'memory_total')::numeric);boundary:=cfg.memory_percent;
  else metric_value:=100*(p_sample->>'disk_used')::numeric/(p_sample->>'disk_total')::numeric;boundary:=cfg.disk_percent;end if;
  if metric_value is null then consecutive:=0;
  elsif is_active and metric_value<=greatest(0,boundary-5) then is_active:=false;consecutive:=0;event_name:='recovered';
  elsif not is_active then
   if metric_value>=boundary then consecutive:=least(3,consecutive+1);else consecutive:=0;end if;
   if consecutive=3 then is_active:=true;event_name:='opened';end if;
  elsif event_at is null or stamp-event_at>=interval '5 minutes' then event_name:='reminder';end if;
  if event_name is not null then
   event_at:=stamp;
   insert into infrastructure_alert_events(metric,event,value,threshold,measured_at) values(metric_name,event_name,metric_value,boundary,stamp);
  end if;
  insert into infrastructure_alert_states(metric,active,bad_samples,last_value,last_sample_at,last_event_at)
   values(metric_name,is_active,consecutive,metric_value,stamp,event_at)
   on conflict(metric) do update set active=excluded.active,bad_samples=excluded.bad_samples,last_value=excluded.last_value,last_sample_at=excluded.last_sample_at,last_event_at=excluded.last_event_at;
 end loop;
 delete from infrastructure_samples where measured_at<now()-interval '7 days';
 delete from infrastructure_alert_events where measured_at<now()-interval '30 days';
 return true;
end $$;
revoke all on function public.managed_record_host_sample(jsonb) from public,anon,authenticated;
grant execute on function public.managed_record_host_sample(jsonb) to service_role;
