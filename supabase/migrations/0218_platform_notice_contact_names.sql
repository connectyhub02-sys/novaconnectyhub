-- Read-only identity fallback for the platform's own contact archive.
-- Never match arbitrary customers by phone across tenants or infer a name from text.
create function public.platform_notice_contact_names(p_leads uuid[])
returns table(lead_id uuid,contact_name text)
language sql stable security definer set search_path=public as $$
 with candidates as (
   select l.id as lead_id,n.organization_id,
     case when n.metadata->>'recipient_kind'='agent_responsible'
       then nullif(btrim(n.metadata->>'responsible_name'),'')
       when regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(n.recipient_phone,'[^0-9]','','g')
       then nullif(btrim(p.full_name),'') end as contact_name
   from leads l
   join organizations archive_org on archive_org.id=l.organization_id and archive_org.slug='connectyhub-platform-whatsapp'
   join whatsapp_outbound_deliveries d on d.lead_id=l.id and d.organization_id=l.organization_id
   join billing_notification_events n on split_part(d.payload->>'track_id',':',1)='billing_notice_'||n.id::text
     and n.status='sent' and n.metadata->>'sender_kind'='platform'
     and n.metadata->>'sender_instance_id'=d.whatsapp_instance_id::text
     and regexp_replace(n.recipient_phone,'[^0-9]','','g')=regexp_replace(l.phone_number,'[^0-9]','','g')
     and regexp_replace(split_part(d.target,'@',1),'[^0-9]','','g')=regexp_replace(l.phone_number,'[^0-9]','','g')
   join organizations account on account.id=n.organization_id
   left join profiles p on p.id=account.owner_id
   where l.id=any(p_leads) and l.channel='whatsapp' and length(regexp_replace(l.phone_number,'[^0-9]','','g')) between 10 and 15
 )
 select lead_id,min(contact_name) from candidates
 group by lead_id having count(distinct organization_id)=1 and count(distinct contact_name)=1;
$$;
revoke all on function public.platform_notice_contact_names(uuid[]) from public,anon,authenticated;
grant execute on function public.platform_notice_contact_names(uuid[]) to service_role;
notify pgrst,'reload schema';
