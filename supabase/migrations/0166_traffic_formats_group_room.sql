-- Formato dos posts da rotina de tráfego e "Sala de dúvidas": o agente abre os grupos escolhidos num
-- horário, responde citando quem perguntou (se o dono quiser) e fecha avisando quando abre de novo.
alter table public.whatsapp_traffic_routines
  add column if not exists post_format text not null default 'auto' check (post_format in ('auto','product_audio','product_button')),
  add column if not exists room_enabled boolean not null default false,
  add column if not exists room_target_ids uuid[] not null default '{}',
  add column if not exists room_open_hour smallint not null default 19 check (room_open_hour between 6 and 22),
  add column if not exists room_close_hour smallint not null default 20 check (room_close_hour between 7 and 23),
  add column if not exists room_days smallint[] not null default '{0,1,2,3,4,5,6}',
  add column if not exists room_replies boolean not null default true,
  add column if not exists room_planned_until timestamptz;

alter table public.whatsapp_traffic_routines drop constraint if exists whatsapp_traffic_routines_room_hours;
alter table public.whatsapp_traffic_routines add constraint whatsapp_traffic_routines_room_hours check (room_close_hour > room_open_hour);
create index if not exists whatsapp_traffic_routines_room_due on public.whatsapp_traffic_routines(room_planned_until) where room_enabled;

notify pgrst, 'reload schema';
