-- A Pix mandate can be preparing before provider_subscription_id exists.
-- Reject the entire activation transaction while that agreement is live.
create function public.guard_custom_contract_pix_activation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.billing_pix_authorizations where subscription_id=new.subscription_id
    and state in ('preparing','dispatching','unknown','CREATED','ACTIVE')) then
    raise exception 'PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED';
  end if;
  return new;
end $$;
create trigger guard_custom_contract_pix_activation before insert on public.custom_contract_activations
for each row execute function public.guard_custom_contract_pix_activation();
revoke all on function public.guard_custom_contract_pix_activation() from public,anon,authenticated;
