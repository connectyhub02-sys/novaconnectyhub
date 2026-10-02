-- Cost center phase 4: tell the customer, in plain terms, how many replies the
-- balance covers. Average WhatsApp attendance credits per charged reply in the
-- last 30 days: the organization's own when it has enough replies, otherwise the
-- platform average. Voice, API and Studio are priced separately and excluded.

create or replace function public.reply_credit_estimate(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare own record;
begin
  with attendance as (
    select organization_id, feature_code, connecty_charge_credits
    from public.usage_events
    where occurred_at >= now() - interval '30 days'
      and provider::text = 'gemini' and status::text = 'completed'
      and billing_mode::text in ('customer_billable', 'trial_billable')
      and feature_code !~ '^(external_ai|studio_|text_to_speech|voice_clone|voice_reply_whatsapp|voice_generation_audio)'
  )
  select
    count(*) filter (where feature_code = 'chat_completion' and connecty_charge_credits > 0 and organization_id = p_org) as replies,
    coalesce(sum(connecty_charge_credits) filter (where organization_id = p_org), 0) as credits,
    count(*) filter (where feature_code = 'chat_completion' and connecty_charge_credits > 0) as all_replies,
    coalesce(sum(connecty_charge_credits), 0) as all_credits
  into own from attendance;

  if own.replies >= 10 then
    return jsonb_build_object('credits_per_reply', round(own.credits / own.replies, 2), 'basis', 'organization', 'replies', own.replies);
  end if;
  if own.all_replies > 0 then
    return jsonb_build_object('credits_per_reply', round(own.all_credits / own.all_replies, 2), 'basis', 'platform', 'replies', own.all_replies);
  end if;
  return jsonb_build_object('credits_per_reply', null, 'basis', 'none', 'replies', 0);
end $$;

revoke all on function public.reply_credit_estimate(uuid) from public, anon, authenticated;
grant execute on function public.reply_credit_estimate(uuid) to service_role;
