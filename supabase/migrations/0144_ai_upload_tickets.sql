create or replace function public.consume_ai_upload_ticket(p_id uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.ai_resources; k public.ai_api_keys; p public.ai_projects; access jsonb;
begin
  select * into r from public.ai_resources where id=p_id and kind='file' for update;
  if r.id is null or r.status<>'preparing' or r.metadata->>'ticket_hash' is distinct from p_hash
     or r.expires_at is null or r.expires_at<=now() then raise exception 'ai_upload_ticket_invalid'; end if;
  select * into k from public.ai_api_keys where id=r.key_id;
  select * into p from public.ai_projects where id=r.project_id;
  access:=public.resolve_organization_contract_access(p.organization_id);
  if k.status is distinct from 'active' or p.status is distinct from 'active'
     or k.project_id is distinct from p.id or not coalesce((access->>'allowed')::boolean,false)
     or (access->>'billing_organization_id')::uuid is distinct from r.organization_id then raise exception 'ai_key_inactive'; end if;
  update public.ai_resources set status='processing',metadata=metadata-'ticket_hash',updated_at=now()
    where id=r.id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.consume_ai_upload_ticket(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_ai_upload_ticket(uuid,text) to service_role;
select public.assert_ai_financial_rpc_boundary();
