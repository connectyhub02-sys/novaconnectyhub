-- Platform automations for commercial WhatsApp follow-ups.
-- Inspired by CRM builders: trigger, audience, conditions, sender, message and limits.

create table if not exists public.platform_automation_flows (
  id uuid primary key default gen_random_uuid(),
  flow_key text not null unique,
  name text not null,
  description text,
  event_type text not null,
  channel text not null default 'whatsapp',
  status text not null default 'active',
  selected_agent_id uuid references public.agent_registry(id) on delete set null,
  fallback_to_billing_agent boolean not null default true,
  audience_type text not null default 'all_clients',
  conditions jsonb not null default '{}'::jsonb,
  trigger_config jsonb not null default '{}'::jsonb,
  message_template text not null default '',
  delay_minutes integer not null default 0,
  cooldown_minutes integer not null default 0,
  max_sends_per_contact integer not null default 1,
  priority integer not null default 100,
  labels text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (flow_key ~ '^[a-z0-9][a-z0-9_-]{2,120}$'),
  check (channel in ('whatsapp', 'in_app')),
  check (status in ('active', 'paused', 'draft', 'archived')),
  check (audience_type in ('all_clients', 'trial_users', 'paid_users', 'custom')),
  check (delay_minutes >= 0 and delay_minutes <= 43200),
  check (cooldown_minutes >= 0 and cooldown_minutes <= 43200),
  check (max_sends_per_contact >= 0 and max_sends_per_contact <= 100),
  check (priority >= 0 and priority <= 10000)
);

create index if not exists idx_platform_automation_flows_event_status
  on public.platform_automation_flows (event_type, status, channel, priority);

create index if not exists idx_platform_automation_flows_agent
  on public.platform_automation_flows (selected_agent_id);

create index if not exists idx_platform_automation_flows_labels
  on public.platform_automation_flows using gin (labels);

drop trigger if exists touch_platform_automation_flows_updated_at
  on public.platform_automation_flows;

create trigger touch_platform_automation_flows_updated_at
  before update on public.platform_automation_flows
  for each row execute function public.touch_updated_at();

alter table public.platform_automation_flows enable row level security;

drop policy if exists "platform automation flows visible to platform admins" on public.platform_automation_flows;
create policy "platform automation flows visible to platform admins"
  on public.platform_automation_flows for select
  using (public.is_platform_admin());

drop policy if exists "platform automation flows managed by platform admins" on public.platform_automation_flows;
create policy "platform automation flows managed by platform admins"
  on public.platform_automation_flows for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

alter table public.billing_notification_events
  add column if not exists automation_flow_id uuid references public.platform_automation_flows(id) on delete set null;

create index if not exists idx_billing_notification_events_automation_flow
  on public.billing_notification_events (automation_flow_id, created_at desc);

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
    'trial_started',
    'Boas-vindas do teste gratis',
    'Envia parabens, informa os 1.000 creditos e reforca que o saldo restante soma ao plano se assinar durante o teste.',
    'trial_started',
    'trial_users',
    '{}'::jsonb,
    '{"kind":"event","source":"signup_completion"}'::jsonb,
    '{cliente}, parabens. Seu teste gratis ConnectyHub foi liberado com {creditos} creditos. Assine um plano durante o teste e o saldo restante soma aos creditos do plano escolhido.',
    1,
    10,
    array['trial','conversion','welcome'],
    '{"seed":"0036_platform_automations","goal":"activate_trial_conversion"}'::jsonb
  ),
  (
    'trial_credit_milestone',
    'Marco de consumo do teste',
    'Avisa a cada bloco de creditos usados que o saldo restante ainda pode virar bonus no plano.',
    'trial_credit_milestone',
    'trial_users',
    '{"milestone_step_credits":100}'::jsonb,
    '{"kind":"usage_milestone","step_credits":100}'::jsonb,
    '{cliente}, voce ja usou {marco_creditos} creditos do teste e ainda tem {creditos_restantes}. Assine um plano durante o teste para somar esse saldo aos creditos do plano escolhido.',
    20,
    20,
    array['trial','usage','conversion'],
    '{"seed":"0036_platform_automations","goal":"recover_usage_intent"}'::jsonb
  ),
  (
    'trial_no_credits',
    'Teste sem creditos',
    'Quando o saldo chega a zero, chama o cliente para assinar e liberar atendimentos.',
    'trial_no_credits',
    'trial_users',
    '{"max_balance_credits":0}'::jsonb,
    '{"kind":"wallet_empty"}'::jsonb,
    '{cliente}, seus creditos do teste acabaram. Para reativar atendimentos automaticos, IA e voz, escolha um plano no painel ConnectyHub.',
    2,
    30,
    array['trial','wallet','conversion'],
    '{"seed":"0036_platform_automations","goal":"recover_empty_trial_wallet"}'::jsonb
  ),
  (
    'subscription_pending',
    'Assinatura pendente',
    'Cliente iniciou assinatura e ainda precisa concluir o checkout.',
    'subscription_pending',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, recebemos sua solicitacao do plano {plano}. O pagamento ainda esta pendente. Assim que confirmar, os creditos serao liberados automaticamente.',
    3,
    40,
    array['billing','checkout','recovery'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'payment_pending',
    'Pagamento pendente',
    'Pagamento em analise, Pix Automatico aguardando ou checkout aberto.',
    'payment_pending',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, seu pagamento do plano {plano} ainda esta pendente. Assim que o Mercado Pago confirmar, seus creditos serao liberados automaticamente.',
    3,
    50,
    array['billing','payment'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'payment_approved',
    'Pagamento aprovado',
    'Confirma plano ativo e reforca os creditos liberados.',
    'payment_approved',
    'paid_users',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, pagamento confirmado. Seu plano {plano} foi ativado na ConnectyHub com {creditos} creditos inclusos. Se havia saldo anterior, ele continua somado na sua carteira. Valor: {valor}.',
    2,
    60,
    array['billing','activation'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'payment_rejected',
    'Pagamento recusado',
    'Chama o cliente de volta ao painel quando o pagamento falha.',
    'payment_rejected',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, o pagamento do plano {plano} nao foi aprovado. Seus dados continuam salvos, mas para liberar os atendimentos voce precisa concluir o pagamento no painel.',
    3,
    70,
    array['billing','recovery'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'subscription_paused',
    'Assinatura pausada',
    'Recupera clientes com recorrencia pausada.',
    'subscription_paused',
    'paid_users',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, sua assinatura ConnectyHub esta pausada. Acesse o painel para regularizar e manter os atendimentos ativos.',
    3,
    80,
    array['billing','retention'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'subscription_canceled',
    'Assinatura cancelada',
    'Recupera clientes cancelados e preserva acesso ao painel.',
    'subscription_canceled',
    'paid_users',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, sua assinatura ConnectyHub foi cancelada. O painel continua acessivel, mas recursos pagos dependem de um plano ativo.',
    3,
    90,
    array['billing','winback'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'billing_update',
    'Atualizacao geral de billing',
    'Fallback para eventos financeiros que ainda nao possuem fluxo especifico.',
    'billing_update',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"billing_status"}'::jsonb,
    '{cliente}, tivemos uma atualizacao no billing ConnectyHub referente ao plano {plano}. Acompanhe pelo painel.',
    3,
    100,
    array['billing','fallback'],
    '{"seed":"0036_platform_automations"}'::jsonb
  ),
  (
    'billing_operational_test',
    'Teste operacional interno',
    'Mensagem enviada pelo admin para validar agente e rota de WhatsApp.',
    'billing_operational_test',
    'all_clients',
    '{}'::jsonb,
    '{"kind":"admin_test"}'::jsonb,
    '{cliente}, esta e uma mensagem de teste da ConnectyHub para validar os avisos automaticos de cobranca. Nenhuma cobranca foi feita.',
    50,
    110,
    array['internal','test'],
    '{"seed":"0036_platform_automations","safe_test":true}'::jsonb
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
      or public.platform_automation_flows.metadata->>'seed' = '0036_platform_automations'
      then excluded.message_template
    else public.platform_automation_flows.message_template
  end,
  max_sends_per_contact = excluded.max_sends_per_contact,
  priority = excluded.priority,
  labels = excluded.labels,
  metadata = public.platform_automation_flows.metadata || excluded.metadata,
  updated_at = now();

grant select, insert, update, delete on public.platform_automation_flows to authenticated;
grant all on public.platform_automation_flows to service_role;
