export type PublicPricingBillingPlan = {
  id?: string;
  planCode: string;
  name: string;
  shortDescription: string | null;
  status: string;
  sortOrder: number;
  highlighted: boolean;
  monthlyPriceBrl: number;
  includedCredits: number;
  overageCreditPriceBrl: number;
  autoRechargeMinCredits: number;
  overageLimitCredits: number;
  trialDays: number;
  agentLimit: number | null;
  whatsappInstanceLimit: number | null;
  userLimit: number | null;
  storageLimitBytes: number;
  storageFileLimit: number;
  storageImageMaxBytes: number;
  storageVideoMaxBytes: number;
  storageFileMaxBytes: number;
  moduleCodes: string[];
};

export type PublicPricingPlan = {
  code: string;
  name: string;
  price: string;
  priceValue: number;
  period: string;
  description: string;
  tagline: string;
  storage: PublicPricingStorageSummary | null;
  included: string[];
  locked: string[];
  cta: string;
  trial?: boolean;
  popular?: boolean;
  premium?: boolean;
};

export type PublicPricingStorageSummary = {
  limitLabel: string;
  fileLimitLabel: string | null;
  imageMaxLabel: string | null;
  videoMaxLabel: string | null;
  fileMaxLabel: string | null;
};

const moduleLabels: Record<string, { included: string; locked: string }> = {
  whatsapp_agent: { included: "Agente IA no WhatsApp", locked: "Agente IA no WhatsApp" },
  sales_catalog: { included: "Catalogo de vendas", locked: "Catalogo de vendas" },
  crm_basic: { included: "CRM basico, leads e conversas", locked: "CRM basico" },
  automations: { included: "Campanhas e automacoes", locked: "Campanhas e automacoes" },
  voice_ai: { included: "Voz IA por creditos", locked: "Voz IA" },
  api_whatsapp: { included: "API WhatsApp", locked: "API WhatsApp" },
  reports: { included: "Relatorios", locked: "Relatorios avancados" },
  team_users: { included: "Usuarios da equipe", locked: "Usuarios da equipe" },
};

const defaultPresentation: Record<string, { description: string; tagline: string; cta: string }> = {
  trial: {
    description: "Teste completo de 7 dias com creditos para validar atendimento, produtos, IA e automacoes.",
    tagline: "Todos os recursos liberados durante o teste; depois, o painel pausa ate assinar",
    cta: "Comecar teste gratis",
  },
  starter: {
    description: "Para comecar a vender com IA no WhatsApp.",
    tagline: "Entrada com 1 agente para validar atendimento e vendas",
    cta: "Assinar Start",
  },
  pro: {
    description: "Para operacao comercial com mais volume.",
    tagline: "Mais agentes e WhatsApps para times que atendem todos os dias",
    cta: "Assinar Pro",
  },
  scale: {
    description: "Para escalar atendimento, agentes e API.",
    tagline: "Operacoes com equipe, API e volume comercial maior",
    cta: "Assinar Scale",
  },
};

export function buildPublicPricingPlans(plans: PublicPricingBillingPlan[]) {
  return plans
    .filter((plan) => plan.status === "active")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.monthlyPriceBrl - right.monthlyPriceBrl)
    .map(buildPublicPricingPlan);
}

export function buildPublicPricingPlan(plan: PublicPricingBillingPlan): PublicPricingPlan {
  const code = normalizeCode(plan.planCode);
  const presentation = defaultPresentation[code];
  const isTrial = code === "trial" || (plan.monthlyPriceBrl <= 0 && plan.trialDays > 0);
  const included = buildIncludedItems(plan, isTrial);

  return {
    code,
    name: plan.name,
    price: formatBrl(plan.monthlyPriceBrl),
    priceValue: plan.monthlyPriceBrl,
    period: isTrial && plan.trialDays > 0 ? `/${plan.trialDays} dias` : "/mes",
    description: isTrial
      ? presentation?.description || "Teste completo da ConnectyHub por tempo limitado."
      : plan.shortDescription || presentation?.description || "Plano ConnectyHub configurado no admin.",
    tagline: presentation?.tagline || buildGeneratedTagline(plan),
    storage: buildStorageSummary(plan),
    included,
    locked: buildLockedItems(plan, isTrial),
    cta: presentation?.cta || (isTrial ? "Comecar teste gratis" : `Assinar ${plan.name}`),
    trial: isTrial,
    popular: !isTrial && (plan.highlighted || code === "pro"),
    premium: !isTrial && code === "scale",
  };
}

function buildIncludedItems(plan: PublicPricingBillingPlan, isTrial: boolean) {
  if (isTrial) {
    const trialItems = [
      plan.includedCredits > 0 ? `${formatCredits(plan.includedCredits)} creditos para testar todo o painel` : null,
      plan.trialDays > 0 ? `${plan.trialDays} dias com todos os recursos liberados` : "Teste com todos os recursos liberados",
      plan.whatsappInstanceLimit !== null ? pluralize(plan.whatsappInstanceLimit, "WhatsApp conectado", "WhatsApps conectados") : null,
      plan.agentLimit !== null ? pluralize(plan.agentLimit, "agente IA", "agentes IA") : null,
      plan.userLimit !== null ? pluralize(plan.userLimit, "usuario no painel", "usuarios no painel") : null,
      "Agente IA no WhatsApp",
      "Catalogo de vendas",
      "Campanhas e automacoes",
      "CRM basico, leads e conversas",
      "Voz IA por creditos",
      "Instagram Direct e Messenger Facebook no teste",
      "Meta Ads, Google Ads e gestor IA no teste",
      "API WhatsApp no teste",
      "Apos o teste, recursos pausam ate assinar",
    ];

    return uniqueStrings(trialItems.filter((item): item is string => Boolean(item))).slice(0, 14);
  }

  const items = [
    plan.includedCredits > 0 ? `${formatCredits(plan.includedCredits)} creditos inclusos` : null,
    plan.whatsappInstanceLimit !== null ? pluralize(plan.whatsappInstanceLimit, "WhatsApp conectado", "WhatsApps conectados") : null,
    plan.agentLimit !== null ? pluralize(plan.agentLimit, "agente IA", "agentes IA") : null,
    plan.userLimit !== null ? pluralize(plan.userLimit, "usuario no painel", "usuarios no painel") : null,
    ...plan.moduleCodes.map((code) => moduleLabels[code]?.included ?? formatModuleCode(code)),
    plan.overageCreditPriceBrl > 0 ? `Credito extra a ${formatBrl(plan.overageCreditPriceBrl)}` : null,
    plan.autoRechargeMinCredits > 0 ? `Recarga minima de ${formatCredits(plan.autoRechargeMinCredits)} creditos` : null,
    plan.overageLimitCredits > 0 ? `Limite excedente de ${formatCredits(plan.overageLimitCredits)} creditos` : null,
    plan.includedCredits > 0 ? "Creditos acumulam com saldo anterior" : null,
  ];

  return uniqueStrings(items.filter((item): item is string => Boolean(item))).slice(0, 14);
}

function buildStorageSummary(plan: PublicPricingBillingPlan): PublicPricingStorageSummary | null {
  if (
    plan.storageLimitBytes <= 0
    && plan.storageFileLimit <= 0
    && plan.storageImageMaxBytes <= 0
    && plan.storageVideoMaxBytes <= 0
    && plan.storageFileMaxBytes <= 0
  ) {
    return null;
  }

  return {
    limitLabel: plan.storageLimitBytes > 0 ? formatStorageBytes(plan.storageLimitBytes) : "Sem limite definido",
    fileLimitLabel: plan.storageFileLimit > 0 ? `${formatCredits(plan.storageFileLimit)} arquivos` : null,
    imageMaxLabel: plan.storageImageMaxBytes > 0 ? `Imagem ate ${formatStorageBytes(plan.storageImageMaxBytes)}` : null,
    videoMaxLabel: plan.storageVideoMaxBytes > 0 ? `Video ate ${formatStorageBytes(plan.storageVideoMaxBytes)}` : null,
    fileMaxLabel: plan.storageFileMaxBytes > 0 ? `Arquivo ate ${formatStorageBytes(plan.storageFileMaxBytes)}` : null,
  };
}

function buildLockedItems(plan: PublicPricingBillingPlan, isTrial: boolean) {
  if (isTrial) {
    return [];
  }

  const moduleSet = new Set(plan.moduleCodes);
  const locked = Object.entries(moduleLabels)
    .filter(([code]) => !moduleSet.has(code))
    .map(([, label]) => label.locked);

  return uniqueStrings(locked).slice(0, 8);
}

function buildGeneratedTagline(plan: PublicPricingBillingPlan) {
  const parts = [
    plan.agentLimit !== null ? pluralize(plan.agentLimit, "agente", "agentes") : null,
    plan.whatsappInstanceLimit !== null ? pluralize(plan.whatsappInstanceLimit, "WhatsApp", "WhatsApps") : null,
    plan.includedCredits > 0 ? `${formatCredits(plan.includedCredits)} creditos` : null,
    plan.storageLimitBytes > 0 ? `${formatStorageBytes(plan.storageLimitBytes)} storage` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" + ") : "Oferta comercial configurada no admin";
}

function pluralize(value: number, singular: string, plural: string) {
  return `${formatCredits(value)} ${value === 1 ? singular : plural}`;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatStorageBytes(value: number) {
  const bytes = Math.max(0, Number.isFinite(value) ? value : 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let nextValue = bytes;
  let unitIndex = 0;

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = nextValue >= 10 || unitIndex === 0 ? 0 : 1;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(nextValue)} ${units[unitIndex]}`;
}

function formatModuleCode(value: string) {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}
