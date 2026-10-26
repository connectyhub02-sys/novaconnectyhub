-- Photo refresh is scoped to the lead's own connected sender and never replaces CRM metadata.
create function public.claim_lead_avatar_sync(p_lead uuid,p_instance uuid,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l public.leads; started timestamptz; attempted timestamptz; claim uuid:=gen_random_uuid();
begin
 select * into l from leads where id=p_lead for update;
 if not found or not exists(select 1 from whatsapp_instances where id=p_instance and organization_id=l.organization_id and status='connected' and instance_token_encrypted is not null) then return null; end if;
 begin started:=(l.metadata->>'profile_image_refresh_started_at')::timestamptz; exception when others then started:=null; end;
 begin attempted:=(l.metadata->>'profile_image_last_attempt_at')::timestamptz; exception when others then attempted:=null; end;
 if started>now()-interval '2 minutes' or (not p_force and attempted>now()-interval '10 minutes') then return null; end if;
 update leads set metadata=coalesce(metadata,'{}')||jsonb_build_object('profile_image_refresh_claim',claim,'profile_image_refresh_started_at',now(),'profile_image_last_attempt_at',now()) where id=p_lead;
 return jsonb_build_object('claim',claim,'metadata',coalesce(l.metadata,'{}'));
end $$;

create function public.complete_lead_avatar_sync(p_lead uuid,p_instance uuid,p_claim uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l public.leads; patch jsonb; result jsonb; synced timestamptz; started timestamptz;
begin
 select * into l from leads where id=p_lead for update;
 if not found or p_claim is null or l.metadata->>'profile_image_refresh_claim' is distinct from p_claim::text
   or not exists(select 1 from whatsapp_instances where id=p_instance and organization_id=l.organization_id) then return null; end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into patch from jsonb_each(p_patch) where key=any(array[
   'profile_image_url','profile_image_synced_at','profile_image_source','profile_image_sync_status',
   'profile_image_provider_chat_id','last_profile_image_response','profile_image_last_attempt_at']);
 begin synced:=(l.metadata->>'profile_image_synced_at')::timestamptz; exception when others then synced:=null; end;
 begin started:=(l.metadata->>'profile_image_refresh_started_at')::timestamptz; exception when others then started:=null; end;
 -- A fresher webhook photo wins over an older in-flight lookup.
 if synced>started then patch:='{}'; end if;
 update leads set metadata=(coalesce(metadata,'{}')-'profile_image_refresh_claim'-'profile_image_refresh_started_at')||patch where id=p_lead returning metadata into result;
 return result;
end $$;
revoke all on function public.claim_lead_avatar_sync(uuid,uuid,boolean),public.complete_lead_avatar_sync(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_lead_avatar_sync(uuid,uuid,boolean),public.complete_lead_avatar_sync(uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
