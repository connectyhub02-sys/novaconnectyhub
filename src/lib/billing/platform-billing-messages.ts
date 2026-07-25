export const PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH = 900;

export const PLATFORM_BILLING_MESSAGE_VARIABLES = [
  "{cliente}",
  "{cliente_nome}",
  "{plano}",
  "{valor}",
  "{creditos}",
  "{evento}",
  "{status}",
  "{data}",
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
    "{cliente}, recebemos sua solicitacao do plano {plano}. O pagamento ainda esta pendente. Assim que confirmar, os creditos serao liberados automaticamente.",
  payment_pending:
    "{cliente}, seu pagamento do plano {plano} ainda esta pendente. Assim que o Mercado Pago confirmar, seus creditos serao liberados automaticamente.",
  payment_approved:
    "{cliente}, pagamento confirmado. Seu plano {plano} foi ativado na ConnectyHub com {creditos} creditos inclusos. Se havia saldo anterior, ele continua somado na sua carteira. Valor: {valor}.",
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
