-- Adds plan checkout interaction automations to the admin automation center.
-- Apply after 0036_platform_automations.sql.

update public.platform_automation_flows
set
  message_template = '{cliente}, recebemos sua solicitacao do plano {plano}. O pagamento ainda esta pendente. Finalize por aqui: {checkout_url}. Assim que confirmar, os creditos serao liberados automaticamente.',
  metadata = metadata || '{"seed_update":"0037_plan_interaction_automations","checkout_url_enabled":true}'::jsonb,
  updated_at = now()
where flow_key = 'subscription_pending'
  and (
    message_template not like '%{checkout_url}%'
    or metadata->>'seed' = '0036_platform_automations'
  );

insert into public.platform_automation_flows (
  flow_key,
  name,
  description,
  event_type,
  audience_type,
  conditions,
  trigger_config,
  message_template,
  max_sends_per_contact,
  priority,
  labels,
  metadata
)
values
  (
    'subscription_replaced',
    'Troca de plano no checkout',
    'Cliente cancelou uma solicitacao pendente e escolheu outro plano.',
    'subscription_replaced',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"plan_switch","source":"dashboard_plan_intent"}'::jsonb,
    '{cliente}, trocamos sua solicitacao para o plano {plano}. O checkout anterior do plano {plano_anterior} foi cancelado para evitar cobranca duplicada. Finalize por aqui: {checkout_url}.',
    5,
    42,
    array['billing','checkout','plan-switch'],
    '{"seed":"0037_plan_interaction_automations","goal":"recover_plan_switch_checkout"}'::jsonb
  ),
  (
    'checkout_cart_updated',
    'Carrinho atualizado',
    'Cliente marcou ou removeu adicionais/order bumps no checkout do plano.',
    'checkout_cart_updated',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"cart_update","source":"dashboard_plan_checkout"}'::jsonb,
    '{cliente}, atualizamos seu checkout do plano {plano}. Adicionais escolhidos: {adicionais}. Total atual: {valor}. Finalize por aqui: {checkout_url}.',
    12,
    45,
    array['billing','checkout','order-bump'],
    '{"seed":"0037_plan_interaction_automations","goal":"increase_checkout_average_ticket"}'::jsonb
  ),
  (
    'checkout_payment_started',
    'Pagamento iniciado',
    'Cliente iniciou pagamento do plano por Pix ou cartao.',
    'checkout_payment_started',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"payment_attempt","source":"dashboard_plan_checkout"}'::jsonb,
    '{cliente}, recebemos sua tentativa de pagamento do plano {plano} por {metodo_pagamento}. Se ainda nao confirmou, conclua no painel: {checkout_url}.',
    8,
    48,
    array['billing','payment','checkout'],
    '{"seed":"0037_plan_interaction_automations","goal":"recover_started_payment"}'::jsonb
  )
on conflict (flow_key) do update set
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  audience_type = excluded.audience_type,
  conditions = excluded.conditions,
  trigger_config = excluded.trigger_config,
  message_template = case
    when public.platform_automation_flows.message_template is null
      or trim(public.platform_automation_flows.message_template) = ''
      or public.platform_automation_flows.metadata->>'seed' = '0037_plan_interaction_automations'
      then excluded.message_template
    else public.platform_automation_flows.message_template
  end,
  max_sends_per_contact = excluded.max_sends_per_contact,
  priority = excluded.priority,
  labels = excluded.labels,
  metadata = public.platform_automation_flows.metadata || excluded.metadata,
  updated_at = now();
