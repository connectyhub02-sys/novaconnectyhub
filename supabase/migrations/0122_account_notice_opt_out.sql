-- Recipient preferences apply across customer and platform senders for one billing account.
create table public.account_notice_recipients (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null check(phone ~ '^[1-9][0-9]{9,14}$'),
  public_key uuid not null default gen_random_uuid() unique,
  enabled boolean not null default true,
  opted_out_at timestamptz,
  updated_at timestamptz not null default now(),
  welcome_contact_phone text check(welcome_contact_phone ~ '^[1-9][0-9]{9,14}$'),
  primary key(organization_id,phone)
);
alter table public.account_notice_recipients enable row level security;
revoke all on public.account_notice_recipients from public,anon,authenticated;
grant all on public.account_notice_recipients to service_role;

create function public.ensure_account_notice_recipient(p_org uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result public.account_notice_recipients;
begin
  if not exists(select 1 from public.organizations where id=p_org and coalesce(billing_organization_id,id)=id) then raise exception 'NOTICE_ACCOUNT_REQUIRED'; end if;
  insert into public.account_notice_recipients(organization_id,phone) values(p_org,p_phone) on conflict do nothing;
  select * into result from public.account_notice_recipients where organization_id=p_org and phone=p_phone;
  return to_jsonb(result);
end $$;
revoke all on function public.ensure_account_notice_recipient(uuid,text) from public,anon,authenticated;
grant execute on function public.ensure_account_notice_recipient(uuid,text) to service_role;

create function public.cancel_opted_out_account_notices() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  -- Re-enabling starts with future events, not a backlog accumulated while muted.
  if new.enabled=false or (tg_op='UPDATE' and old.enabled=false) then
    update public.billing_notification_events n set status='skipped',next_attempt_at=null,error_message='Destinatário saiu da lista de avisos da conta.'
    from public.organizations company,public.organizations account
    where account.id=new.organization_id and company.owner_id=account.owner_id
      and coalesce(company.billing_organization_id,company.id)=account.id
      and n.organization_id=company.id and n.recipient_phone=new.phone
      and n.status in ('pending','failed') and n.delivery_claimed_at is null and not n.delivery_uncertain;
  end if;
  return new;
end $$;
create trigger cancel_opted_out_account_notices after insert or update of enabled on public.account_notice_recipients
for each row execute function public.cancel_opted_out_account_notices();
revoke all on function public.cancel_opted_out_account_notices() from public,anon,authenticated;
