export type SalesCatalogItemStatus = "active" | "draft" | "archived";
export type SalesCatalogMediaKind = "image" | "video" | "document";
export type SalesCatalogSource = "manual" | "whatsapp_catalog";
export type SalesCatalogBusinessType = "simple" | "fashion" | "physical" | "services" | "digital" | "food";
export type SalesCatalogShippingProfile = "default" | "free" | "custom";
export type SalesCatalogShippingProvider = "correios" | "carrier";
export type SalesCatalogPaymentMethodId = "pix" | "card_link" | "boleto" | "cash_on_delivery" | "manual";
export type SalesCatalogReservationPolicy = "after_payment" | "before_payment" | "manual_approval";
export type SalesCatalogLeadDataField = "name" | "phone" | "cep" | "address" | "cpf_cnpj" | "email";
export type SalesCatalogStockStatus = "in_stock" | "out_of_stock" | "on_backorder";
export type SalesCatalogFulfillmentMode = "physical" | "digital" | "service" | "subscription";
export type SalesCatalogOrderStatus = "draft" | "pending_payment" | "paid" | "in_preparation" | "shipped" | "delivered" | "cancelled" | "needs_human";
export type SalesCatalogPaymentStatus = "pending" | "proof_sent" | "confirmed" | "failed" | "refunded";
export type SalesCatalogFulfillmentStatus = "pending" | "scheduled" | "in_progress" | "fulfilled" | "cancelled";
export type SalesCatalogSkuStatus = "active" | "draft" | "archived";
export type SalesCatalogPaymentProvider = "mercado_pago";
export type SalesCatalogPaymentIntegrationStatus = "pending" | "connected" | "disabled" | "error";
export type SalesCatalogPaymentIntegrationMode = "production" | "sandbox";
export type SalesCatalogPaymentSessionMethod = "pix" | "card" | "checkout_link";
export type SalesCatalogPaymentSessionStatus = "created" | "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "error";
export type SalesCatalogProductOriginType = "client" | "connectyhub" | "external_provider";
export type SalesCatalogCommercialFlowType = "client_direct" | "connectyhub_resale" | "connectyhub_direct" | "external_marketplace";
export type SalesCatalogRevenueOwnerType = "client" | "connectyhub" | "split" | "external_provider";
export type SalesCatalogCommissionPolicyType = "none" | "percentage" | "fixed" | "custom";

export type SalesCatalogAttribute = {
  id: string;
  name: string;
  values: string[];
  required: boolean;
};

export type SalesCatalogItemAttribute = {
  id: string;
  name: string;
  values: string[];
};

export type SalesCatalogPaymentMethod = {
  id: SalesCatalogPaymentMethodId;
  label: string;
  enabled: boolean;
  instructions: string | null;
  requiresProof: boolean;
};

export type SalesCatalogOrderPolicy = {
  minimumOrderValue: string | null;
  reservationPolicy: SalesCatalogReservationPolicy;
  allowOrderWithoutPayment: boolean;
  requireHumanConfirmation: boolean;
  askCepBeforeQuote: boolean;
  abandonedCartMinutes: number | null;
  followUpDays: number | null;
};

export type SalesCatalogLeadDataPolicy = {
  requiredFields: SalesCatalogLeadDataField[];
  consentMessage: string | null;
  retentionDays: number | null;
};

export type SalesCatalogWhatsAppMessageTemplates = {
  orderSummary: string;
  paymentRequest: string;
  paymentConfirmed: string;
  unavailableItem: string;
  humanHandoff: string;
};

export type SalesCatalogProductInventory = {
  status: SalesCatalogStockStatus;
  quantity: number | null;
  lowStockThreshold: number | null;
  allowBackorder: boolean;
  notes: string | null;
};

export type SalesCatalogProductOffer = {
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  couponCode: string | null;
  couponDescription: string | null;
  callToAction: string | null;
  notes: string | null;
};

export type SalesCatalogProductFulfillment = {
  mode: SalesCatalogFulfillmentMode;
  schedulingRequired: boolean;
  serviceDuration: string | null;
  deliveryInstructions: string | null;
  accessInstructions: string | null;
};

export type SalesCatalogMedia = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  storageUrl: string;
  kind: SalesCatalogMediaKind;
  createdAt: string | null;
};

export type SalesCatalogProductDimensions = {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
};

export type SalesCatalogProductShipping = {
  weightGrams: number | null;
  dimensions: SalesCatalogProductDimensions;
  profile: SalesCatalogShippingProfile;
  notes: string | null;
};

export type SalesCatalogSku = {
  id: string | null;
  companyId: string;
  catalogItemId: string | null;
  skuCode: string;
  title: string | null;
  attributes: SalesCatalogItemAttribute[];
  price: string | null;
  salePrice: string | null;
  currency: string;
  stockStatus: SalesCatalogStockStatus;
  stockQuantity: number | null;
  lowStockThreshold: number | null;
  weightGrams: number | null;
  dimensions: SalesCatalogProductDimensions;
  mediaIds: string[];
  status: SalesCatalogSkuStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SalesCatalogShippingWeightTier = {
  id: string;
  name: string;
  active: boolean;
  maxWeightGrams: number | null;
  price: string | null;
  minDays: number | null;
  maxDays: number | null;
};

export type SalesCatalogShippingService = {
  id: string;
  provider: SalesCatalogShippingProvider;
  name: string;
  active: boolean;
  tiers: SalesCatalogShippingWeightTier[];
};

export type ClientSalesCatalogItem = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: string | null;
  price: string | null;
  currency: string;
  status: SalesCatalogItemStatus;
  tag: string;
  media: SalesCatalogMedia[];
  attributes: SalesCatalogItemAttribute[];
  inventory: SalesCatalogProductInventory;
  skus: SalesCatalogSku[];
  offer: SalesCatalogProductOffer;
  fulfillment: SalesCatalogProductFulfillment;
  shipping: SalesCatalogProductShipping;
  productOriginType: SalesCatalogProductOriginType;
  commercialFlowType: SalesCatalogCommercialFlowType;
  revenueOwnerType: SalesCatalogRevenueOwnerType;
  commissionPolicyType: SalesCatalogCommissionPolicyType;
  commissionEligible: boolean;
  platformProductId: string | null;
  platformProductCode: string | null;
  platformProductCommissionPercentage: number | null;
  platformProductCommissionReleaseDays: number | null;
  platformProductAgentPrompt: string | null;
  source: SalesCatalogSource;
  whatsappCatalogId: string | null;
  whatsappCatalogJid: string | null;
  whatsappCatalogHidden: boolean;
  whatsappCatalogStatus: string | null;
  whatsappCatalogSyncedAt: string | null;
  readiness: "ready" | "needs_media" | "needs_description";
  createdAt: string | null;
  updatedAt: string | null;
};

export type ClientSalesCatalogOrderItem = {
  id: string;
  orderId: string;
  companyId: string;
  catalogItemId: string | null;
  skuId: string | null;
  skuCode: string | null;
  title: string;
  tag: string | null;
  quantity: number;
  unitPrice: string | null;
  salePrice: string | null;
  total: string | null;
  attributes: SalesCatalogItemAttribute[];
  fulfillment: SalesCatalogProductFulfillment;
  productOriginType: SalesCatalogProductOriginType;
  commercialFlowType: SalesCatalogCommercialFlowType;
  revenueOwnerType: SalesCatalogRevenueOwnerType;
  commissionEligible: boolean;
  platformProductId: string | null;
  platformProductCode: string | null;
  platformProductCommissionPercentage: number | null;
  platformProductCommissionReleaseDays: number | null;
  createdAt: string | null;
};

export type ClientSalesCatalogOrder = {
  id: string;
  companyId: string;
  leadId: string | null;
  conversationId: string | null;
  source: string;
  status: SalesCatalogOrderStatus;
  paymentStatus: SalesCatalogPaymentStatus;
  fulfillmentStatus: SalesCatalogFulfillmentStatus;
  customerName: string | null;
  customerPhone: string | null;
  customerDocument: string | null;
  customerEmail: string | null;
  destinationCep: string | null;
  destinationAddress: string | null;
  subtotal: string | null;
  discountTotal: string | null;
  shippingTotal: string | null;
  total: string | null;
  paymentMethod: string | null;
  shippingMethod: string | null;
  agentNotes: string | null;
  internalNotes: string | null;
  latestPaymentSessionId: string | null;
  commercialFlowType: SalesCatalogCommercialFlowType;
  revenueOwnerType: SalesCatalogRevenueOwnerType;
  containsPlatformProducts: boolean;
  commissionEligible: boolean;
  inventoryDeductedAt: string | null;
  inventoryRestoredAt: string | null;
  paymentWhatsappNotifiedAt: string | null;
  inventoryDeductedItems: number;
  inventoryRestoredItems: number;
  items: ClientSalesCatalogOrderItem[];
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ClientSalesCatalogPaymentIntegration = {
  id: string;
  companyId: string;
  provider: SalesCatalogPaymentProvider;
  mode: SalesCatalogPaymentIntegrationMode;
  status: SalesCatalogPaymentIntegrationStatus;
  accountLabel: string | null;
  providerAccountId: string | null;
  publicKey: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  lastError: string | null;
  webhookUrl: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasWebhookSecret: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ClientSalesCatalogPaymentSession = {
  id: string;
  companyId: string;
  orderId: string;
  integrationId: string | null;
  provider: SalesCatalogPaymentProvider;
  method: SalesCatalogPaymentSessionMethod;
  status: SalesCatalogPaymentSessionStatus;
  amount: string;
  currency: string;
  payerEmail: string | null;
  providerPaymentId: string | null;
  providerStatus: string | null;
  providerStatusDetail: string | null;
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  externalReference: string;
  expiresAt: string | null;
  paidAt: string | null;
  failureReason: string | null;
  paymentOwnerType: SalesCatalogRevenueOwnerType;
  commercialFlowType: SalesCatalogCommercialFlowType;
  revenueOwnerType: SalesCatalogRevenueOwnerType;
  commissionEligible: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SalesCatalogShippingRule = {
  uf: string;
  state: string;
  active: boolean;
  cepStart: string | null;
  cepEnd: string | null;
  price: string | null;
  minDays: number | null;
  maxDays: number | null;
  freeShippingThreshold: string | null;
  services: SalesCatalogShippingService[];
  notes: string | null;
};

export type ClientSalesCatalogShippingSettings = {
  id: string;
  companyId: string;
  configured: boolean;
  localPickup: boolean;
  originCep: string | null;
  defaultHandlingDays: number | null;
  rules: SalesCatalogShippingRule[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type SalesCatalogShippingDestination = {
  cep: string;
  uf: string;
  state: string;
};

export type SalesCatalogShippingQuote = {
  serviceId: string;
  serviceName: string;
  provider: SalesCatalogShippingProvider | "manual";
  price: string;
  minDays: number | null;
  maxDays: number | null;
  uf: string;
  state: string;
  cep: string;
  weightGrams: number;
  weightSource: "product" | "default";
  notes: string | null;
};

export type ClientSalesCatalogSettings = {
  id: string;
  companyId: string;
  configured: boolean;
  businessType: SalesCatalogBusinessType;
  categories: string[];
  attributes: SalesCatalogAttribute[];
  trackInventory: boolean;
  variationMedia: boolean;
  paymentMethods: SalesCatalogPaymentMethod[];
  orderPolicy: SalesCatalogOrderPolicy;
  leadDataPolicy: SalesCatalogLeadDataPolicy;
  messageTemplates: SalesCatalogWhatsAppMessageTemplates;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SalesCatalogCommerceSettings = Pick<
  ClientSalesCatalogSettings,
  "paymentMethods" | "orderPolicy" | "leadDataPolicy" | "messageTemplates"
>;

export const salesCatalogPaymentMethodTemplates: SalesCatalogPaymentMethod[] = [
  {
    id: "pix",
    label: "Pix",
    enabled: true,
    instructions: "Enviar chave Pix, valor e pedir comprovante na mesma conversa.",
    requiresProof: true,
  },
  {
    id: "card_link",
    label: "Cartao por link",
    enabled: false,
    instructions: "Enviar link de pagamento depois de confirmar produto, frete e dados do lead.",
    requiresProof: false,
  },
  {
    id: "boleto",
    label: "Boleto",
    enabled: false,
    instructions: "Gerar boleto somente depois de confirmar dados do lead.",
    requiresProof: false,
  },
  {
    id: "cash_on_delivery",
    label: "Pagamento na entrega",
    enabled: false,
    instructions: "Confirmar endereco, disponibilidade e taxa antes de concluir o pedido.",
    requiresProof: false,
  },
  {
    id: "manual",
    label: "Combinar com atendente",
    enabled: true,
    instructions: "Acionar humano quando o lead pedir condicao especial, desconto ou contrato.",
    requiresProof: false,
  },
];

export const salesCatalogLeadDataFields: Array<{ value: SalesCatalogLeadDataField; label: string }> = [
  { value: "name", label: "Nome" },
  { value: "phone", label: "Telefone" },
  { value: "cep", label: "CEP" },
  { value: "address", label: "Endereco" },
  { value: "cpf_cnpj", label: "CPF/CNPJ" },
  { value: "email", label: "E-mail" },
];

export function createDefaultSalesCatalogOrderPolicy(): SalesCatalogOrderPolicy {
  return {
    minimumOrderValue: null,
    reservationPolicy: "manual_approval",
    allowOrderWithoutPayment: false,
    requireHumanConfirmation: false,
    askCepBeforeQuote: false,
    abandonedCartMinutes: null,
    followUpDays: null,
  };
}

export function createDefaultSalesCatalogLeadDataPolicy(): SalesCatalogLeadDataPolicy {
  return {
    requiredFields: [],
    consentMessage: null,
    retentionDays: null,
  };
}

export function createDefaultSalesCatalogMessageTemplates(): SalesCatalogWhatsAppMessageTemplates {
  return {
    orderSummary: "",
    paymentRequest: "",
    paymentConfirmed: "",
    unavailableItem: "",
    humanHandoff: "",
  };
}

export function createDefaultSalesCatalogCommerceSettings(): SalesCatalogCommerceSettings {
  return {
    paymentMethods: salesCatalogPaymentMethodTemplates.map((method) => ({
      ...method,
      enabled: false,
      instructions: null,
      requiresProof: false,
    })),
    orderPolicy: createDefaultSalesCatalogOrderPolicy(),
    leadDataPolicy: createDefaultSalesCatalogLeadDataPolicy(),
    messageTemplates: createDefaultSalesCatalogMessageTemplates(),
  };
}

export type SalesCatalogContentInput = {
  title: string;
  description: string;
  category?: string | null;
  price?: string | null;
  currency?: string | null;
  media?: SalesCatalogMedia[];
  attributes?: SalesCatalogItemAttribute[];
  inventory?: SalesCatalogProductInventory | null;
  offer?: SalesCatalogProductOffer | null;
  fulfillment?: SalesCatalogProductFulfillment | null;
  shipping?: SalesCatalogProductShipping | null;
};

export const brazilianStates: Array<{ uf: string; state: string }> = [
  { uf: "AC", state: "Acre" },
  { uf: "AL", state: "Alagoas" },
  { uf: "AP", state: "Amapa" },
  { uf: "AM", state: "Amazonas" },
  { uf: "BA", state: "Bahia" },
  { uf: "CE", state: "Ceara" },
  { uf: "DF", state: "Distrito Federal" },
  { uf: "ES", state: "Espirito Santo" },
  { uf: "GO", state: "Goias" },
  { uf: "MA", state: "Maranhao" },
  { uf: "MT", state: "Mato Grosso" },
  { uf: "MS", state: "Mato Grosso do Sul" },
  { uf: "MG", state: "Minas Gerais" },
  { uf: "PA", state: "Para" },
  { uf: "PB", state: "Paraiba" },
  { uf: "PR", state: "Parana" },
  { uf: "PE", state: "Pernambuco" },
  { uf: "PI", state: "Piaui" },
  { uf: "RJ", state: "Rio de Janeiro" },
  { uf: "RN", state: "Rio Grande do Norte" },
  { uf: "RS", state: "Rio Grande do Sul" },
  { uf: "RO", state: "Rondonia" },
  { uf: "RR", state: "Roraima" },
  { uf: "SC", state: "Santa Catarina" },
  { uf: "SP", state: "Sao Paulo" },
  { uf: "SE", state: "Sergipe" },
  { uf: "TO", state: "Tocantins" },
];

export const salesCatalogShippingServiceTemplates: SalesCatalogShippingService[] = [
  {
    id: "correios_pac",
    provider: "correios",
    name: "Correios PAC",
    active: false,
    tiers: [
      { id: "pac_300g", name: "Ate 300 g", active: true, maxWeightGrams: 300, price: null, minDays: null, maxDays: null },
      { id: "pac_1kg", name: "Ate 1 kg", active: true, maxWeightGrams: 1000, price: null, minDays: null, maxDays: null },
      { id: "pac_5kg", name: "Ate 5 kg", active: true, maxWeightGrams: 5000, price: null, minDays: null, maxDays: null },
    ],
  },
  {
    id: "correios_sedex",
    provider: "correios",
    name: "Correios Sedex",
    active: false,
    tiers: [
      { id: "sedex_300g", name: "Ate 300 g", active: true, maxWeightGrams: 300, price: null, minDays: null, maxDays: null },
      { id: "sedex_1kg", name: "Ate 1 kg", active: true, maxWeightGrams: 1000, price: null, minDays: null, maxDays: null },
      { id: "sedex_5kg", name: "Ate 5 kg", active: true, maxWeightGrams: 5000, price: null, minDays: null, maxDays: null },
    ],
  },
  {
    id: "transportadora",
    provider: "carrier",
    name: "Transportadora",
    active: false,
    tiers: [
      { id: "carrier_1kg", name: "Ate 1 kg", active: true, maxWeightGrams: 1000, price: null, minDays: null, maxDays: null },
      { id: "carrier_5kg", name: "Ate 5 kg", active: true, maxWeightGrams: 5000, price: null, minDays: null, maxDays: null },
      { id: "carrier_10kg", name: "Ate 10 kg", active: true, maxWeightGrams: 10000, price: null, minDays: null, maxDays: null },
    ],
  },
];

export const defaultSalesCatalogShippingRules: SalesCatalogShippingRule[] = brazilianStates.map((state) => ({
  ...state,
  active: false,
  cepStart: null,
  cepEnd: null,
  price: null,
  minDays: null,
  maxDays: null,
  freeShippingThreshold: null,
  services: createDefaultSalesCatalogShippingServices(),
  notes: null,
}));

export const salesCatalogBusinessTemplates: Array<{
  value: SalesCatalogBusinessType;
  label: string;
  categories: string[];
  attributes: SalesCatalogAttribute[];
  trackInventory: boolean;
  variationMedia: boolean;
}> = [
  {
    value: "fashion",
    label: "Moda / roupas",
    categories: ["Camisetas", "Moletons", "Calcas", "Vestidos", "Calcados", "Acessorios"],
    attributes: [
      { id: "size", name: "Tamanho", values: ["PP", "P", "M", "G", "GG", "XG"], required: true },
      { id: "color", name: "Cor", values: ["Preto", "Branco", "Azul", "Vermelho", "Verde"], required: true },
      { id: "gender", name: "Publico", values: ["Masculino", "Feminino", "Unissex", "Infantil"], required: false },
      { id: "material", name: "Material", values: ["Algodao", "Poliester", "Jeans", "Moletom"], required: false },
    ],
    trackInventory: true,
    variationMedia: true,
  },
  {
    value: "physical",
    label: "Produtos fisicos",
    categories: ["Produtos", "Kits", "Acessorios", "Reposicao", "Lancamentos"],
    attributes: [
      { id: "brand", name: "Marca", values: ["Marca propria"], required: false },
      { id: "model", name: "Modelo", values: ["Padrao"], required: false },
      { id: "condition", name: "Condicao", values: ["Novo", "Seminovo", "Usado"], required: false },
      { id: "capacity", name: "Capacidade", values: ["Pequeno", "Medio", "Grande"], required: false },
    ],
    trackInventory: true,
    variationMedia: true,
  },
  {
    value: "services",
    label: "Servicos",
    categories: ["Consulta", "Plano mensal", "Projeto", "Suporte", "Instalacao"],
    attributes: [
      { id: "duration", name: "Duracao", values: ["30 min", "1 hora", "Mensal", "Projeto fechado"], required: false },
      { id: "format", name: "Formato", values: ["Online", "Presencial", "Hibrido"], required: false },
      { id: "urgency", name: "Prazo", values: ["Padrao", "Prioritario", "Emergencial"], required: false },
    ],
    trackInventory: false,
    variationMedia: false,
  },
  {
    value: "digital",
    label: "Curso / infoproduto",
    categories: ["Curso", "Mentoria", "Comunidade", "E-book", "Template"],
    attributes: [
      { id: "access", name: "Acesso", values: ["Vitalicio", "12 meses", "Mensal"], required: false },
      { id: "level", name: "Nivel", values: ["Iniciante", "Intermediario", "Avancado"], required: false },
      { id: "format", name: "Formato", values: ["Gravado", "Ao vivo", "Material digital"], required: false },
    ],
    trackInventory: false,
    variationMedia: false,
  },
  {
    value: "food",
    label: "Cardapio / alimentos",
    categories: ["Pratos", "Bebidas", "Sobremesas", "Combos", "Adicionais"],
    attributes: [
      { id: "size", name: "Tamanho", values: ["Pequeno", "Medio", "Grande", "Familia"], required: false },
      { id: "flavor", name: "Sabor", values: ["Tradicional", "Especial", "Picante"], required: false },
      { id: "temperature", name: "Temperatura", values: ["Quente", "Gelado"], required: false },
    ],
    trackInventory: false,
    variationMedia: true,
  },
  {
    value: "simple",
    label: "Catalogo simples",
    categories: ["Produtos", "Servicos", "Ofertas", "Kits"],
    attributes: [
      { id: "type", name: "Tipo", values: ["Produto", "Servico", "Kit"], required: false },
      { id: "availability", name: "Disponibilidade", values: ["Disponivel", "Sob encomenda", "Esgotado"], required: false },
    ],
    trackInventory: false,
    variationMedia: false,
  },
];

export function createSalesCatalogSlug(label: string) {
  const slug = label
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);

  return slug || "produto";
}

export function createSalesCatalogTag(label: string, id: string) {
  return `{{produto_${createSalesCatalogSlug(label)}_${id.slice(0, 6)}}}`;
}

export function resolveSalesCatalogMediaKind(contentType: string, fileName = ""): SalesCatalogMediaKind {
  const lowerType = contentType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowerName)) {
    return "image";
  }

  if (lowerType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lowerName)) {
    return "video";
  }

  return "document";
}

export function emptySalesCatalogProductShipping(): SalesCatalogProductShipping {
  return {
    weightGrams: null,
    dimensions: {
      lengthCm: null,
      widthCm: null,
      heightCm: null,
    },
    profile: "default",
    notes: null,
  };
}

export function createDefaultSalesCatalogSku(input: {
  companyId?: string;
  catalogItemId?: string | null;
  skuCode?: string | null;
  title?: string | null;
  price?: string | null;
  salePrice?: string | null;
  currency?: string | null;
  stockStatus?: SalesCatalogStockStatus;
  stockQuantity?: number | null;
  weightGrams?: number | null;
  dimensions?: SalesCatalogProductDimensions;
} = {}): SalesCatalogSku {
  return {
    id: null,
    companyId: input.companyId ?? "",
    catalogItemId: input.catalogItemId ?? null,
    skuCode: input.skuCode?.trim() || "SKU",
    title: input.title ?? null,
    attributes: [],
    price: input.price ?? null,
    salePrice: input.salePrice ?? null,
    currency: input.currency ?? "BRL",
    stockStatus: input.stockStatus ?? "in_stock",
    stockQuantity: input.stockQuantity ?? null,
    lowStockThreshold: null,
    weightGrams: input.weightGrams ?? null,
    dimensions: input.dimensions ?? { lengthCm: null, widthCm: null, heightCm: null },
    mediaIds: [],
    status: "active",
    createdAt: null,
    updatedAt: null,
  };
}

export function emptySalesCatalogProductInventory(): SalesCatalogProductInventory {
  return {
    status: "in_stock",
    quantity: null,
    lowStockThreshold: null,
    allowBackorder: false,
    notes: null,
  };
}

export function emptySalesCatalogProductOffer(): SalesCatalogProductOffer {
  return {
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    couponCode: null,
    couponDescription: null,
    callToAction: null,
    notes: null,
  };
}

export function emptySalesCatalogProductFulfillment(): SalesCatalogProductFulfillment {
  return {
    mode: "physical",
    schedulingRequired: false,
    serviceDuration: null,
    deliveryInstructions: null,
    accessInstructions: null,
  };
}

export function createDefaultSalesCatalogShippingServices(): SalesCatalogShippingService[] {
  return salesCatalogShippingServiceTemplates.map((service) => ({
    ...service,
    tiers: service.tiers.map((tier) => ({ ...tier })),
  }));
}

export function formatSalesCatalogWeight(weightGrams: number) {
  if (weightGrams >= 1000) {
    return `${(weightGrams / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
  }

  return `${weightGrams.toLocaleString("pt-BR")} g`;
}

export function formatSalesCatalogShippingProfile(profile: SalesCatalogShippingProfile) {
  if (profile === "free") return "frete gratis";
  if (profile === "custom") return "frete combinado no atendimento";
  return "usar tabela de frete por estado";
}

export function buildSalesCatalogContent(input: SalesCatalogContentInput) {
  const lines = [
    `Produto/oferta: ${input.title}`,
    input.category ? `Categoria: ${input.category}` : "",
    input.price ? `Preco: ${input.price}${input.currency ? ` ${input.currency}` : ""}` : "",
    input.description ? `Descricao: ${input.description}` : "",
  ];
  const attributes = input.attributes ?? [];
  const media = input.media ?? [];
  const inventory = input.inventory ?? emptySalesCatalogProductInventory();
  const offer = input.offer ?? emptySalesCatalogProductOffer();
  const fulfillment = input.fulfillment ?? emptySalesCatalogProductFulfillment();
  const shipping = input.shipping ?? emptySalesCatalogProductShipping();
  const inventoryLines = buildInventoryLines(inventory);
  const offerLines = buildOfferLines(offer);
  const fulfillmentLines = buildFulfillmentLines(fulfillment);
  const shippingLines = buildShippingLines(shipping);

  if (attributes.length > 0) {
    lines.push("Variacoes disponiveis:");
    for (const item of attributes) {
      if (item.values.length > 0) {
        lines.push(`- ${item.name}: ${item.values.join(", ")}`);
      }
    }
  }

  if (media.length > 0) {
    lines.push("Arquivos disponiveis:");
    for (const item of media) {
      lines.push(`- ${item.kind}: ${item.fileName} (${item.storageUrl})`);
    }
  }

  if (inventoryLines.length > 0) {
    lines.push("Estoque e disponibilidade:");
    lines.push(...inventoryLines);
  }

  if (offerLines.length > 0) {
    lines.push("Oferta comercial:");
    lines.push(...offerLines);
  }

  if (fulfillmentLines.length > 0) {
    lines.push("Entrega/execucao:");
    lines.push(...fulfillmentLines);
  }

  if (shippingLines.length > 0) {
    lines.push("Entrega e frete:");
    lines.push(...shippingLines);
  }

  return lines.filter(Boolean).join("\n");
}

export function getSalesCatalogReadiness(input: { description: string; media: SalesCatalogMedia[] }) {
  if (!input.description.trim()) return "needs_description" as const;
  if (input.media.length === 0) return "needs_media" as const;
  return "ready" as const;
}

export function formatSalesCatalogInline(item: ClientSalesCatalogItem) {
  const lines = [
    item.title,
    item.price ? `Valor: ${item.price}${item.currency ? ` ${item.currency}` : ""}` : "",
    item.description,
  ];
  const attributes = item.attributes.filter((attribute) => attribute.values.length > 0);
  const media = item.media.slice(0, 4);
  const inventoryLines = buildInventoryLines(item.inventory);
  const offerLines = buildOfferLines(item.offer);
  const fulfillmentLines = buildFulfillmentLines(item.fulfillment);
  const shippingLines = buildShippingLines(item.shipping);

  if (attributes.length > 0) {
    lines.push("Variacoes disponiveis:");
    for (const attribute of attributes) {
      lines.push(`- ${attribute.name}: ${attribute.values.join(", ")}`);
    }
  }

  if (media.length > 0) {
    lines.push("Arquivos que vou te mandar aqui no WhatsApp:");
    for (const file of media) {
      lines.push(`- ${file.fileName}`);
    }
  }

  if (inventoryLines.length > 0) {
    lines.push("Estoque e disponibilidade:");
    lines.push(...inventoryLines);
  }

  if (offerLines.length > 0) {
    lines.push("Oferta comercial:");
    lines.push(...offerLines);
  }

  if (fulfillmentLines.length > 0) {
    lines.push("Entrega/execucao:");
    lines.push(...fulfillmentLines);
  }

  if (shippingLines.length > 0) {
    lines.push("Entrega e frete:");
    lines.push(...shippingLines);
  }

  return lines.filter(Boolean).join("\n");
}

function buildInventoryLines(inventory: SalesCatalogProductInventory) {
  const lines: string[] = [`- Status: ${formatSalesCatalogStockStatus(inventory.status)}`];

  if (inventory.quantity !== null) {
    lines.push(`- Quantidade disponivel: ${inventory.quantity}`);
  }

  if (inventory.lowStockThreshold !== null) {
    lines.push(`- Alerta de baixo estoque: ${inventory.lowStockThreshold}`);
  }

  if (inventory.allowBackorder) {
    lines.push("- Aceita encomenda quando acabar.");
  }

  if (inventory.notes) {
    lines.push(`- Observacoes: ${inventory.notes}`);
  }

  return lines;
}

export function formatSalesCatalogStockStatus(status: SalesCatalogStockStatus) {
  if (status === "out_of_stock") return "esgotado";
  if (status === "on_backorder") return "sob encomenda";
  return "disponivel";
}

function buildOfferLines(offer: SalesCatalogProductOffer) {
  const lines: string[] = [];

  if (offer.salePrice) {
    lines.push(`- Preco promocional: ${offer.salePrice}`);
  }

  if (offer.saleStartsAt || offer.saleEndsAt) {
    lines.push(`- Validade: ${offer.saleStartsAt ?? "agora"} ate ${offer.saleEndsAt ?? "sem data final"}`);
  }

  if (offer.couponCode) {
    lines.push(`- Cupom: ${offer.couponCode}${offer.couponDescription ? ` (${offer.couponDescription})` : ""}`);
  }

  if (offer.callToAction) {
    lines.push(`- Chamada de venda: ${offer.callToAction}`);
  }

  if (offer.notes) {
    lines.push(`- Condicoes: ${offer.notes}`);
  }

  return lines;
}

function buildFulfillmentLines(fulfillment: SalesCatalogProductFulfillment) {
  const lines: string[] = [`- Tipo: ${formatSalesCatalogFulfillmentMode(fulfillment.mode)}`];

  if (fulfillment.schedulingRequired) {
    lines.push("- Precisa agendamento.");
  }

  if (fulfillment.serviceDuration) {
    lines.push(`- Duracao/prazo: ${fulfillment.serviceDuration}`);
  }

  if (fulfillment.deliveryInstructions) {
    lines.push(`- Entrega: ${fulfillment.deliveryInstructions}`);
  }

  if (fulfillment.accessInstructions) {
    lines.push(`- Acesso/execucao: ${fulfillment.accessInstructions}`);
  }

  return lines;
}

export function formatSalesCatalogFulfillmentMode(mode: SalesCatalogFulfillmentMode) {
  if (mode === "digital") return "digital no WhatsApp";
  if (mode === "service") return "servico/agendamento";
  if (mode === "subscription") return "assinatura/plano";
  return "produto fisico";
}

export function formatSalesCatalogOrderStatus(status: SalesCatalogOrderStatus) {
  if (status === "pending_payment") return "aguardando pagamento";
  if (status === "paid") return "pago";
  if (status === "in_preparation") return "em separacao";
  if (status === "shipped") return "enviado";
  if (status === "delivered") return "entregue";
  if (status === "cancelled") return "cancelado";
  if (status === "needs_human") return "precisa humano";
  return "rascunho";
}

export function formatSalesCatalogPaymentStatus(status: SalesCatalogPaymentStatus) {
  if (status === "proof_sent") return "comprovante enviado";
  if (status === "confirmed") return "confirmado";
  if (status === "failed") return "falhou";
  if (status === "refunded") return "estornado";
  return "pendente";
}

export function formatSalesCatalogPaymentSessionStatus(status: SalesCatalogPaymentSessionStatus) {
  if (status === "approved") return "pago";
  if (status === "rejected") return "recusado";
  if (status === "cancelled") return "cancelado";
  if (status === "expired") return "expirado";
  if (status === "refunded") return "estornado";
  if (status === "error") return "erro";
  if (status === "pending") return "aguardando pagamento";
  return "criado";
}

export function formatSalesCatalogPaymentIntegrationStatus(status: SalesCatalogPaymentIntegrationStatus) {
  if (status === "connected") return "conectado";
  if (status === "disabled") return "desativado";
  if (status === "error") return "erro";
  return "pendente";
}

export function formatSalesCatalogFulfillmentStatus(status: SalesCatalogFulfillmentStatus) {
  if (status === "scheduled") return "agendado";
  if (status === "in_progress") return "em andamento";
  if (status === "fulfilled") return "concluido";
  if (status === "cancelled") return "cancelado";
  return "pendente";
}

function buildShippingLines(shipping: SalesCatalogProductShipping) {
  const lines: string[] = [];
  const dimensions = [
    shipping.dimensions.lengthCm ? `${shipping.dimensions.lengthCm}cm C` : "",
    shipping.dimensions.widthCm ? `${shipping.dimensions.widthCm}cm L` : "",
    shipping.dimensions.heightCm ? `${shipping.dimensions.heightCm}cm A` : "",
  ].filter(Boolean);

  if (shipping.weightGrams) {
    lines.push(`- Peso: ${formatSalesCatalogWeight(shipping.weightGrams)}`);
  }

  if (dimensions.length > 0) {
    lines.push(`- Dimensoes: ${dimensions.join(" x ")}`);
  }

  if (shipping.profile !== "default") {
    lines.push(`- Perfil: ${formatSalesCatalogShippingProfile(shipping.profile)}`);
  }

  if (shipping.notes) {
    lines.push(`- Observacoes: ${shipping.notes}`);
  }

  return lines;
}
