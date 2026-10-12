alter table public.meta_campaign_executions drop constraint meta_campaign_executions_status_check;
alter table public.meta_campaign_executions add constraint meta_campaign_executions_status_check
 check(status in ('draft','creating','awaiting_media','blocked','paused','activating','active','pausing','uncertain'));
comment on column public.meta_campaign_executions.status is 'blocked permits an explicit resume only after a definitive Meta rejection; uncertain never retries creation automatically';
