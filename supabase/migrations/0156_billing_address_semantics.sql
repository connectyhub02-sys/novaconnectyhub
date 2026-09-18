-- Billing address is not a delivery destination. No existing lead facts changed.
do $migration$
declare definition text; start_at integer; end_at integer;
begin
 select pg_get_functiondef('public.enrich_platform_billing_lead()'::regprocedure) into definition;
 start_at := position($anchor$ if jsonb_typeof(j.payload->'billing_address')='object' then$anchor$ in definition);
 end_at := position(' update leads set metadata=prior' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'BILLING_ADDRESS_ANCHOR_MISSING'; end if;
 definition := substring(definition from 1 for start_at-1) || substring(definition from end_at);
 execute definition;
end $migration$;
