export type BillingCheckoutBumpCode = "extra_credits_5k" | "voice_priority" | "onboarding_assisted";

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
    description: "Mais volume para conversas, voz e campanhas no primeiro ciclo.",
    priceBrl: 47,
    recurrence: "one_time",
    itemType: "credit_pack",
    creditAmount: 5000,
    badge: "Mais margem",
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
