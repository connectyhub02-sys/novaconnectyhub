create table public.commercial_renewal_attempts (
 agreement_id uuid not null references public.commercial_agreements(id), cycle integer not null,
 billing_day date not null, attempt_id uuid not null unique, created_at timestamptz not null default now(),
 primary key(agreement_id,cycle,billing_day)
);
alter table public.commercial_renewal_attempts enable row level security;
revoke all on public.commercial_renewal_attempts from public,anon,authenticated;
grant all on public.commercial_renewal_attempts to service_role;
create or replace function public.claim_store_recurring_attempt(p_agreement uuid,p_session uuid,p_attempt uuid,p_revision bigint,p_amount numeric,p_now timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; s public.sales_catalog_payment_sessions; result jsonb; day date; days_left integer;
begin
 select * into a from public.commercial_agreements where id=p_agreement and owner_type='store' for update;
 if a.id is null or a.state<>'active' or a.cancel_at_period_end or a.period_end is null or a.period_end<=p_now then return jsonb_build_object('claimed',false); end if;
 if public.store_agreement_change_pending(a.id) then return jsonb_build_object('claimed',false); end if;
 day:=(p_now at time zone 'America/Sao_Paulo')::date;
 days_left:=(a.period_end at time zone 'America/Sao_Paulo')::date-day;
 if days_left not between 1 and 3 or extract(hour from p_now at time zone 'America/Sao_Paulo')<9 then return jsonb_build_object('claimed',false); end if;
 if exists(select 1 from public.commercial_renewal_attempts where agreement_id=a.id and cycle=a.paid_cycles and billing_day=day) then return jsonb_build_object('claimed',false); end if;
 if not exists(select 1 from public.commercial_card_vault where agreement_id=a.id and organization_id=a.organization_id and status='active') then return jsonb_build_object('claimed',false); end if;
 select * into s from public.sales_catalog_payment_sessions where id=p_session and organization_id=a.organization_id;
 if not exists(select 1 from public.commercial_agreement_periods where agreement_id=a.id and cycle=a.paid_cycles and order_id=s.order_id and paid_at is null) then raise exception 'COMMERCE_RENEWAL_CHANGED'; end if;
 result:=public.claim_checkout_card_attempt(s.id,p_attempt,p_revision,p_amount,1);
 if (result->>'claimed')::boolean then
  insert into public.commercial_renewal_attempts(agreement_id,cycle,billing_day,attempt_id) values(a.id,a.paid_cycles,day,p_attempt);
 end if;
 return result;
end $$;
revoke all on function public.claim_store_recurring_attempt(uuid,uuid,uuid,bigint,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_store_recurring_attempt(uuid,uuid,uuid,bigint,numeric,timestamptz) to service_role;

alter table public.commercial_agreement_periods add column fulfilled_at timestamptz;
