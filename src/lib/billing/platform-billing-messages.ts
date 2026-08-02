export const PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH = 900;

export const PLATFORM_BILLING_MESSAGE_VARIABLES = [
  "{cliente}",
  "{cliente_nome}",
  "{plano}",
  "{valor}",
  "{creditos}",
  "{creditos_restantes}",
  "{creditos_usados}",
  "{marco_creditos}",
  "{dias_restantes}",
  "{trial_expira_em}",
  "{data_expiracao_trial}",
  "{evento}",
  "{status}",
  "{data}",
  "{checkout_url}",
  "{metodo_pagamento}",
  "{adicionais}",
  "{plano_anterior}",
] as const;

export const PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS = [
  {
    eventType: "billing_operational_test",
    label: "Teste operacional",
    description: "Mensagem enviada pelo botao de teste do financeiro.",
  },
  {
    eventType: "subscription_pending",
    label: "Assinatura pendente",
    description: "Cliente iniciou uma assinatura e ainda precisa concluir.",
  },
  {
    eventType: "subscription_replaced",
    label: "Troca de plano",
    description: "Cliente cancelou um checkout pendente e escolheu outro plano.",
  },
  {
    eventType: "checkout_cart_updated",
    label: "Carrinho atualizado",
    description: "Cliente marcou ou removeu adicionais no checkout do plano.",
  },
  {
    eventType: "checkout_payment_started",
    label: "Pagamento iniciado",
    description: "Cliente iniciou pagamento do plano por Pix ou cartao.",
  },
  {
    eventType: "trial_started",
    label: "Teste iniciado",
    description: "Cliente concluiu cadastro, recebeu creditos de teste e pode converter com saldo acumulado.",
  },
  {
    eventType: "trial_credit_milestone",
    label: "Consumo do teste",
    description: "Cliente cruzou um novo bloco de consumo durante o teste gratis.",
  },
  {
    eventType: "trial_three_days_remaining",
    label: "Teste faltando 3 dias",
    description: "Cliente ainda tem saldo de teste que pode virar bonus se assinar antes do fim dos 7 dias.",
  },
  {
    eventType: "trial_one_day_remaining",
    label: "Ultimo dia do teste",
    description: "Ultima chamada para assinar antes do saldo restante do teste expirar.",
  },
  {
    eventType: "trial_no_credits",
    label: "Teste sem creditos",
    description: "Creditos do teste acabaram e os atendimentos automaticos precisam de plano ou creditos.",
  },
  {
    eventType: "trial_expired",
    label: "Teste expirado",
    description: "Teste de 7 dias acabou e o saldo restante do beneficio expirou.",
  },
  {
    eventType: "payment_pending",
    label: "Pagamento pendente",
    description: "Mercado Pago informou pagamento em analise ou aguardando.",
  },
  {
    eventType: "payment_approved",
    label: "Pagamento aprovado",
    description: "Pagamento confirmado e creditos liberados.",
  },
  {
    eventType: "payment_rejected",
    label: "Pagamento recusado",
    description: "Pagamento negado, expirado ou com falha.",
  },
  {
    eventType: "subscription_paused",
    label: "Assinatura pausada",
    description: "Recorrencia pausada pelo provedor.",
  },
  {
    eventType: "subscription_canceled",
    label: "Assinatura cancelada",
    description: "Recorrencia cancelada pelo cliente ou provedor.",
  },
  {
    eventType: "billing_update",
    label: "Atualizacao geral",
    description: "Fallback para eventos de billing sem template especifico.",
  },
] as const;

export type PlatformBillingMessageTemplateKey =
  typeof PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS[number]["eventType"];

export type PlatformBillingMessageTemplates = Record<PlatformBillingMessageTemplateKey, string>;

export const DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES: PlatformBillingMessageTemplates = {
  billing_operational_test:
    "{cliente}, esta e uma mensagem de teste da ConnectyHub para validar os avisos automaticos de cobranca. Nenhuma cobranca foi feita.",
  subscription_pending:
    "{cliente}, recebemos sua solicitacao do plano {plano}. O pagamento ainda esta pendente. Finalize por aqui: {checkout_url}. Assim que confirmar, os creditos serao liberados automaticamente.",
  subscription_replaced:
    "{cliente}, trocamos sua solicitacao para o plano {plano}. O checkout anterior do plano {plano_anterior} foi cancelado para evitar cobranca duplicada. Finalize por aqui: {checkout_url}.",
  checkout_cart_updated:
    "{cliente}, atualizamos seu checkout do plano {plano}. Adicionais escolhidos: {adicionais}. Total atual: {valor}. Finalize por aqui: {checkout_url}.",
  checkout_payment_started:
    "{cliente}, recebemos sua tentativa de pagamento do plano {plano} por {metodo_pagamento}. Se ainda nao confirmou, conclua no painel: {checkout_url}.",
  trial_started:
    "{cliente}, parabens. Seu teste gratis ConnectyHub foi liberado com {creditos} creditos. Assine um plano ate {trial_expira_em} e o saldo restante soma aos creditos do plano escolhido.",
  trial_credit_milestone:
    "{cliente}, voce ja usou {marco_creditos} creditos do teste e ainda tem {creditos_restantes}. Assine ate {trial_expira_em} para somar esse saldo aos creditos do plano escolhido.",
  trial_three_days_remaining:
    "{cliente}, faltam 3 dias para seu teste ConnectyHub acabar. Voce ainda tem {creditos_restantes} creditos de bonus. Assine ate {trial_expira_em} para somar esse saldo ao plano escolhido; depois disso o saldo expira.",
  trial_one_day_remaining:
    "{cliente}, ultimo dia do seu teste ConnectyHub. Ele expira em {trial_expira_em}. Voce ainda tem {creditos_restantes} creditos; se assinar agora, esse saldo soma ao plano escolhido. Depois do prazo, ele zera.",
  trial_no_credits:
    "{cliente}, seus creditos do teste acabaram. Para reativar atendimentos automaticos, IA e voz, escolha um plano no painel ConnectyHub.",
  trial_expired:
    "{cliente}, seu teste gratis ConnectyHub acabou em {trial_expira_em}. O saldo restante do beneficio expirou. Para reativar atendimentos automaticos, escolha um plano no painel.",
  payment_pending:
    "{cliente}, seu pagamento do plano {plano} ainda esta pendente. Assim que o Mercado Pago confirmar, seus creditos serao liberados automaticamente.",
  payment_approved:
    "{cliente}, pagamento confirmado. Seu plano {plano} foi ativado na ConnectyHub com {creditos} creditos inclusos. Se havia saldo de teste ainda valido, ele foi somado na sua carteira. Valor: {valor}.",
  payment_rejected:
    "{cliente}, o pagamento do plano {plano} nao foi aprovado. Seus dados continuam salvos, mas para liberar os atendimentos voce precisa concluir o pagamento no painel.",
  subscription_paused:
    "{cliente}, sua assinatura ConnectyHub esta pausada. Acesse o painel para regularizar e manter os atendimentos ativos.",
  subscription_canceled:
    "{cliente}, sua assinatura ConnectyHub foi cancelada. O painel continua acessivel, mas recursos pagos dependem de um plano ativo.",
  billing_update:
    "{cliente}, tivemos uma atualizacao no billing ConnectyHub referente ao plano {plano}. Acompanhe pelo painel.",
};

export function normalizePlatformBillingMessageTemplates(value: unknown): PlatformBillingMessageTemplates {
  const record = readRecord(value);
  const templates = { ...DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES };

  for (const definition of PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS) {
    const rawTemplate = record?.[definition.eventType];
    const template = typeof rawTemplate === "string" ? cleanTemplate(rawTemplate) : "";

    templates[definition.eventType] = template || DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES[definition.eventType];
  }

  return templates;
}

export function renderPlatformBillingMessageTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
) {
  return cleanTemplate(template).replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => {
    const value = variables[key.toLowerCase()];
    return value === null || value === undefined || value === "" ? match : String(value);
  });
}

function cleanTemplate(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH);
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
