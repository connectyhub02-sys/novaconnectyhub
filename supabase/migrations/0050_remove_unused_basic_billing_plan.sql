-- Remove the legacy Basic plan from active catalogs when it has no historical usage.
do $$
declare
  basic_plan_id uuid;
begin
  select id
  into basic_plan_id
  from public.billing_plans
  where plan_code = 'basic'
  limit 1;

  if basic_plan_id is null then
    return;
  end if;

  if exists (select 1 from public.organizations where plan_code = 'basic')
    or exists (select 1 from public.organization_subscriptions where plan_code = 'basic')
    or exists (select 1 from public.organization_subscriptions where plan_id = basic_plan_id)
    or exists (select 1 from public.billing_cycles where plan_id = basic_plan_id)
  then
    update public.billing_plans
    set
      status = 'archived',
      highlighted = false,
      metadata = metadata || '{"superseded_by":"starter","archived_by":"remove_unused_basic_billing_plan"}'::jsonb,
      updated_at = now()
    where id = basic_plan_id;

    return;
  end if;

  delete from public.billing_plans
  where id = basic_plan_id;
end $$;
