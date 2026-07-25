export type BillingCheckoutBumpCode =
  | "extra_credits_5k"
  | "promo_credits_10k"
  | "promo_credits_25k"
  | "voice_priority"
  | "onboarding_assisted";

export type BillingCheckoutBump = {
  code: BillingCheckoutBumpCode;
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
    title: "5.000 creditos extras",
    description: "Reforce o saldo inicial para mais conversas, voz e campanhas.",
    priceBrl: 47,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 5000,
    badge: "Popular",
  },
  {
    code: "promo_credits_10k",
    title: "10.000 creditos promocionais",
    description: "Dobro de folego para manter o agente respondendo em dias de maior movimento.",
    priceBrl: 87,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 10000,
    badge: "Oferta",
  },
  {
    code: "promo_credits_25k",
    title: "25.000 creditos promocionais",
    description: "Pacote com melhor custo por credito para operacoes que querem escalar atendimento.",
    priceBrl: 197,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 25000,
    badge: "Melhor valor",
  },
  {
    code: "voice_priority",
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
    title: "Onboarding assistido",
    description: "Acompanhamento inicial para configurar agente, funil e WhatsApp.",
    priceBrl: 197,
    recurrence: "one_time",
    itemType: "adjustment",
    creditAmount: null,
    badge: "Implantacao",
  },
];
