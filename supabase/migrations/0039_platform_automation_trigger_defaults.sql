-- Visible trigger defaults for the platform automation builder.
-- These values feed the "Regras do gatilho" fields in the admin panel.

with trigger_policy(flow_key, conditions, trigger_config, trigger_note) as (
  values
    (
      'trial_started',
      '{"plan_codes":["trial"],"min_balance_credits":1}'::jsonb,
      '{"kind":"trial_started","source":"signup_completion"}'::jsonb,
      'Cliente em teste com saldo liberado recebe a mensagem de boas-vindas.'
    ),
    (
      'trial_credit_milestone',
      '{"plan_codes":["trial"],"min_balance_credits":1,"min_used_credits":100,"milestone_step_credits":100}'::jsonb,
      '{"kind":"usage_milestone","step_credits":100}'::jsonb,
      'Durante o teste, avisa a cada bloco de 100 creditos usados enquanto ainda existe saldo.'
    ),
    (
      'trial_no_credits',
      '{"plan_codes":["trial"],"max_balance_credits":0}'::jsonb,
      '{"kind":"wallet_empty"}'::jsonb,
      'Quando o teste chega a saldo zero, chama o usuario para assinar.'
    ),
    (
      'subscription_pending',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"checkout_open","source":"dashboard_plan_checkout"}'::jsonb,
      'Checkout de plano pago aberto e ainda aguardando conclusao.'
    ),
    (
      'subscription_replaced',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"plan_switch","source":"dashboard_plan_intent"}'::jsonb,
      'Cliente trocou o plano escolhido antes de pagar.'
    ),
    (
      'checkout_cart_updated',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"cart_update","source":"dashboard_plan_checkout"}'::jsonb,
      'Cliente adicionou ou removeu itens no checkout.'
    ),
    (
      'checkout_payment_started',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"payment_attempt","source":"dashboard_plan_checkout"}'::jsonb,
      'Cliente iniciou a tentativa de pagamento no checkout.'
    ),
    (
      'payment_pending',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"billing_status","status":"pending"}'::jsonb,
      'Pagamento de plano pago ficou pendente ou em analise.'
    ),
    (
      'payment_approved',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"billing_status","status":"approved"}'::jsonb,
      'Pagamento aprovado e plano pronto para ativacao.'
    ),
    (
      'payment_rejected',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"billing_status","status":"rejected"}'::jsonb,
      'Pagamento recusado, cancelado ou expirado.'
    ),
    (
      'subscription_paused',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"billing_status","status":"paused"}'::jsonb,
      'Assinatura recorrente pausada.'
    ),
    (
      'subscription_canceled',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"billing_status","status":"canceled"}'::jsonb,
      'Assinatura recorrente cancelada.'
    ),
    (
      'billing_update',
      '{"plan_codes":["starter","pro","scale"]}'::jsonb,
      '{"kind":"billing_status","status":"update"}'::jsonb,
      'Atualizacao financeira geral para planos pagos.'
    ),
    (
      'billing_operational_test',
      '{}'::jsonb,
      '{"kind":"admin_test"}'::jsonb,
      'Teste interno do admin sem filtro de plano ou saldo.'
    )
)
update public.platform_automation_flows as flow
set
  conditions = (
    (
      coalesce(flow.conditions, '{}'::jsonb)
      - 'plan_codes'
      - 'min_balance_credits'
      - 'max_balance_credits'
      - 'min_used_credits'
      - 'max_used_credits'
      - 'milestone_step_credits'
    )
    || trigger_policy.conditions
  ),
  trigger_config = coalesce(flow.trigger_config, '{}'::jsonb) || trigger_policy.trigger_config,
  metadata = flow.metadata
    || jsonb_build_object(
      'trigger_policy', '0039_platform_automation_trigger_defaults',
      'trigger_note', trigger_policy.trigger_note,
      'trigger_updated_at', now()
    ),
  updated_at = now()
from trigger_policy
where flow.flow_key = trigger_policy.flow_key;
