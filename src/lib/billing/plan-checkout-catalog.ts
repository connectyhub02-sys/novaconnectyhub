export type BillingCheckoutBumpCode = string;

export type BillingCheckoutBump = {
  code: BillingCheckoutBumpCode;
  platformProductId: string | null;
  title: string;
  description: string;
  priceBrl: number;
  recurrence: "monthly" | "one_time";
  itemType: "credit_pack" | "adjustment";
  creditAmount: number | null;
  badge: string;
};

export const billingCheckoutBumps: BillingCheckoutBump[] = [
  {
    code: "extra_credits_5k",
    platformProductId: null,
    title: "Pacote Resposta Rapida",
    description: "5.000 creditos para manter o agente respondendo leads sem pausa.",
    priceBrl: 47,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 5000,
    badge: "Agente online",
  },
  {
    code: "promo_credits_10k",
    platformProductId: null,
    title: "Pacote Venda Mais",
    description: "10.000 creditos para mais conversas, campanhas e chances de fechar vendas.",
    priceBrl: 87,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 10000,
    badge: "Venda mais",
  },
  {
    code: "promo_credits_25k",
    platformProductId: null,
    title: "Pacote Alta Performance",
    description: "25.000 creditos com melhor folego para operacoes que atendem todos os dias.",
    priceBrl: 197,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 25000,
    badge: "Alta performance",
  },
  {
    code: "voice_priority",
    platformProductId: null,
    title: "Voz IA prioridade",
    description: "Pacote mensal para atendimento com mais mensagens de voz.",
    priceBrl: 67,
    recurrence: "monthly",
    itemType: "adjustment",
    creditAmount: null,
    badge: "Recorrente",
  },
  {
    code: "onboarding_assisted",
    platformProductId: null,
    title: "Onboarding assistido",
    description: "Acompanhamento inicial para configurar agente, funil e WhatsApp.",
    priceBrl: 197,
    recurrence: "one_time",
    itemType: "adjustment",
    creditAmount: null,
    badge: "Implantacao",
  },
];
