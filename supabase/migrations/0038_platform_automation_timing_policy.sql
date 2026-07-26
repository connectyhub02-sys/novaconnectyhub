-- Standard sending rhythm for platform revenue automations.
-- Keeps checkout follow-ups helpful without over-messaging the user.

with timing_policy(flow_key, delay_minutes, cooldown_minutes, max_sends_per_contact, priority, timing_note) as (
  values
    ('trial_started', 0, 1440, 1, 10, 'Boas-vindas imediata; uma vez por cliente.'),
    ('trial_credit_milestone', 5, 60, 8, 20, 'Avisa consumo do teste com respiro minimo de 1 hora.'),
    ('trial_no_credits', 2, 720, 2, 30, 'Recuperacao rapida sem insistir muitas vezes no mesmo dia.'),
    ('subscription_pending', 8, 240, 0, 40, 'Follow-up poucos minutos depois do checkout aberto.'),
    ('subscription_replaced', 2, 180, 0, 42, 'Confirma troca de plano quase imediato, com cooldown.'),
    ('checkout_cart_updated', 15, 180, 0, 45, 'Da tempo para o cliente montar o carrinho antes do lembrete.'),
    ('checkout_payment_started', 12, 240, 0, 48, 'Recupera pagamento iniciado sem interromper o fluxo do checkout.'),
    ('payment_pending', 10, 360, 0, 50, 'Acompanha pagamento pendente com intervalo comercial.'),
    ('payment_approved', 0, 60, 0, 60, 'Confirmacao imediata de ativacao e creditos liberados.'),
    ('payment_rejected', 10, 360, 0, 70, 'Recupera pagamento recusado depois de curto intervalo.'),
    ('subscription_paused', 60, 1440, 0, 80, 'Retencao com cadencia diaria.'),
    ('subscription_canceled', 120, 1440, 0, 90, 'Winback com respiro apos o cancelamento.'),
    ('billing_update', 15, 360, 0, 100, 'Atualizacoes gerais com cooldown para evitar excesso.'),
    ('billing_operational_test', 0, 0, 50, 110, 'Teste interno sem atraso.')
)
update public.platform_automation_flows as flow
set
  delay_minutes = timing_policy.delay_minutes,
  cooldown_minutes = timing_policy.cooldown_minutes,
  max_sends_per_contact = timing_policy.max_sends_per_contact,
  priority = timing_policy.priority,
  metadata = flow.metadata
    || jsonb_build_object(
      'timing_policy', '0038_platform_automation_timing_policy',
      'timing_note', timing_policy.timing_note,
      'timing_updated_at', now()
    ),
  updated_at = now()
from timing_policy
where flow.flow_key = timing_policy.flow_key;
