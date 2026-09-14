-- Restore the reviewed service boundary, without changing customer-facing RPCs.
-- Run after restore too: pg_restore --no-acl does not restore source privileges.
create or replace function public.assert_ai_financial_rpc_boundary()
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare signature text; target oid;
begin
  foreach signature in array array[
    'public.claim_ai_request(uuid,text,text)',
    'public.reserve_ai_credits(uuid,numeric,text,jsonb)',
    'public.finish_ai_request(uuid,text,jsonb,jsonb,text)',
    'public.settle_ai_operation(uuid,text,jsonb,jsonb,text)',
    'public.save_credit_topup_policy(uuid,uuid,jsonb)',
    'public.claim_credit_topup(uuid)',
    'public.fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb)'
  ] loop
    target := to_regprocedure(signature);
    if target is null then raise exception 'AI_RPC_MISSING: %', signature; end if;
    if has_function_privilege('anon',target,'EXECUTE')
       or has_function_privilege('authenticated',target,'EXECUTE')
       or not has_function_privilege('service_role',target,'EXECUTE') then
      raise exception 'AI_RPC_ACL_DRIFT: %', signature;
    end if;
  end loop;
end $$;
revoke all on function public.assert_ai_financial_rpc_boundary() from public, anon, authenticated;
grant execute on function public.assert_ai_financial_rpc_boundary() to service_role;

do $$ declare signature text;
begin
  foreach signature in array array[
    'public.claim_ai_request(uuid,text,text)',
    'public.reserve_ai_credits(uuid,numeric,text,jsonb)',
    'public.finish_ai_request(uuid,text,jsonb,jsonb,text)',
    'public.settle_ai_operation(uuid,text,jsonb,jsonb,text)',
    'public.save_credit_topup_policy(uuid,uuid,jsonb)',
    'public.claim_credit_topup(uuid)',
    'public.fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb)'
  ] loop
    if to_regprocedure(signature) is null then raise exception 'AI_RPC_MISSING: %',signature; end if;
    execute format('revoke all on function %s from public, anon, authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;
select public.assert_ai_financial_rpc_boundary();

-- Fail a future blanket GRANT atomically rather than silently reopening billing.
-- CREATE OR REPLACE preserves existing ACLs. Re-creation with permissive defaults
-- also fails; full restores must run the assertion after their final grants.
create or replace function public.guard_ai_financial_rpc_grants()
returns event_trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform public.assert_ai_financial_rpc_boundary();
end $$;
revoke all on function public.guard_ai_financial_rpc_grants() from public,anon,authenticated;
drop event trigger if exists connectyhub_ai_financial_rpc_grants;
create event trigger connectyhub_ai_financial_rpc_grants on ddl_command_end
  when tag in ('GRANT','CREATE FUNCTION') execute function public.guard_ai_financial_rpc_grants();
