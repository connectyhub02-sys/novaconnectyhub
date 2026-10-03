-- WhatsApp audio replies: the agent splits one reply into several short audios, and
-- each one was charged a per-audio minimum of 20–60 credits. A 58-character audio
-- (provider cost US$ 0.0058) cost the client 50 credits. Minimum goes to 5 credits,
-- like every new operation; the per-character price (US$ x 6 x 4) is unchanged.
-- Authorized by the account holder on 02/10/2026. Studio rates are untouched.

update public.billing_rates r
set minimum_charge_credits = 5,
    metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'minimum_before_2026_10_02', r.minimum_charge_credits,
      'minimum_note', 'Per-audio minimum lowered to 5 credits (replies are split into several audios)')
from public.provider_features f
where f.id = r.feature_id
  and f.feature_code in ('voice_reply_whatsapp', 'voice_reply_economy')
  and r.active
  and r.minimum_charge_credits > 5;
