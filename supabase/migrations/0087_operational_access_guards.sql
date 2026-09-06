-- Same primary workspace for server rendering and the authenticated request gate.
create or replace function public.my_workspace_contract_access() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare org uuid;
begin
  select organization_id into org from public.organization_members where user_id=auth.uid() order by created_at,id limit 1;
  if org is null then return jsonb_build_object('allowed',false,'reason','workspace_required'); end if;
  return public.resolve_organization_contract_access(org);
end $$;
revoke all on function public.my_workspace_contract_access() from public,anon;
grant execute on function public.my_workspace_contract_access() to authenticated,service_role;

-- Billing reads/authentication keep their existing membership policies. Operational
-- tables additionally require a valid contract even for previously issued JWTs.
do $$ declare t record;
begin
  for t in select c.table_name from information_schema.columns c join pg_tables p on p.schemaname=c.table_schema and p.tablename=c.table_name
    where c.table_schema='public' and c.column_name='organization_id' and p.rowsecurity
    and c.table_name not in ('organization_members','organization_subscriptions','billing_cycles','billing_invoices','billing_invoice_items','billing_payments',
      'billing_card_attempts','billing_payment_notifications','trial_conversion_messages','credit_wallets','credit_transactions')
  loop
    execute format('create policy operational_contract_required on public.%I as restrictive for all to authenticated using (public.can_operate_organization(organization_id)) with check (public.can_operate_organization(organization_id))',t.table_name);
  end loop;
end $$;

-- Credit grants and lifecycle mutations are internal effects of verified payments.
revoke execute on function public.grant_credit_wallet(uuid,numeric,text,text,jsonb,public.credit_transaction_type) from public,authenticated,anon;
revoke execute on function public.grant_billing_plan_credits(uuid,text,timestamptz,timestamptz,text) from public,authenticated,anon;
revoke execute on function public.expire_connectyhub_trial_credits(timestamptz,integer) from public,authenticated,anon;

-- Only attach historical companies when there is one unambiguous paid contract.
with roots as (
  select owner_id,min(id::text)::uuid as root from public.organizations o where plan_code not in ('trial','internal')
    and exists(select 1 from public.organization_subscriptions s where s.organization_id=o.id and s.current_period_end is not null)
  group by owner_id having count(*)=1
)
update public.organizations o set billing_organization_id=r.root from roots r
where o.owner_id=r.owner_id and o.id<>r.root and o.plan_code='trial' and o.billing_organization_id is null
  and not exists(select 1 from public.organization_subscriptions s where s.organization_id=o.id and s.plan_code<>'trial');
