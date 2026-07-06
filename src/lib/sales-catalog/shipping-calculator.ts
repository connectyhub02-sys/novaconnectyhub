import {
  createDefaultSalesCatalogShippingServices,
  formatSalesCatalogWeight,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogShippingSettings,
  type SalesCatalogShippingDestination,
  type SalesCatalogShippingQuote,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
} from "@/lib/sales-catalog/shared";

type CepRange = {
  uf: string;
  state: string;
  start: number;
  end: number;
};

type ShippingCalculationResult = {
  destination: SalesCatalogShippingDestination | null;
  quotes: SalesCatalogShippingQuote[];
  weightGrams: number;
  weightSource: "product" | "default";
  error: string | null;
};

const defaultWeightGrams = 1000;

const cepRanges: CepRange[] = [
  { uf: "SP", state: "Sao Paulo", start: 1000000, end: 19999999 },
  { uf: "RJ", state: "Rio de Janeiro", start: 20000000, end: 28999999 },
  { uf: "ES", state: "Espirito Santo", start: 29000000, end: 29999999 },
  { uf: "MG", state: "Minas Gerais", start: 30000000, end: 39999999 },
  { uf: "BA", state: "Bahia", start: 40000000, end: 48999999 },
  { uf: "SE", state: "Sergipe", start: 49000000, end: 49999999 },
  { uf: "PE", state: "Pernambuco", start: 50000000, end: 56999999 },
  { uf: "AL", state: "Alagoas", start: 57000000, end: 57999999 },
  { uf: "PB", state: "Paraiba", start: 58000000, end: 58999999 },
  { uf: "RN", state: "Rio Grande do Norte", start: 59000000, end: 59999999 },
  { uf: "CE", state: "Ceara", start: 60000000, end: 63999999 },
  { uf: "PI", state: "Piaui", start: 64000000, end: 64999999 },
  { uf: "MA", state: "Maranhao", start: 65000000, end: 65999999 },
  { uf: "PA", state: "Para", start: 66000000, end: 68899999 },
  { uf: "AP", state: "Amapa", start: 68900000, end: 68999999 },
  { uf: "AM", state: "Amazonas", start: 69000000, end: 69299999 },
  { uf: "RR", state: "Roraima", start: 69300000, end: 69399999 },
  { uf: "AM", state: "Amazonas", start: 69400000, end: 69899999 },
  { uf: "AC", state: "Acre", start: 69900000, end: 69999999 },
  { uf: "DF", state: "Distrito Federal", start: 70000000, end: 73699999 },
  { uf: "GO", state: "Goias", start: 73700000, end: 76799999 },
  { uf: "RO", state: "Rondonia", start: 76800000, end: 76999999 },
  { uf: "TO", state: "Tocantins", start: 77000000, end: 77999999 },
  { uf: "MT", state: "Mato Grosso", start: 78000000, end: 78899999 },
  { uf: "MS", state: "Mato Grosso do Sul", start: 79000000, end: 79999999 },
  { uf: "PR", state: "Parana", start: 80000000, end: 87999999 },
  { uf: "SC", state: "Santa Catarina", start: 88000000, end: 89999999 },
  { uf: "RS", state: "Rio Grande do Sul", start: 90000000, end: 99999999 },
];

export function normalizeSalesCatalogCep(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length === 8 ? digits : null;
}

export function resolveBrazilianStateFromCep(value: string): SalesCatalogShippingDestination | null {
  const cep = normalizeSalesCatalogCep(value);
  if (!cep) return null;

  const number = Number(cep);
  const range = cepRanges.find((item) => number >= item.start && number <= item.end);

  return range ? { cep, uf: range.uf, state: range.state } : null;
}

export function calculateSalesCatalogShippingQuotes(input: {
  item: ClientSalesCatalogItem;
  settings: ClientSalesCatalogShippingSettings;
  cep: string;
}): ShippingCalculationResult {
  const cep = normalizeSalesCatalogCep(input.cep);

  if (!cep) {
    return {
      destination: null,
      quotes: [],
      weightGrams: input.item.shipping.weightGrams ?? defaultWeightGrams,
      weightSource: input.item.shipping.weightGrams ? "product" : "default",
      error: "Informe um CEP com 8 digitos.",
    };
  }

  const destination = resolveBrazilianStateFromCep(cep);
  if (!destination) {
    return {
      destination: null,
      quotes: [],
      weightGrams: input.item.shipping.weightGrams ?? defaultWeightGrams,
      weightSource: input.item.shipping.weightGrams ? "product" : "default",
      error: "Nao foi possivel identificar o estado pelo CEP informado.",
    };
  }

  const weightSource = input.item.shipping.weightGrams ? "product" : "default";
  const weightGrams = input.item.shipping.weightGrams ?? defaultWeightGrams;
  const rule = findShippingRule(input.settings.rules, destination);

  if (input.item.shipping.profile === "free") {
    return {
      destination,
      weightGrams,
      weightSource,
      error: null,
      quotes: [manualQuote({ destination, weightGrams, weightSource, price: "R$ 0,00", note: "Produto marcado com frete gratis." })],
    };
  }

  if (input.item.shipping.profile === "custom") {
    return {
      destination,
      weightGrams,
      weightSource,
      error: null,
      quotes: [manualQuote({ destination, weightGrams, weightSource, price: "A combinar", note: "Frete combinado durante o atendimento." })],
    };
  }

  if (!rule?.active) {
    return {
      destination,
      weightGrams,
      weightSource,
      quotes: [],
      error: `Nenhum frete ativo para ${destination.uf}.`,
    };
  }

  const freeShipping = isFreeShippingByThreshold(input.item.price, rule.freeShippingThreshold);
  const quotes = buildServiceQuotes({
    item: input.item,
    rule,
    destination,
    weightGrams,
    weightSource,
    handlingDays: input.settings.defaultHandlingDays,
    freeShipping,
  });

  if (quotes.length === 0 && rule.price) {
    quotes.push(manualQuote({
      destination,
      weightGrams,
      weightSource,
      price: freeShipping ? "R$ 0,00" : rule.price,
      minDays: addHandlingDays(rule.minDays, input.settings.defaultHandlingDays),
      maxDays: addHandlingDays(rule.maxDays, input.settings.defaultHandlingDays),
      note: freeShipping ? `Frete gratis acima de ${rule.freeShippingThreshold}.` : rule.notes,
    }));
  }

  return {
    destination,
    quotes,
    weightGrams,
    weightSource,
    error: quotes.length > 0 ? null : `Nenhuma faixa de peso ativa atende ${formatSalesCatalogWeight(weightGrams)} em ${destination.uf}.`,
  };
}

function findShippingRule(rules: SalesCatalogShippingRule[], destination: SalesCatalogShippingDestination) {
  const destinationNumber = Number(destination.cep);
  const rangeRule = rules.find((rule) => {
    const start = normalizeSalesCatalogCep(rule.cepStart);
    const end = normalizeSalesCatalogCep(rule.cepEnd);

    if (!start || !end) return false;

    const startNumber = Number(start);
    const endNumber = Number(end);
    return destinationNumber >= Math.min(startNumber, endNumber) && destinationNumber <= Math.max(startNumber, endNumber);
  });

  return rangeRule ?? rules.find((rule) => rule.uf === destination.uf) ?? null;
}

function buildServiceQuotes(input: {
  item: ClientSalesCatalogItem;
  rule: SalesCatalogShippingRule;
  destination: SalesCatalogShippingDestination;
  weightGrams: number;
  weightSource: "product" | "default";
  handlingDays: number | null;
  freeShipping: boolean;
}) {
  const services = input.rule.services.length > 0 ? input.rule.services : createDefaultSalesCatalogShippingServices();
  const quotes: SalesCatalogShippingQuote[] = [];

  for (const service of services.filter((item) => item.active)) {
    const tier = findWeightTier(service, input.weightGrams);
    if (!tier?.price && !input.freeShipping) continue;

    quotes.push({
      serviceId: service.id,
      serviceName: service.name,
      provider: service.provider,
      price: input.freeShipping ? "R$ 0,00" : tier?.price ?? "A combinar",
      minDays: addHandlingDays(tier?.minDays ?? input.rule.minDays, input.handlingDays),
      maxDays: addHandlingDays(tier?.maxDays ?? input.rule.maxDays, input.handlingDays),
      uf: input.destination.uf,
      state: input.destination.state,
      cep: input.destination.cep,
      weightGrams: input.weightGrams,
      weightSource: input.weightSource,
      notes: buildQuoteNote(input.item, input.rule, service, tier, input.freeShipping),
    });
  }

  return quotes;
}

function findWeightTier(service: SalesCatalogShippingService, weightGrams: number) {
  const tiers = service.tiers
    .filter((tier) => tier.active && tier.maxWeightGrams !== null)
    .sort((a, b) => (a.maxWeightGrams ?? 0) - (b.maxWeightGrams ?? 0));

  return tiers.find((tier) => weightGrams <= (tier.maxWeightGrams ?? 0)) ?? null;
}

function manualQuote(input: {
  destination: SalesCatalogShippingDestination;
  weightGrams: number;
  weightSource: "product" | "default";
  price: string;
  minDays?: number | null;
  maxDays?: number | null;
  note: string | null;
}): SalesCatalogShippingQuote {
  return {
    serviceId: "manual",
    serviceName: "Frete",
    provider: "manual",
    price: input.price,
    minDays: input.minDays ?? null,
    maxDays: input.maxDays ?? null,
    uf: input.destination.uf,
    state: input.destination.state,
    cep: input.destination.cep,
    weightGrams: input.weightGrams,
    weightSource: input.weightSource,
    notes: input.note,
  };
}

function addHandlingDays(value: number | null, handlingDays: number | null) {
  if (value === null) return handlingDays;
  return value + (handlingDays ?? 0);
}

function buildQuoteNote(
  item: ClientSalesCatalogItem,
  rule: SalesCatalogShippingRule,
  service: SalesCatalogShippingService,
  tier: SalesCatalogShippingWeightTier | null,
  freeShipping: boolean,
) {
  const notes = [
    item.shipping.notes,
    rule.notes,
    tier ? `Faixa: ${tier.name}` : null,
    freeShipping ? `Frete gratis acima de ${rule.freeShippingThreshold}.` : null,
    service.provider === "correios" ? "Tabela configurada para Correios." : "Tabela configurada para transportadora.",
  ].filter(Boolean);

  return notes.length > 0 ? notes.join(" ") : null;
}

function isFreeShippingByThreshold(price: string | null, threshold: string | null) {
  const priceCents = parseCurrencyCents(price);
  const thresholdCents = parseCurrencyCents(threshold);

  return priceCents !== null && thresholdCents !== null && priceCents >= thresholdCents;
}

function parseCurrencyCents(value: string | null) {
  const raw = value?.trim() ?? "";
  if (!raw) return null;

  const normalized = raw.replace(/[^\d,.-]/g, "");
  const decimalSeparator = normalized.lastIndexOf(",") > normalized.lastIndexOf(".") ? "," : ".";
  const separatorIndex = normalized.lastIndexOf(decimalSeparator);

  if (separatorIndex >= 0) {
    const integer = normalized.slice(0, separatorIndex).replace(/\D/g, "");
    const decimal = normalized.slice(separatorIndex + 1).replace(/\D/g, "");
    if (decimal.length > 0 && decimal.length <= 2) {
      return (Number(integer || "0") * 100) + Number(decimal.padEnd(2, "0"));
    }
  }

  const digits = normalized.replace(/\D/g, "");
  return digits ? Number(digits) * 100 : null;
}
