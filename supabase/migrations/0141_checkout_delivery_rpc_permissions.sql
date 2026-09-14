-- Public checkout requests are validated by the server route, never direct RPC.
revoke all on function public.set_checkout_delivery(uuid,bigint,jsonb,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_checkout_delivery(uuid,bigint,jsonb,numeric,text,jsonb) to service_role;
