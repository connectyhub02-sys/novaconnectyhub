alter table public.platform_products
  add column if not exists billing_cycle text not null default 'one_time';

alter table public.platform_products
  add column if not exists billing_interval text not null default 'month';

do $$
begin
  alter table public.platform_products
    add constraint platform_products_billing_cycle_check
    check (billing_cycle in ('one_time', 'recurring'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.platform_products
    add constraint platform_products_billing_interval_check
    check (billing_interval in ('week', 'month', 'quarter', 'year'));
exception
  when duplicate_object then null;
end $$;

update public.platform_products
set
  billing_cycle = case
    when metadata->>'billing_cycle' = 'recurring' then 'recurring'
    when metadata->>'billing_cycle' = 'one_time' then 'one_time'
    else billing_cycle
  end,
  billing_interval = case
    when metadata->>'billing_interval' in ('week', 'month', 'quarter', 'year') then metadata->>'billing_interval'
    else billing_interval
  end
where metadata ? 'billing_cycle'
   or metadata ? 'billing_interval';

create index if not exists idx_platform_products_billing_cycle
  on public.platform_products (billing_cycle, status, updated_at desc);
