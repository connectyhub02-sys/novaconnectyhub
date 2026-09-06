-- A platform lead's disputed payment is reviewed through the existing human queue.
create or replace function public.guard_platform_payment_review() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='in_process' or new.payload->>'pix_creation_pending'='true' then
    if exists(select 1 from public.sales_catalog_payment_reviews r join public.platform_customer_identities i on i.lead_id=r.lead_id
      join public.organizations o on o.owner_id=i.user_id where o.id=new.organization_id and r.status<>'resolved') then
      raise exception 'BILLING_FINANCIAL_REVIEW';
    end if;
  end if;
  return new;
end $$;
create trigger platform_payment_review_guard before update of status,payload on public.billing_payments for each row execute function public.guard_platform_payment_review();

create or replace function public.guard_billing_invoice_transition() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.status='refunded' and new.status<>'refunded' then return old; end if;
  if old.status='paid' and new.status not in ('paid','refunded') then return old; end if;
  return new;
end $$;
create trigger guard_billing_invoice_transition before update of status on public.billing_invoices for each row execute function public.guard_billing_invoice_transition();

-- Mutating SECURITY DEFINER RPCs run behind authenticated server handlers. Browser
-- code uses only the stable membership/access queries; a JWT cannot bypass billing.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.provolatile='v' and p.prorettype<>'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
