-- Regua financeira configuravel e responsavel humano dos agentes WhatsApp.

insert into public.platform_automation_flows (
  flow_key,
  name,
  description,
  event_type,
  audience_type,
  conditions,
  trigger_config,
  message_template,
  delay_minutes,
  cooldown_minutes,
  max_sends_per_contact,
  priority,
  labels,
  metadata
)
values
  (
    'paid_plan_renewal_reminder',
    'Lembrete diario de renovacao Pix',
    'Avisa clientes com pagamento manual ou Pix dentro da janela configurada antes do vencimento.',
    'paid_plan_renewal_reminder',
    'paid_users',
    '{"plan_codes":["starter","pro","scale"]}'::jsonb,
    '{"kind":"paid_plan_deadline","schedule":"daily_configured"}'::jsonb,
    '{cliente}, seu plano {plano} vence em {dias_restantes} dia(s), em {data_vencimento}. Para manter seus agentes trabalhando sem pausa, renove pelo painel. Metodo atual: {metodo_pagamento}.',
    0,
    1440,
    0,
    65,
    array['billing','renewal','paid','pix'],
    '{"seed":"0071_platform_renewal_and_agent_responsibles","goal":"renew_pix_before_deadline"}'::jsonb
  ),
  (
    'paid_plan_due_today',
    'Plano vence hoje',
    'Avisa no dia do vencimento que o plano precisa ser renovado para evitar pausa operacional.',
    'paid_plan_due_today',
    'paid_users',
    '{"plan_codes":["starter","pro","scale"]}'::jsonb,
    '{"kind":"paid_plan_deadline","days_remaining":0}'::jsonb,
    '{cliente}, seu plano {plano} vence hoje ({data_vencimento}). Se nao renovar, painel, creditos e agentes pagos podem ser pausados. Acesse o painel para regularizar.',
    0,
    720,
    1,
    67,
    array['billing','renewal','paid'],
    '{"seed":"0071_platform_renewal_and_agent_responsibles","goal":"same_day_renewal"}'::jsonb
  ),
  (
    'paid_plan_grace_period',
    'Plano em carencia',
    'Avisa clientes em atraso dentro da carencia configurada antes da suspensao.',
    'paid_plan_grace_period',
    'paid_users',
    '{"plan_codes":["starter","pro","scale"]}'::jsonb,
    '{"kind":"paid_plan_deadline","schedule":"grace_period"}'::jsonb,
    '{cliente}, seu plano {plano} venceu em {data_vencimento} e esta com {dias_atraso} dia(s) de atraso. Regularize pelo painel para evitar a suspensao dos agentes. Carencia configurada: {dias_carencia} dia(s).',
    0,
    1440,
    0,
    68,
    array['billing','renewal','paid','past_due'],
    '{"seed":"0071_platform_renewal_and_agent_responsibles","goal":"recover_before_suspension"}'::jsonb
  ),
  (
    'payment_card_retry_failed',
    'Cartao recusado antes do vencimento',
    'Quando a tentativa antecipada do cartao falhar, orienta troca de cartao ou Pix antes do vencimento.',
    'payment_card_retry_failed',
    'paid_users',
    '{"plan_codes":["starter","pro","scale"]}'::jsonb,
    '{"kind":"card_retry_failed"}'::jsonb,
    '{cliente}, tentamos renovar seu plano {plano} pelo cartao, mas a cobranca nao foi aprovada. Seu ciclo vence em {dias_restantes} dia(s), em {data_vencimento}. Atualize o cartao no painel ou pague por Pix para manter tudo ativo.',
    0,
    720,
    0,
    70,
    array['billing','payment','card','recovery'],
    '{"seed":"0071_platform_renewal_and_agent_responsibles","goal":"recover_card_failure_before_deadline"}'::jsonb
  )
on conflict (flow_key) do update
set
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  audience_type = excluded.audience_type,
  conditions = excluded.conditions,
  trigger_config = excluded.trigger_config,
  message_template = excluded.message_template,
  delay_minutes = excluded.delay_minutes,
  cooldown_minutes = excluded.cooldown_minutes,
  max_sends_per_contact = excluded.max_sends_per_contact,
  priority = excluded.priority,
  labels = excluded.labels,
  metadata = public.platform_automation_flows.metadata || excluded.metadata,
  updated_at = now();

update public.platform_automation_flows
set
  priority = 69,
  updated_at = now()
where flow_key = 'paid_plan_expired';

update public.platform_billing_settings
set
  metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{renewal_policy}',
    coalesce(metadata->'renewal_policy', '{
      "pix_reminder_start_days": 3,
      "card_charge_attempt_days": 3,
      "grace_period_days": 3,
      "suspend_after_days": 3,
      "daily_whatsapp_reminders": true,
      "card_charge_attempt_enabled": true,
      "card_failure_uses_pix_fallback": true,
      "notify_responsible_humans": true
    }'::jsonb),
    true
  ),
  updated_at = now()
where setting_key = 'default';

with agent_context as (
  select
    agents.id,
    coalesce(agents.metadata, '{}'::jsonb) as metadata,
    coalesce(
      nullif(agents.metadata #>> '{responsible_human,phone}', ''),
      nullif(split_part(replace(replace(agents.metadata #>> '{whatsapp_behavior_config,humanHandoffNotificationNumbers}', ';', E'\n'), ',', E'\n'), E'\n', 1), ''),
      nullif(profiles.phone_normalized, ''),
      nullif(regexp_replace(coalesce(profiles.phone, ''), '\D', '', 'g'), '')
    ) as responsible_phone,
    coalesce(
      nullif(agents.metadata #>> '{responsible_human,name}', ''),
      nullif(profiles.full_name, ''),
      'Responsavel do agente'
    ) as responsible_name
  from public.agent_registry agents
  left join public.organizations organizations
    on organizations.id = agents.organization_id
  left join public.profiles profiles
    on profiles.id = organizations.owner_id
  where agents.scope = 'organization'
    and (
      agents.metadata @> '{"client_created":true,"agent_kind":"whatsapp"}'::jsonb
      or agents.metadata @> '{"agent_kind":"whatsapp"}'::jsonb
    )
)
update public.agent_registry agents
set
  metadata = jsonb_set(
    jsonb_set(
      agent_context.metadata,
      '{responsible_human}',
      jsonb_build_object(
        'name', agent_context.responsible_name,
        'phone', case
          when length(regexp_replace(agent_context.responsible_phone, '\D', '', 'g')) in (10, 11)
            and left(regexp_replace(agent_context.responsible_phone, '\D', '', 'g'), 2) <> '55'
            then '55' || regexp_replace(agent_context.responsible_phone, '\D', '', 'g')
          else regexp_replace(agent_context.responsible_phone, '\D', '', 'g')
        end,
        'notify_sales', true,
        'notify_payments', true,
        'notify_operational', true,
        'source', 'migration_0071',
        'updated_at', now()
      ),
      true
    ),
    '{whatsapp_behavior_config}',
    coalesce(agent_context.metadata->'whatsapp_behavior_config', '{}'::jsonb) || jsonb_build_object(
      'humanHandoffNotifications', true,
      'humanHandoffNotificationNumbers', case
        when length(regexp_replace(agent_context.responsible_phone, '\D', '', 'g')) in (10, 11)
          and left(regexp_replace(agent_context.responsible_phone, '\D', '', 'g'), 2) <> '55'
          then '55' || regexp_replace(agent_context.responsible_phone, '\D', '', 'g')
        else regexp_replace(agent_context.responsible_phone, '\D', '', 'g')
      end
    ),
    true
  ),
  updated_at = now()
from agent_context
where agents.id = agent_context.id
  and nullif(regexp_replace(coalesce(agent_context.responsible_phone, ''), '\D', '', 'g'), '') is not null
  and not (coalesce(agents.metadata, '{}'::jsonb) ? 'responsible_human');
