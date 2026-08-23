"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CloudDownload,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquareText,
  PackagePlus,
  PencilLine,
  Plus,
  RefreshCw,
  QrCode,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Tags,
  Trash2,
  Truck,
  Upload,
  Video,
  X,
} from "lucide-react";
import { HelpHint } from "./guided-help";
import { NeonBadge, PageHeader, Panel } from "./panel-primitives";
import type { ClientCompany } from "@/lib/client-os/companies";
import {
  brazilianStates,
  createDefaultSalesCatalogCommerceSettings,
  defaultSalesCatalogShippingRules,
  defaultSalesCatalogAbandonedCheckoutMinutes,
  formatSalesCatalogFulfillmentStatus,
  formatSalesCatalogFulfillmentMode,
  formatSalesCatalogOrderStatus,
  formatSalesCatalogPaymentStatus,
  formatSalesCatalogPaymentSessionStatus,
  formatSalesCatalogSalesDestination,
  formatSalesCatalogStockStatus,
  formatSalesCatalogWeight,
  resolveSalesCatalogCheckoutStatus,
  salesCatalogLeadDataFields,
  salesCatalogBusinessTemplates,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogOrder,
  type ClientSalesCatalogPaymentIntegration,
  type ClientSalesCatalogPaymentSession,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogShippingSettings,
  type ClientSalesCatalogWhatsappInstance,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogCheckoutStage,
  type SalesCatalogCommercialFlowType,
  type SalesCatalogFulfillmentStatus,
  type SalesCatalogItemAttribute,
  type SalesCatalogItemStatus,
  type SalesCatalogLeadDataField,
  type SalesCatalogMedia,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogOrderStatus,
  type SalesCatalogOrderPolicy,
  type SalesCatalogPaymentMethod,
  type SalesCatalogPaymentStatus,
  type SalesCatalogPaymentSessionStatus,
  type SalesCatalogRevenueOwnerType,
  type SalesCatalogReservationPolicy,
  type SalesCatalogSalesDestination,
  type SalesCatalogOrderBumpSettings,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
  type SalesCatalogShippingQuote,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogStockStatus,
  type SalesCatalogStorefrontSettings,
  type SalesCatalogWhatsAppMessageTemplates,
} from "@/lib/sales-catalog/shared";
import type {
  ClientSalesCatalogImportJob,
  ClientSalesCatalogImportItem,
  SalesCatalogImportDuplicateAction,
  SalesCatalogImportDestination,
  SalesCatalogImportItemPatch,
  SalesCatalogImportPlatform,
  SalesCatalogImportSourceKind,
  SalesCatalogImportTargetMode,
} from "@/lib/sales-catalog/importer";
import { HighlightLabelInput } from "./highlight-label-input";
import { cn } from "@/lib/utils";

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

const salesCatalogBrowserEventsChannel = "connectyhub:sales-catalog-events";
const salesCatalogAiImportPanelEnabled = false;

function publishSalesCatalogUpdated(input: { companyId: string; itemIds?: string[] }) {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return;
  }

  const channel = new BroadcastChannel(salesCatalogBrowserEventsChannel);
  channel.postMessage({
    companyId: input.companyId,
    itemIds: input.itemIds ?? [],
    type: "sales-catalog-updated",
  });
  channel.close();
}

function publishSalesCatalogItemDeleted(input: { companyId: string; itemId: string }) {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return;
  }

  const channel = new BroadcastChannel(salesCatalogBrowserEventsChannel);
  channel.postMessage({
    companyId: input.companyId,
    itemId: input.itemId,
    type: "sales-catalog-item-deleted",
  });
  channel.close();
}

type SalesCatalogConsoleProps = {
  initialCompanies: ClientCompany[];
  initialItems: ClientSalesCatalogItem[];
  initialOrders: ClientSalesCatalogOrder[];
  initialPaymentIntegrations: ClientSalesCatalogPaymentIntegration[];
  initialPaymentSessions: ClientSalesCatalogPaymentSession[];
  initialSettings: ClientSalesCatalogSettings[];
  initialShippingSettings: ClientSalesCatalogShippingSettings[];
  initialWhatsappInstances: ClientSalesCatalogWhatsappInstance[];
  initialCompanyId: string | null;
};

type CatalogTab = "setup" | "shipping" | "products" | "checkout" | "orders" | "payments" | "whatsapp";
type SalesCatalogProductFormTab = "essential" | "pricing" | "media" | "stock" | "delivery";
type CommercialFlowFilter = "all" | SalesCatalogCommercialFlowType;
type CheckoutStageFilter = "all" | SalesCatalogCheckoutStage;
type SalesCatalogCheckoutRecord = {
  abandonedMinutes: number;
  amount: number;
  customerLabel: string;
  customerPhone: string | null;
  latestAt: string | null;
  order: ClientSalesCatalogOrder;
  paymentSession: ClientSalesCatalogPaymentSession | null;
  status: ReturnType<typeof resolveSalesCatalogCheckoutStatus>;
};
type CatalogImportPatchMap = Record<string, SalesCatalogImportItemPatch>;
type CatalogImportMonitorStatus = ClientSalesCatalogImportJob["status"] | "preparing" | "uploading";
type CatalogImportPreviewItemStatus = "queued" | "scanning" | "ready" | "warning" | "failed";
type CatalogImportPreviewItem = {
  id: string;
  title: string;
  detail: string;
  price: string | null;
  imageUrl: string | null;
  status: CatalogImportPreviewItemStatus;
};
type CatalogImportMonitorState = {
  open: boolean;
  jobId: string | null;
  title: string;
  sourcePlatform: SalesCatalogImportPlatform;
  sourceKind: SalesCatalogImportSourceKind;
  status: CatalogImportMonitorStatus;
  message: string;
  previewItems: CatalogImportPreviewItem[];
  visiblePreviewCount: number;
  errorMessage: string | null;
  startedAt: number;
};

type CatalogImportPlatformOption = {
  value: SalesCatalogImportPlatform;
  label: string;
  description: string;
  sourceKind: SalesCatalogImportSourceKind;
  acceptedSourceKinds: SalesCatalogImportSourceKind[];
  accept: string;
  fileTypeLabel: string;
  fileExample: string;
  defaultTitle?: string;
};

const catalogImportPlatformOptions: CatalogImportPlatformOption[] = [
  {
    value: "auto",
    label: "Detectar automaticamente",
    description: "Use quando nao souber a origem. A ConnectyHub tenta ler pelo tipo do arquivo e pelos campos encontrados.",
    sourceKind: "mixed",
    acceptedSourceKinds: ["text", "csv", "excel", "pdf", "image"],
    accept: ".txt,.md,.csv,.tsv,.json,.pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp,image/*,application/pdf,text/plain,text/csv,application/json",
    fileTypeLabel: "Detectar pelo arquivo",
    fileExample: "Exemplo: CSV, Excel, PDF, foto do cardapio ou TXT com lista de produtos.",
  },
  {
    value: "anota_ai",
    label: "Anota Ai",
    description: "Prioridade para cardapios de delivery. Aceita exportacao, planilha, PDF ou foto do cardapio.",
    sourceKind: "mixed",
    acceptedSourceKinds: ["csv", "excel", "pdf", "image"],
    accept: ".csv,.tsv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf,text/csv,text/tab-separated-values",
    fileTypeLabel: "Exportacao, planilha, PDF ou foto",
    fileExample: "Exemplo: exportacao do cardapio do Anota Ai, planilha de produtos, PDF do menu ou foto legivel do cardapio.",
    defaultTitle: "Cardapio Anota Ai",
  },
  {
    value: "woocommerce",
    label: "WooCommerce",
    description: "CSV exportado do WooCommerce, incluindo preco regular, preco promocional, categorias, estoque e URLs de imagem.",
    sourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    accept: ".csv,text/csv",
    fileTypeLabel: "CSV do WooCommerce",
    fileExample: "Exemplo: Produtos > Exportar > Gerar CSV, com colunas Nome, Preco, Categorias, Estoque, SKU e Imagens.",
    defaultTitle: "Catalogo WooCommerce",
  },
  {
    value: "shopify",
    label: "Shopify",
    description: "CSV de produtos e variantes do Shopify. Imagens dependem de URLs publicas no arquivo.",
    sourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    accept: ".csv,text/csv",
    fileTypeLabel: "CSV do Shopify",
    fileExample: "Exemplo: exportacao Products CSV do Shopify com Handle, Title, Variant Price, Image Src e variantes.",
    defaultTitle: "Catalogo Shopify",
  },
  {
    value: "wix",
    label: "Wix Stores",
    description: "Exportacao do Wix Stores com produtos, precos e links. Fotos entram se houver URL acessivel.",
    sourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    accept: ".csv,text/csv",
    fileTypeLabel: "CSV do Wix Stores",
    fileExample: "Exemplo: arquivo CSV exportado do Wix Stores com nome, descricao, preco, SKU e imagens publicas.",
    defaultTitle: "Catalogo Wix",
  },
  {
    value: "nuvemshop",
    label: "Nuvemshop",
    description: "Exportacao de produtos da Nuvemshop. A IA revisa nomes, variacoes e precos antes de publicar.",
    sourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    accept: ".csv,text/csv",
    fileTypeLabel: "CSV da Nuvemshop",
    fileExample: "Exemplo: exportacao de produtos da Nuvemshop em CSV com nome, preco, estoque, variantes e imagens.",
    defaultTitle: "Catalogo Nuvemshop",
  },
  {
    value: "loja_integrada",
    label: "Loja Integrada",
    description: "CSV de produtos da Loja Integrada, com suporte a categorias, estoque e links externos.",
    sourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    accept: ".csv,text/csv",
    fileTypeLabel: "CSV da Loja Integrada",
    fileExample: "Exemplo: exportacao de produtos da Loja Integrada em CSV com nome, categoria, preco, estoque e URL.",
    defaultTitle: "Catalogo Loja Integrada",
  },
  {
    value: "tray",
    label: "Tray",
    description: "CSV Tray. Produtos podem ser vendidos dentro da ConnectyHub ou manter link externo.",
    sourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    accept: ".csv,text/csv",
    fileTypeLabel: "CSV da Tray",
    fileExample: "Exemplo: exportacao de produtos Tray em CSV com descricao, preco, estoque, variantes e imagens.",
    defaultTitle: "Catalogo Tray",
  },
  {
    value: "ifood",
    label: "iFood / cardapio delivery",
    description: "Use para cardapio de restaurante, pizzaria, hamburgueria e adicionais. Imagens podem precisar de upload manual.",
    sourceKind: "mixed",
    acceptedSourceKinds: ["csv", "excel", "pdf", "image"],
    accept: ".csv,.tsv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf,text/csv,text/tab-separated-values",
    fileTypeLabel: "Cardapio, planilha, PDF ou foto",
    fileExample: "Exemplo: planilha de cardapio, PDF do menu ou foto legivel com categorias, tamanhos e adicionais.",
    defaultTitle: "Cardapio delivery",
  },
  {
    value: "generic_menu",
    label: "PDF ou foto de cardapio",
    description: "A IA le produtos, categorias, tamanhos e adicionais. Fotos reais dos produtos normalmente ficam para upload depois.",
    sourceKind: "mixed",
    acceptedSourceKinds: ["pdf", "image"],
    accept: ".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf",
    fileTypeLabel: "PDF ou imagem",
    fileExample: "Exemplo: PDF do cardapio ou foto clara do menu impresso, de preferencia uma pagina por imagem.",
    defaultTitle: "Cardapio por IA",
  },
  {
    value: "generic_sheet",
    label: "Planilha generica",
    description: "CSV, XLSX ou TSV com nomes e precos. Ideal para catalogos simples enviados por fornecedores.",
    sourceKind: "excel",
    acceptedSourceKinds: ["csv", "excel"],
    accept: ".csv,.tsv,.xls,.xlsx,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileTypeLabel: "CSV ou Excel",
    fileExample: "Exemplo: planilha com colunas Produto, Descricao, Preco, Categoria, Estoque, SKU e URL da imagem.",
    defaultTitle: "Planilha de produtos",
  },
];
const defaultCatalogImportPlatformOption = catalogImportPlatformOptions[0]!;

type SettingsDraft = {
  businessType: SalesCatalogBusinessType;
  categoriesText: string;
  attributes: SalesCatalogAttribute[];
  storefront: SalesCatalogStorefrontSettings;
  trackInventory: boolean;
  variationMedia: boolean;
  paymentMethods: SalesCatalogPaymentMethod[];
  orderPolicy: SalesCatalogOrderPolicy;
  leadDataPolicy: ClientSalesCatalogSettings["leadDataPolicy"];
  messageTemplates: SalesCatalogWhatsAppMessageTemplates;
  automationSettings: ClientSalesCatalogSettings["automationSettings"];
  orderBumps: SalesCatalogOrderBumpSettings;
};

type ShippingDraft = {
  localPickup: boolean;
  originCep: string;
  defaultHandlingDays: string;
  rules: SalesCatalogShippingRule[];
};

type ShippingQuoteResult = {
  item?: {
    id: string;
    title: string;
    weightGrams: number;
    weightSource: "product" | "default";
  };
  destination: {
    cep: string;
    uf: string;
    state: string;
  } | null;
  quotes: SalesCatalogShippingQuote[];
  error: string | null;
};

type SkuDraft = {
  id: string | null;
  skuCode: string;
  title: string;
  attributesText: string;
  price: string;
  salePrice: string;
  stockStatus: SalesCatalogSku["stockStatus"];
  stockQuantity: string;
  lowStockThreshold: string;
  weightGrams: string;
  status: SalesCatalogSkuStatus;
};

type SalesCatalogTone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

const salesCatalogToneStyles: Record<SalesCatalogTone, { rgb: string; fill: string; text: string; label: string }> = {
  green: { rgb: "52,211,153", fill: "#34d399", text: "text-emerald-200", label: "text-emerald-300" },
  cyan: { rgb: "34,211,238", fill: "#22d3ee", text: "text-cyan-200", label: "text-cyan-300" },
  amber: { rgb: "251,191,36", fill: "#fbbf24", text: "text-amber-200", label: "text-amber-300" },
  rose: { rgb: "251,113,133", fill: "#fb7185", text: "text-rose-200", label: "text-rose-300" },
  violet: { rgb: "167,139,250", fill: "#a78bfa", text: "text-violet-200", label: "text-violet-300" },
  zinc: { rgb: "148,163,184", fill: "#94a3b8", text: "text-slate-200", label: "text-slate-300" },
};

type CommerceFlowSummary = {
  flow: SalesCatalogCommercialFlowType;
  orders: number;
  orderAmount: number;
  approvedPayments: number;
  approvedAmount: number;
  pendingPayments: number;
  pendingAmount: number;
  failedPayments: number;
  commissionOrders: number;
  commissionApprovedAmount: number;
  paymentOwnerType: SalesCatalogRevenueOwnerType;
};

type CommerceSummary = {
  orderCount: number;
  orderAmount: number;
  approvedPayments: number;
  approvedAmount: number;
  pendingPayments: number;
  pendingAmount: number;
  failedPayments: number;
  clientApprovedAmount: number;
  connectyHubApprovedAmount: number;
  splitApprovedAmount: number;
  externalApprovedAmount: number;
  commissionOrders: number;
  commissionApprovedAmount: number;
  flows: CommerceFlowSummary[];
};

const statusOptions: Array<{ value: SalesCatalogItemStatus; label: string }> = [
  { value: "active", label: "Ativo" },
  { value: "draft", label: "Rascunho" },
];

const salesCatalogProductFormTabs: Array<{ id: SalesCatalogProductFormTab; label: string; icon: LucideIcon }> = [
  { id: "essential", label: "Essencial", icon: PackagePlus },
  { id: "pricing", label: "Preco", icon: BadgePercent },
  { id: "media", label: "Midia", icon: Upload },
  { id: "stock", label: "Estoque", icon: Tags },
  { id: "delivery", label: "Entrega", icon: Truck },
];

const highlightLabelSuggestions = [
  "Mais vendido",
  "Mais procurado",
  "Melhor escolha",
  "Oferta especial",
  "Alta conversao",
  "Recomendado",
];

const orderStatusOptions: SalesCatalogOrderStatus[] = [
  "draft",
  "pending_payment",
  "paid",
  "in_preparation",
  "shipped",
  "delivered",
  "cancelled",
  "needs_human",
];

const paymentStatusOptions: SalesCatalogPaymentStatus[] = [
  "pending",
  "proof_sent",
  "confirmed",
  "failed",
  "refunded",
];

const fulfillmentStatusOptions: SalesCatalogFulfillmentStatus[] = [
  "pending",
  "scheduled",
  "in_progress",
  "fulfilled",
  "cancelled",
];

const commercialFlowFilterOptions: Array<{ value: CommercialFlowFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "client_direct", label: "Venda propria" },
  { value: "connectyhub_resale", label: "Revenda CH" },
  { value: "connectyhub_direct", label: "Venda direta CH" },
  { value: "external_marketplace", label: "Marketplace externo" },
];

const checkoutStageFilterOptions: Array<{ value: CheckoutStageFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pagos" },
  { value: "pending", label: "Aguardando" },
  { value: "abandoned", label: "Abandonados" },
  { value: "failed", label: "Falhas" },
  { value: "cancelled", label: "Cancelados" },
  { value: "refunded", label: "Reembolsos" },
];

const salesCatalogHelpText: Record<string, string> = {
  Empresa: "Escolha em qual empresa esta configuracao, produto ou pedido sera aplicado.",
  "Tipo de venda": "Defina o modelo principal do catalogo. Ele serve como base, mas categorias e variacoes continuam livres para voce criar.",
  Categorias: "Cadastre as familias de produtos que o agente usara para organizar e filtrar o catalogo.",
  Variacoes: "Crie atributos como tamanho, cor, material, publico ou qualquer escolha que o cliente precisa confirmar.",
  "Pagamentos no WhatsApp": "Ative somente os metodos que a empresa aceita e escreva como o agente deve orientar o pagamento.",
  "Pedido e dados do lead": "Defina valor minimo, reserva, dados obrigatorios e quando uma pessoa precisa confirmar o pedido.",
  "Pedido minimo": "Informe um valor minimo quando a empresa so aceitar pedidos acima de uma faixa.",
  Reserva: "Escolha em que momento o estoque fica reservado para evitar venda duplicada.",
  "Carrinho parado": "Tempo em minutos para o agente retomar um pedido iniciado e ainda nao concluido.",
  "Pos-venda": "Quantidade de dias para o agente acompanhar o cliente depois da compra.",
  Retencao: "Prazo em dias para manter os dados do lead registrados no catalogo.",
  Consentimento: "Mensagem curta que autoriza o uso dos dados do lead para montar e acompanhar o pedido.",
  "Mensagens automaticas": "Edite os textos que o agente pode usar em cada etapa da venda pelo WhatsApp.",
  "Resumo do pedido": "Modelo enviado quando o agente resume itens, entrega e total do pedido.",
  "Pedido de pagamento": "Mensagem usada para orientar pagamento, comprovante ou link de checkout.",
  "Pagamento confirmado": "Texto enviado quando o pagamento ja foi conferido.",
  "Item indisponivel": "Resposta para quando um produto, SKU ou variacao nao puder ser vendido.",
  "Transferencia humana": "Mensagem usada quando o atendimento precisa sair do agente e ir para uma pessoa.",
  "CEP de origem": "CEP usado como base para calcular frete, retirada e prazos.",
  Separacao: "Prazo interno, em dias, antes do produto ficar pronto para envio ou retirada.",
  "Servicos e faixas": "Configure transportadoras, tipos de entrega, prazos e faixas por peso.",
  "Calculo por CEP": "Teste um CEP real para conferir se as regras de frete retornam valor e prazo corretos.",
  "Produto do pedido": "Selecione o item que sera registrado como pedido vindo do WhatsApp.",
  "SKU / variacao": "Escolha a combinacao vendavel quando o produto tiver estoque ou preco por variacao.",
  "Importar do WhatsApp": "Use apenas quando a empresa ja tem produtos no catalogo nativo do WhatsApp e quer trazer esses itens para a ConnectyHub.",
  "Vincular a agente": "Use apenas quando quiser restringir ou associar produtos a uma instancia/agente especifico.",
  "Lead no WhatsApp": "Dados do lead usados para localizar a conversa e continuar o atendimento.",
  Pedido: "Dados principais do pedido registrado a partir do WhatsApp.",
  Total: "Valor total do pedido, incluindo produto, frete ou ajustes manuais.",
  Pagamento: "Metodo ou status de pagamento associado ao pedido.",
  "Entrega e pagamento": "Regras de entrega, frete e recebimento usadas para concluir a venda.",
  Nome: "Nome publico do produto como o cliente vera no catalogo e no WhatsApp.",
  Categoria: "Escolha uma categoria criada na configuracao ou digite uma nova quando ainda nao existir.",
  Valor: "Preco principal usado pelo agente para apresentar e fechar a venda.",
  "Valor promocional": "Preco de oferta exibido quando houver promocao ativa.",
  "Descricao comercial": "Explique o que e, beneficios, condicoes, entrega, garantia e objeccoes comuns.",
  "Oferta e fechamento": "Configure preco promocional, cupom, validade e chamada de venda.",
  Promocional: "Preco de oferta que pode substituir o valor principal durante uma campanha.",
  Cupom: "Codigo curto que o agente pode informar ao cliente.",
  Inicio: "Data em que a oferta passa a valer.",
  Fim: "Data final da oferta ou cupom.",
  "Variacoes deste item": "Selecione as variacoes realmente disponiveis neste produto.",
  "Estoque deste item": "Controle disponibilidade, quantidade, alerta e regra de encomenda.",
  Disponibilidade: "Status de estoque apresentado ao agente durante a venda.",
  Quantidade: "Quantidade disponivel para venda quando o estoque for controlado.",
  "Alerta baixo": "Quantidade minima para sinalizar reposicao.",
  "SKUs e variacoes vendaveis": "Cadastre combinacoes vendaveis com preco, estoque e peso proprios.",
  "Entrega deste item": "Defina se o item e fisico, digital, servico ou assinatura e como sera entregue.",
  Tipo: "Escolha a natureza do item para orientar entrega, frete e mensagens do agente.",
  "Duracao ou prazo": "Informe prazo de servico, tempo de acesso ou duracao do atendimento.",
  "Peso g": "Peso em gramas usado para calculo de frete quando for produto fisico.",
  Peso: "Peso usado para frete quando o produto for fisico.",
  "Qtd.": "Quantidade de estoque do SKU ou variacao.",
  Frete: "Escolha se usa tabela padrao, frete gratis ou combinacao manual.",
  "Comprimento cm": "Dimensao usada para cotacao de envio quando aplicavel.",
  "Largura cm": "Dimensao usada para cotacao de envio quando aplicavel.",
  "Altura cm": "Dimensao usada para cotacao de envio quando aplicavel.",
  Comprimento: "Comprimento do pacote usado para calcular frete.",
  Largura: "Largura do pacote usada para calcular frete.",
  Altura: "Altura do pacote usada para calcular frete.",
  "Fotos, GIFs, videos ou arquivos": "Envie midias e materiais que o agente pode apresentar ao lead.",
  Execucao: "Instrucoes para entrega digital, acesso, agendamento ou execucao do servico.",
  "Observacao de frete": "Detalhes que o agente deve considerar antes de prometer envio ou prazo.",
  Status: "Controle se o produto fica ativo, rascunho ou arquivado.",
};

export function SalesCatalogConsole({
  initialCompanies,
  initialItems,
  initialOrders,
  initialPaymentSessions,
  initialSettings,
  initialShippingSettings,
  initialWhatsappInstances,
  initialCompanyId,
}: SalesCatalogConsoleProps) {
  const initialSelectedCompanyId = initialCompanyId ?? initialCompanies[0]?.id ?? "";
  const initialSelectedSettings = initialSettings.find((settings) => settings.companyId === initialSelectedCompanyId) ?? null;
  const initialSelectedShippingSettings = initialShippingSettings.find((settings) => settings.companyId === initialSelectedCompanyId) ?? null;
  const [companies] = useState(initialCompanies);
  const [items, setItems] = useState(initialItems);
  const [orders, setOrders] = useState(initialOrders);
  const [paymentSessions, setPaymentSessions] = useState(initialPaymentSessions);
  const [settings, setSettings] = useState(initialSettings);
  const [shippingSettings, setShippingSettings] = useState(initialShippingSettings);
  const [whatsappInstances] = useState(initialWhatsappInstances);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialSelectedCompanyId);
  const [activeTab, setActiveTab] = useState<CatalogTab>(initialSelectedSettings?.configured ? "products" : "setup");
  const [productFormTab, setProductFormTab] = useState<SalesCatalogProductFormTab>("essential");
  const [orderFlowFilter, setOrderFlowFilter] = useState<CommercialFlowFilter>("all");
  const [paymentFlowFilter, setPaymentFlowFilter] = useState<CommercialFlowFilter>("all");
  const [checkoutStageFilter, setCheckoutStageFilter] = useState<CheckoutStageFilter>("all");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => buildSettingsDraft(initialSelectedSettings));
  const [shippingDraft, setShippingDraft] = useState<ShippingDraft>(() => buildShippingDraft(initialSelectedShippingSettings));
  const [storefrontSettingsHighlighted, setStorefrontSettingsHighlighted] = useState(false);
  const [selectedShippingUf, setSelectedShippingUf] = useState(() => initialSelectedShippingSettings?.rules.find((rule) => rule.active)?.uf ?? "SP");
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
  const [quoteItemId, setQuoteItemId] = useState("");
  const [quoteCep, setQuoteCep] = useState("");
  const [quoteResult, setQuoteResult] = useState<ShippingQuoteResult | null>(null);
  const [calculatingQuote, setCalculatingQuote] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [highlightLabel, setHighlightLabel] = useState("");
  const [storeFeatured, setStoreFeatured] = useState(false);
  const [storeFeaturedRank, setStoreFeaturedRank] = useState("");
  const [price, setPrice] = useState("");
  const [salesDestination, setSalesDestination] = useState<SalesCatalogSalesDestination>("connectyhub_checkout");
  const [productUrl, setProductUrl] = useState("");
  const [externalButtonLabel, setExternalButtonLabel] = useState("");
  const [description, setDescription] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDescription, setCouponDescription] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [status, setStatus] = useState<SalesCatalogItemStatus>("active");
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string[]>>({});
  const [inventoryStatus, setInventoryStatus] = useState<SalesCatalogStockStatus>("in_stock");
  const [stockQuantity, setStockQuantity] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [inventoryNotes, setInventoryNotes] = useState("");
  const [skuDrafts, setSkuDrafts] = useState<SkuDraft[]>([]);
  const [fulfillmentMode, setFulfillmentMode] = useState<SalesCatalogFulfillmentMode>("physical");
  const [schedulingRequired, setSchedulingRequired] = useState(false);
  const [serviceDuration, setServiceDuration] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [shippingProfile, setShippingProfile] = useState<SalesCatalogShippingProfile>("default");
  const [shippingNotes, setShippingNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [editingMedia, setEditingMedia] = useState<SalesCatalogMedia[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedCatalogImportInstanceId, setSelectedCatalogImportInstanceId] = useState("");
  const [selectedCatalogExportInstanceId, setSelectedCatalogExportInstanceId] = useState("");
  const [catalogImportAgentScopeId, setCatalogImportAgentScopeId] = useState("");
  const [selectedCatalogExportItemIds, setSelectedCatalogExportItemIds] = useState<string[]>([]);
  const [orderItemId, setOrderItemId] = useState("");
  const [orderSkuId, setOrderSkuId] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderCustomerName, setOrderCustomerName] = useState("");
  const [orderCustomerPhone, setOrderCustomerPhone] = useState("");
  const [orderCustomerDocument, setOrderCustomerDocument] = useState("");
  const [orderCustomerEmail, setOrderCustomerEmail] = useState("");
  const [orderDestinationCep, setOrderDestinationCep] = useState("");
  const [orderDestinationAddress, setOrderDestinationAddress] = useState("");
  const [orderShippingTotal, setOrderShippingTotal] = useState("");
  const [orderTotal, setOrderTotal] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("");
  const [orderShippingMethod, setOrderShippingMethod] = useState("");
  const [orderInternalNotes, setOrderInternalNotes] = useState("");
  const [orderStatus, setOrderStatus] = useState<SalesCatalogOrderStatus>("pending_payment");
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<SalesCatalogPaymentStatus>("pending");
  const [orderFulfillmentStatus, setOrderFulfillmentStatus] = useState<SalesCatalogFulfillmentStatus>("pending");
  const [creating, setCreating] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [creatingPaymentSessionId, setCreatingPaymentSessionId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingWhatsappCatalog, setExportingWhatsappCatalog] = useState(false);
  const [catalogImportJobs, setCatalogImportJobs] = useState<ClientSalesCatalogImportJob[]>([]);
  const [loadingCatalogImports, setLoadingCatalogImports] = useState(false);
  const [creatingCatalogImport, setCreatingCatalogImport] = useState(false);
  const [savingCatalogImportId, setSavingCatalogImportId] = useState<string | null>(null);
  const [publishingCatalogImportId, setPublishingCatalogImportId] = useState<string | null>(null);
  const [cancelingCatalogImportId, setCancelingCatalogImportId] = useState<string | null>(null);
  const [deletingCatalogImportId, setDeletingCatalogImportId] = useState<string | null>(null);
  const [catalogImportSourceKind, setCatalogImportSourceKind] = useState<SalesCatalogImportSourceKind>(defaultCatalogImportPlatformOption.sourceKind);
  const [catalogImportSourcePlatform, setCatalogImportSourcePlatform] = useState<SalesCatalogImportPlatform>("auto");
  const [catalogImportTargetMode, setCatalogImportTargetMode] = useState<SalesCatalogImportTargetMode>("connectyhub_checkout");
  const [catalogImportDefaultDestination, setCatalogImportDefaultDestination] = useState<SalesCatalogImportDestination>("connectyhub_checkout");
  const [catalogImportTitle, setCatalogImportTitle] = useState("");
  const [catalogImportText, setCatalogImportText] = useState("");
  const [catalogImportFiles, setCatalogImportFiles] = useState<File[]>([]);
  const [catalogImportPatches, setCatalogImportPatches] = useState<CatalogImportPatchMap>({});
  const [catalogImportJobNotices, setCatalogImportJobNotices] = useState<Record<string, Notice>>({});
  const [catalogImportMonitor, setCatalogImportMonitor] = useState<CatalogImportMonitorState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [visibilityId, setVisibilityId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => !selectedCompanyId || item.companyId === selectedCompanyId),
    [items, selectedCompanyId],
  );
  const visibleWhatsappCatalogItems = useMemo(
    () => visibleItems.filter((item) => item.source === "whatsapp_catalog"),
    [visibleItems],
  );
  const visibleOrders = useMemo(
    () => orders.filter((order) => !selectedCompanyId || order.companyId === selectedCompanyId),
    [orders, selectedCompanyId],
  );
  const visiblePaymentSessions = useMemo(
    () => paymentSessions.filter((session) => !selectedCompanyId || session.companyId === selectedCompanyId),
    [paymentSessions, selectedCompanyId],
  );
  const visibleWhatsappInstances = useMemo(
    () => whatsappInstances.filter((instance) => !selectedCompanyId || instance.companyId === selectedCompanyId),
    [selectedCompanyId, whatsappInstances],
  );
  const connectedWhatsappInstances = useMemo(
    () => visibleWhatsappInstances.filter((instance) => instance.status === "connected" && instance.tokenReady),
    [visibleWhatsappInstances],
  );
  const selectedCatalogImportInstance = connectedWhatsappInstances.find((instance) => instance.id === selectedCatalogImportInstanceId) ?? connectedWhatsappInstances[0] ?? null;
  const selectedCatalogExportInstance = connectedWhatsappInstances.find((instance) => instance.id === selectedCatalogExportInstanceId) ?? connectedWhatsappInstances[0] ?? null;
  const selectedCatalogImportAgentScope = connectedWhatsappInstances.find((instance) => instance.id === catalogImportAgentScopeId) ?? null;
  const selectedCatalogExportItems = useMemo(
    () => visibleWhatsappCatalogItems.filter((item) => selectedCatalogExportItemIds.includes(item.id)),
    [selectedCatalogExportItemIds, visibleWhatsappCatalogItems],
  );
  const monitoredCatalogImportJob = useMemo(
    () => catalogImportMonitor?.jobId
      ? catalogImportJobs.find((job) => job.id === catalogImportMonitor.jobId) ?? null
      : null,
    [catalogImportJobs, catalogImportMonitor?.jobId],
  );
  const filteredOrders = useMemo(
    () => orderFlowFilter === "all" ? visibleOrders : visibleOrders.filter((order) => order.commercialFlowType === orderFlowFilter),
    [orderFlowFilter, visibleOrders],
  );
  const filteredPaymentSessions = useMemo(
    () => paymentFlowFilter === "all" ? visiblePaymentSessions : visiblePaymentSessions.filter((session) => session.commercialFlowType === paymentFlowFilter),
    [paymentFlowFilter, visiblePaymentSessions],
  );
  const stats = useMemo(() => {
    const active = visibleItems.filter((item) => item.status === "active").length;
    const ready = visibleItems.filter((item) => item.readiness === "ready").length;
    const media = visibleItems.reduce((total, item) => total + item.media.length, 0);
    const whatsapp = visibleItems.filter((item) => item.source === "whatsapp_catalog").length;
    const orderCount = visibleOrders.length;
    const clientDirectOrders = visibleOrders.filter((order) => order.commercialFlowType === "client_direct").length;
    const connectyHubResaleOrders = visibleOrders.filter((order) => order.commercialFlowType === "connectyhub_resale").length;
    const connectyHubDirectOrders = visibleOrders.filter((order) => order.commercialFlowType === "connectyhub_direct").length;
    const commissionOrders = visibleOrders.filter((order) => order.commissionEligible).length;

    return { active, ready, media, whatsapp, orderCount, clientDirectOrders, connectyHubResaleOrders, connectyHubDirectOrders, commissionOrders };
  }, [visibleItems, visibleOrders]);
  const commerceSummary = useMemo(
    () => buildCommerceSummary(visibleOrders, visiblePaymentSessions),
    [visibleOrders, visiblePaymentSessions],
  );
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedSettings = useMemo(
    () => settings.find((entry) => entry.companyId === selectedCompanyId) ?? null,
    [settings, selectedCompanyId],
  );
  const selectedShippingSettings = useMemo(
    () => shippingSettings.find((entry) => entry.companyId === selectedCompanyId) ?? null,
    [shippingSettings, selectedCompanyId],
  );
  const abandonedCheckoutMinutes = selectedSettings?.orderPolicy.abandonedCartMinutes ?? defaultSalesCatalogAbandonedCheckoutMinutes;
  const checkoutRecords = useMemo(
    () => buildSalesCatalogCheckoutRecords(visibleOrders, visiblePaymentSessions, abandonedCheckoutMinutes),
    [abandonedCheckoutMinutes, visibleOrders, visiblePaymentSessions],
  );
  const filteredCheckoutRecords = useMemo(
    () => checkoutStageFilter === "all"
      ? checkoutRecords
      : checkoutRecords.filter((record) => record.status.stage === checkoutStageFilter),
    [checkoutRecords, checkoutStageFilter],
  );
  const checkoutSummary = useMemo(() => buildCheckoutStageSummary(checkoutRecords), [checkoutRecords]);
  const featuredProductsCount = useMemo(
    () => visibleItems.filter((item) => item.storeFeatured && item.status === "active").length,
    [visibleItems],
  );
  const currentFeaturedItem = useMemo(
    () => visibleItems.find((item) => item.storeFeatured && item.status === "active") ?? null,
    [visibleItems],
  );
  const selectedStoreSlug = selectedCompany?.slug ?? selectedCompany?.id ?? "";
  const selectedStorePath = selectedStoreSlug ? `/loja/${encodeURIComponent(selectedStoreSlug)}` : "";
  const storefrontHeroTitle = settingsDraft.storefront.heroTitle?.trim() || "Qualidade que voce sente.";
  const storefrontHeroHighlight = settingsDraft.storefront.heroHighlight?.trim() || "Resultados que voce ve.";
  const storefrontHeroSubtitle = settingsDraft.storefront.heroSubtitle?.trim()
    || `Produtos selecionados pela ${selectedCompany?.name ?? "sua loja"}, compra segura e atendimento conectado ao WhatsApp.`;
  const hasConfiguredSettings = Boolean(selectedSettings?.configured);
  const productAttributes = useMemo(
    () => (selectedSettings?.configured ? selectedSettings.attributes : settingsDraft.attributes).filter((attribute) => attribute.values.length > 0),
    [selectedSettings, settingsDraft.attributes],
  );
  const categoryRows = useMemo(() => getCategoryRows(settingsDraft.categoriesText), [settingsDraft.categoriesText]);
  const categoryOptions = selectedSettings?.configured ? selectedSettings.categories : parseLines(settingsDraft.categoriesText);
  const inventoryEnabled = selectedSettings?.trackInventory ?? settingsDraft.trackInventory;
  const selectedShippingRule = shippingDraft.rules.find((rule) => rule.uf === selectedShippingUf) ?? shippingDraft.rules[0] ?? null;
  const selectedOrderItem = visibleItems.find((item) => item.id === orderItemId) ?? null;
  const canCreate = Boolean(
    selectedCompanyId
    && title.trim()
    && description.trim()
    && (salesDestination !== "external_site" || productUrl.trim())
    && !creating,
  );
  const canImportWhatsappCatalog = Boolean(selectedCompanyId && selectedCatalogImportInstance && !importing);
  const canExportWhatsappCatalog = Boolean(selectedCompanyId && selectedCatalogExportInstance && selectedCatalogExportItems.length > 0 && !exportingWhatsappCatalog);
  const canCalculateQuote = Boolean(selectedCompanyId && quoteItemId && cleanCep(quoteCep) && !calculatingQuote);
  const canCreateOrder = Boolean(selectedCompanyId && orderItemId && (orderCustomerName.trim() || orderCustomerPhone.trim()) && !creatingOrder);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");

    if (!payment) return;

    const reason = params.get("reason");
    const timeoutId = window.setTimeout(() => {
      setActiveTab("payments");

      if (payment === "mercado_pago_connected") {
        setNotice({ tone: "success", message: "Mercado Pago conectado. O agente ja pode cobrar por Pix e cartao no checkout." });
      }

      if (payment === "mercado_pago_error") {
        setNotice({ tone: "error", message: getMercadoPagoConnectionErrorMessage(reason) });
      }
    }, 0);

    params.delete("payment");
    params.delete("reason");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!salesCatalogAiImportPanelEnabled) {
      return;
    }

    if (!selectedCompanyId) {
      return;
    }

    let cancelled = false;

    async function loadImports() {
      setLoadingCatalogImports(true);

      try {
        const response = await fetch(`/api/dashboard/sales-catalog/imports?companyId=${encodeURIComponent(selectedCompanyId)}&processQueued=1`);
        const data = await response.json().catch(() => null) as { importJobs?: ClientSalesCatalogImportJob[]; error?: string } | null;

        if (cancelled) return;

        if (!response.ok || !data?.importJobs) {
          throw new Error(data?.error ?? "Nao foi possivel carregar importacoes.");
        }

        setCatalogImportJobs(data.importJobs);
      } catch (error) {
        if (!cancelled) {
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao carregar importacoes." });
        }
      } finally {
        if (!cancelled) {
          setLoadingCatalogImports(false);
        }
      }
    }

    void loadImports();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!salesCatalogAiImportPanelEnabled) {
      return;
    }

    const hasQueuedImport = catalogImportJobs.some((job) => job.status === "uploaded" || job.status === "extracting");
    if (!selectedCompanyId || activeTab !== "products" || !hasQueuedImport) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/dashboard/sales-catalog/imports?companyId=${encodeURIComponent(selectedCompanyId)}&processQueued=1`);
          const data = await response.json().catch(() => null) as { importJobs?: ClientSalesCatalogImportJob[] } | null;

          if (response.ok && data?.importJobs) {
            setCatalogImportJobs(data.importJobs);
          }
        } catch {
          return;
        }
      })();
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, [activeTab, catalogImportJobs, selectedCompanyId]);

  useEffect(() => {
    if (!catalogImportMonitor?.open || catalogImportMonitor.previewItems.length <= catalogImportMonitor.visiblePreviewCount) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCatalogImportMonitor((current) => {
        if (!current?.open || current.previewItems.length <= current.visiblePreviewCount) return current;

        return {
          ...current,
          visiblePreviewCount: Math.min(current.previewItems.length, current.visiblePreviewCount + 1),
        };
      });
    }, 420);

    return () => window.clearInterval(intervalId);
  }, [catalogImportMonitor?.open, catalogImportMonitor?.previewItems.length, catalogImportMonitor?.visiblePreviewCount]);

  function changeCompany(companyId: string) {
    const nextSettings = settings.find((entry) => entry.companyId === companyId) ?? null;
    const nextShippingSettings = shippingSettings.find((entry) => entry.companyId === companyId) ?? null;
    setSelectedCompanyId(companyId);
    setCheckoutStageFilter("all");
    setSettingsDraft(buildSettingsDraft(nextSettings));
    setShippingDraft(buildShippingDraft(nextShippingSettings));
    setSelectedShippingUf(nextShippingSettings?.rules.find((rule) => rule.active)?.uf ?? "SP");
    setSelectedAttributes({});
    setSkuDrafts([]);
    setEditingItemId(null);
    setProductFormTab("essential");
    setQuoteItemId("");
    setQuoteCep("");
    setQuoteResult(null);
    setOrderItemId("");
    setOrderSkuId("");
    setOrderTotal("");
    setCatalogImportTitle("");
    setCatalogImportText("");
    setCatalogImportFiles([]);
    setCatalogImportPatches({});
    setCatalogImportJobNotices({});
    setCatalogImportMonitor(null);
    setSelectedCatalogImportInstanceId("");
    setSelectedCatalogExportInstanceId("");
    setCatalogImportAgentScopeId("");
    setSelectedCatalogExportItemIds([]);
  }

  function applyBusinessTemplate(value: SalesCatalogBusinessType) {
    setSettingsDraft((current) => ({
      ...current,
      businessType: value,
    }));
  }

  function updateStorefrontSettings(patch: Partial<SalesCatalogStorefrontSettings>) {
    setSettingsDraft((current) => ({
      ...current,
      storefront: { ...current.storefront, ...patch },
    }));
  }

  function updateAttribute(attributeId: string, patch: Partial<SalesCatalogAttribute>) {
    setSettingsDraft((current) => ({
      ...current,
      attributes: current.attributes.map((attribute) => (
        attribute.id === attributeId
          ? {
              ...attribute,
              ...patch,
              id: patch.name ? createAttributeId(patch.name) : attribute.id,
            }
          : attribute
      )),
    }));
  }

  function addAttribute() {
    setSettingsDraft((current) => {
      const index = current.attributes.length + 1;
      return {
        ...current,
        attributes: [
          ...current.attributes,
          { id: `atributo_${index}`, name: `Variacao ${index}`, values: ["Opcao 1"], required: false },
        ],
      };
    });
  }

  function removeAttribute(attributeId: string) {
    setSettingsDraft((current) => ({
      ...current,
      attributes: current.attributes.filter((attribute) => attribute.id !== attributeId),
    }));
  }

  function setCategoryRows(rows: string[]) {
    setSettingsDraft((current) => ({
      ...current,
      categoriesText: rows.map((row) => row.replace(/\s+/g, " ").slice(0, 80)).join("\n").slice(0, 1400),
    }));
  }

  function updateCategoryRow(index: number, value: string) {
    const rows = [...categoryRows];
    rows[index] = value;
    setCategoryRows(rows);
  }

  function addCategoryRow(value = "") {
    const nextValue = value || `Categoria ${categoryRows.length + 1}`;
    setCategoryRows([...categoryRows, nextValue]);
  }

  function removeCategoryRow(index: number) {
    const rows = categoryRows.filter((_, rowIndex) => rowIndex !== index);
    setCategoryRows(rows.length > 0 ? rows : [""]);
  }

  function updatePaymentMethod(methodId: SalesCatalogPaymentMethod["id"], patch: Partial<SalesCatalogPaymentMethod>) {
    setSettingsDraft((current) => ({
      ...current,
      paymentMethods: current.paymentMethods.map((method) => (
        method.id === methodId ? { ...method, ...patch } : method
      )),
    }));
  }

  function updateOrderPolicy(patch: Partial<SalesCatalogOrderPolicy>) {
    setSettingsDraft((current) => ({
      ...current,
      orderPolicy: { ...current.orderPolicy, ...patch },
    }));
  }

  function toggleLeadDataField(field: SalesCatalogLeadDataField) {
    setSettingsDraft((current) => {
      const exists = current.leadDataPolicy.requiredFields.includes(field);
      return {
        ...current,
        leadDataPolicy: {
          ...current.leadDataPolicy,
          requiredFields: exists
            ? current.leadDataPolicy.requiredFields.filter((item) => item !== field)
            : [...current.leadDataPolicy.requiredFields, field],
        },
      };
    });
  }

  function updateLeadDataPolicy(patch: Partial<ClientSalesCatalogSettings["leadDataPolicy"]>) {
    setSettingsDraft((current) => ({
      ...current,
      leadDataPolicy: { ...current.leadDataPolicy, ...patch },
    }));
  }

  function toggleSelectedAttribute(attribute: SalesCatalogAttribute, value: string) {
    setSelectedAttributes((current) => {
      const values = current[attribute.id] ?? [];
      const exists = values.includes(value);
      const nextValues = exists ? values.filter((item) => item !== value) : [...values, value];
      return {
        ...current,
        [attribute.id]: nextValues,
      };
    });
  }

  function addSkuDraft() {
    setSkuDrafts((current) => [
      ...current,
      buildEmptySkuDraft({
        index: current.length + 1,
        title,
        price,
        salePrice,
        inventoryStatus,
        stockQuantity,
        lowStockThreshold,
        weightGrams,
        selectedAttributes: buildSelectedItemAttributes(productAttributes, selectedAttributes),
      }),
    ]);
  }

  function updateSkuDraft(index: number, patch: Partial<SkuDraft>) {
    setSkuDrafts((current) => current.map((sku, skuIndex) => (
      skuIndex === index ? { ...sku, ...patch } : sku
    )));
  }

  function removeSkuDraft(index: number) {
    setSkuDrafts((current) => current.filter((_, skuIndex) => skuIndex !== index));
  }

  async function createOrderPaymentSession(order: ClientSalesCatalogOrder) {
    if (creatingPaymentSessionId) return;

    setCreatingPaymentSessionId(order.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_payment_session",
          companyId: order.companyId,
          orderId: order.id,
          amount: order.total,
          payerEmail: order.customerEmail,
        }),
      });
      const data = await response.json().catch(() => null) as {
        session?: ClientSalesCatalogPaymentSession;
        checkoutUrl?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.session) {
        throw new Error(data?.error ?? "Nao foi possivel gerar Pix para este pedido.");
      }

      setPaymentSessions((current) => [data.session!, ...current.filter((session) => session.id !== data.session!.id)]);
      setOrders((current) => current.map((entry) => (
        entry.id === order.id
          ? { ...entry, latestPaymentSessionId: data.session!.id, paymentMethod: "Pix Mercado Pago", paymentStatus: "pending", status: "pending_payment" }
          : entry
      )));
      setNotice({ tone: "success", message: "Pix gerado. O link de checkout ja pode ser enviado no WhatsApp." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao gerar Pix." });
    } finally {
      setCreatingPaymentSessionId(null);
    }
  }

  async function saveSettings() {
    if (!selectedCompanyId || savingSettings) return;

    setSavingSettings(true);
    setNotice(null);

    try {
      const categories = parseLines(settingsDraft.categoriesText);
      const attributes = settingsDraft.attributes
        .map((attribute) => ({
          ...attribute,
          name: attribute.name.trim().slice(0, 50),
          id: createAttributeId(attribute.name),
          values: sanitizeList(attribute.values),
        }))
        .filter((attribute) => attribute.name && attribute.values.length > 0)
        .slice(0, 12);
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_catalog_settings",
          companyId: selectedCompanyId,
          businessType: settingsDraft.businessType,
          categories,
          attributes,
          storefront: {
            heroTitle: cleanInput(settingsDraft.storefront.heroTitle, 90),
            heroHighlight: cleanInput(settingsDraft.storefront.heroHighlight, 90),
            heroSubtitle: cleanInput(settingsDraft.storefront.heroSubtitle, 180),
          },
          trackInventory: settingsDraft.trackInventory,
          variationMedia: settingsDraft.variationMedia,
          paymentMethods: settingsDraft.paymentMethods.map((method) => ({
            id: method.id,
            label: method.label,
            enabled: method.enabled,
            instructions: cleanInput(method.instructions, 240),
            requiresProof: method.requiresProof,
          })),
          orderPolicy: {
            minimumOrderValue: cleanInput(settingsDraft.orderPolicy.minimumOrderValue, 40),
            reservationPolicy: settingsDraft.orderPolicy.reservationPolicy,
            allowOrderWithoutPayment: settingsDraft.orderPolicy.allowOrderWithoutPayment,
            requireHumanConfirmation: settingsDraft.orderPolicy.requireHumanConfirmation,
            askCepBeforeQuote: settingsDraft.orderPolicy.askCepBeforeQuote,
            abandonedCartMinutes: settingsDraft.orderPolicy.abandonedCartMinutes,
            followUpDays: settingsDraft.orderPolicy.followUpDays,
          },
          leadDataPolicy: {
            requiredFields: settingsDraft.leadDataPolicy.requiredFields,
            consentMessage: cleanInput(settingsDraft.leadDataPolicy.consentMessage, 240),
            retentionDays: settingsDraft.leadDataPolicy.retentionDays,
          },
          messageTemplates: settingsDraft.messageTemplates,
          automationSettings: settingsDraft.automationSettings,
          orderBumps: settingsDraft.orderBumps,
        }),
      });
      const data = await response.json().catch(() => null) as {
        settings?: ClientSalesCatalogSettings;
        clearedFeaturedItemIds?: string[];
        error?: string;
      } | null;

      if (!response.ok || !data?.settings) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao.");
      }

      setSettings((current) => [data.settings!, ...current.filter((entry) => entry.companyId !== data.settings!.companyId)]);
      applyClearedFeaturedItems(data.clearedFeaturedItemIds);
      setSettingsDraft(buildSettingsDraft(data.settings));
      setActiveTab("products");
      setNotice({ tone: "success", message: "Configuracao do catalogo salva." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar configuracao." });
    } finally {
      setSavingSettings(false);
    }
  }

  function updateShippingRule(uf: string, patch: Partial<SalesCatalogShippingRule>) {
    setShippingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (
        rule.uf === uf ? { ...rule, ...patch } : rule
      )),
    }));
  }

  function updateShippingService(uf: string, serviceId: string, patch: Partial<SalesCatalogShippingService>) {
    setShippingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (
        rule.uf === uf
          ? {
              ...rule,
              services: rule.services.map((service) => (
                service.id === serviceId ? { ...service, ...patch } : service
              )),
            }
          : rule
      )),
    }));
  }

  function updateWeightTier(uf: string, serviceId: string, tierId: string, patch: Partial<SalesCatalogShippingWeightTier>) {
    setShippingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (
        rule.uf === uf
          ? {
              ...rule,
              services: rule.services.map((service) => (
                service.id === serviceId
                  ? {
                      ...service,
                      tiers: service.tiers.map((tier) => (
                        tier.id === tierId ? { ...tier, ...patch } : tier
                      )),
                    }
                  : service
              )),
            }
          : rule
      )),
    }));
  }

  function addWeightTier(uf: string, serviceId: string) {
    setShippingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (
        rule.uf === uf
          ? {
              ...rule,
              services: rule.services.map((service) => (
                service.id === serviceId
                  ? {
                      ...service,
                      tiers: [
                        ...service.tiers,
                        {
                          id: `${serviceId}_${Date.now()}`,
                          name: "Nova faixa",
                          active: true,
                          maxWeightGrams: null,
                          price: null,
                          minDays: null,
                          maxDays: null,
                        },
                      ],
                    }
                  : service
              )),
            }
          : rule
      )),
    }));
  }

  function removeWeightTier(uf: string, serviceId: string, tierId: string) {
    setShippingDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (
        rule.uf === uf
          ? {
              ...rule,
              services: rule.services.map((service) => (
                service.id === serviceId
                  ? { ...service, tiers: service.tiers.filter((tier) => tier.id !== tierId) }
                  : service
              )),
            }
          : rule
      )),
    }));
  }

  async function calculateQuote() {
    if (!selectedCompanyId || !quoteItemId || calculatingQuote) return;

    setCalculatingQuote(true);
    setNotice(null);
    setQuoteResult(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calculate_shipping_quote",
          companyId: selectedCompanyId,
          itemId: quoteItemId,
          cep: quoteCep,
        }),
      });
      const data = await response.json().catch(() => null) as ShippingQuoteResult | { error?: string } | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel calcular o frete.");
      }

      setQuoteResult(data as ShippingQuoteResult);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao calcular frete." });
    } finally {
      setCalculatingQuote(false);
    }
  }

  async function saveShippingSettings() {
    if (!selectedCompanyId || savingShipping) return;

    setSavingShipping(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_shipping_settings",
          companyId: selectedCompanyId,
          localPickup: shippingDraft.localPickup,
          originCep: shippingDraft.originCep,
          defaultHandlingDays: parseOptionalNumber(shippingDraft.defaultHandlingDays),
          rules: shippingDraft.rules.map((rule) => ({
            uf: rule.uf,
            state: rule.state,
            active: rule.active,
            cepStart: cleanCep(rule.cepStart),
            cepEnd: cleanCep(rule.cepEnd),
            price: cleanInput(rule.price, 40),
            minDays: rule.minDays,
            maxDays: rule.maxDays,
            freeShippingThreshold: cleanInput(rule.freeShippingThreshold, 40),
            services: rule.services.map((service) => ({
              id: service.id,
              provider: service.provider,
              name: cleanInput(service.name, 80) ?? service.name,
              active: service.active,
              tiers: service.tiers.map((tier) => ({
                id: tier.id,
                name: cleanInput(tier.name, 80) ?? tier.name,
                active: tier.active,
                maxWeightGrams: tier.maxWeightGrams,
                price: cleanInput(tier.price, 40),
                minDays: tier.minDays,
                maxDays: tier.maxDays,
              })),
            })),
            notes: cleanInput(rule.notes, 160),
          })),
        }),
      });
      const data = await response.json().catch(() => null) as { shippingSettings?: ClientSalesCatalogShippingSettings; error?: string } | null;

      if (!response.ok || !data?.shippingSettings) {
        throw new Error(data?.error ?? "Nao foi possivel salvar o frete.");
      }

      setShippingSettings((current) => [
        data.shippingSettings!,
        ...current.filter((entry) => entry.companyId !== data.shippingSettings!.companyId),
      ]);
      setShippingDraft(buildShippingDraft(data.shippingSettings));
      setNotice({ tone: "success", message: "Entrega e frete salvos para este catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar frete." });
    } finally {
      setSavingShipping(false);
    }
  }

  async function createItem() {
    if (!canCreate) return;

    const isEditing = Boolean(editingItemId);
    setCreating(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("companyId", selectedCompanyId);
      if (editingItemId) {
        formData.set("itemId", editingItemId);
        formData.set("keepMediaIds", JSON.stringify(editingMedia.map((media) => media.id)));
      }
      formData.set("title", title);
      formData.set("description", description);
      formData.set("category", category);
      formData.set("highlightLabel", highlightLabel);
      formData.set("storeFeatured", String(storeFeatured));
      formData.set("storeFeaturedRank", storeFeaturedRank);
      formData.set("price", price);
      formData.set("currency", "BRL");
      formData.set("salesDestination", salesDestination);
      formData.set("productUrl", productUrl);
      formData.set("externalButtonLabel", externalButtonLabel);
      formData.set("salePrice", salePrice);
      formData.set("saleStartsAt", saleStartsAt);
      formData.set("saleEndsAt", saleEndsAt);
      formData.set("couponCode", couponCode);
      formData.set("couponDescription", couponDescription);
      formData.set("callToAction", callToAction);
      formData.set("offerNotes", offerNotes);
      formData.set("status", status);
      formData.set("attributes", JSON.stringify(buildSelectedItemAttributes(productAttributes, selectedAttributes)));
      formData.set("skus", JSON.stringify(serializeSkuDrafts(skuDrafts, {
        title,
        price,
        salePrice,
        inventoryStatus,
        stockQuantity,
        lowStockThreshold,
        weightGrams,
        lengthCm,
        widthCm,
        heightCm,
      })));
      formData.set("inventoryStatus", inventoryStatus);
      formData.set("stockQuantity", stockQuantity);
      formData.set("lowStockThreshold", lowStockThreshold);
      formData.set("allowBackorder", String(allowBackorder));
      formData.set("inventoryNotes", inventoryNotes);
      formData.set("fulfillmentMode", fulfillmentMode);
      formData.set("schedulingRequired", String(schedulingRequired));
      formData.set("serviceDuration", serviceDuration);
      formData.set("deliveryInstructions", deliveryInstructions);
      formData.set("accessInstructions", accessInstructions);
      formData.set("weightGrams", weightGrams);
      formData.set("lengthCm", lengthCm);
      formData.set("widthCm", widthCm);
      formData.set("heightCm", heightCm);
      formData.set("shippingProfile", shippingProfile);
      formData.set("shippingNotes", shippingNotes);

      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null) as {
        item?: ClientSalesCatalogItem;
        clearedFeaturedItemIds?: string[];
        error?: string;
      } | null;

      if (!response.ok || !data?.item) {
        throw new Error(data?.error ?? (isEditing ? "Nao foi possivel atualizar o item." : "Nao foi possivel cadastrar o item."));
      }

      setItems((current) => {
        const clearedFeaturedItemIds = new Set(data.clearedFeaturedItemIds ?? []);
        const nextItems = current.map((item) => (
          clearedFeaturedItemIds.has(item.id)
            ? { ...item, storeFeatured: false, storeFeaturedRank: null, storeFeaturedAt: null }
            : item
        ));

        return [data.item!, ...nextItems.filter((item) => item.id !== data.item!.id)];
      });
      publishSalesCatalogUpdated({ companyId: data.item.companyId, itemIds: [data.item.id] });
      resetForm();
      setNotice({ tone: "success", message: isEditing ? "Item atualizado no catalogo." : "Item cadastrado no catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : isEditing ? "Erro ao atualizar item." : "Erro ao cadastrar item." });
    } finally {
      setCreating(false);
    }
  }

  function selectOrderItem(itemId: string) {
    const item = visibleItems.find((entry) => entry.id === itemId) ?? null;
    setOrderItemId(itemId);
    setOrderSkuId(item?.skus.find((sku) => sku.status === "active")?.id ?? "");
    setOrderTotal(item?.offer.salePrice ?? item?.price ?? "");
    setOrderFulfillmentStatus(item?.fulfillment.schedulingRequired ? "scheduled" : "pending");
  }

  function applyUpdatedItems(updatedItems?: ClientSalesCatalogItem[]) {
    if (!updatedItems?.length) return;

    setItems((current) => {
      const updatesById = new Map(updatedItems.map((item) => [item.id, item]));
      const currentIds = new Set(current.map((item) => item.id));
      const refreshed = current.map((item) => updatesById.get(item.id) ?? item);
      const missing = updatedItems.filter((item) => !currentIds.has(item.id));

      return [...missing, ...refreshed];
    });
  }

  function applyClearedFeaturedItems(itemIds?: string[]) {
    if (!itemIds?.length) return;

    const clearedFeaturedItemIds = new Set(itemIds);
    setItems((current) => current.map((item) => (
      clearedFeaturedItemIds.has(item.id)
        ? { ...item, storeFeatured: false, storeFeaturedRank: null, storeFeaturedAt: null }
        : item
    )));
  }

  async function createOrder() {
    if (!canCreateOrder) return;

    setCreatingOrder(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_order",
          companyId: selectedCompanyId,
          itemId: orderItemId,
          skuId: orderSkuId,
          quantity: parseOptionalNumber(orderQuantity) ?? 1,
          customerName: orderCustomerName,
          customerPhone: orderCustomerPhone,
          customerDocument: orderCustomerDocument,
          customerEmail: orderCustomerEmail,
          destinationCep: orderDestinationCep,
          destinationAddress: orderDestinationAddress,
          shippingTotal: orderShippingTotal,
          total: orderTotal,
          paymentMethod: orderPaymentMethod,
          shippingMethod: orderShippingMethod,
          internalNotes: orderInternalNotes,
          status: orderStatus,
          paymentStatus: orderPaymentStatus,
          fulfillmentStatus: orderFulfillmentStatus,
        }),
      });
      const data = await response.json().catch(() => null) as {
        order?: ClientSalesCatalogOrder;
        items?: ClientSalesCatalogItem[];
        error?: string;
      } | null;

      if (!response.ok || !data?.order) {
        throw new Error(data?.error ?? "Nao foi possivel criar o pedido.");
      }

      setOrders((current) => [data.order!, ...current.filter((order) => order.id !== data.order!.id)]);
      applyUpdatedItems(data.items);
      resetOrderForm();
      setNotice({ tone: "success", message: "Pedido registrado para acompanhar pelo WhatsApp." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar pedido." });
    } finally {
      setCreatingOrder(false);
    }
  }

  async function updateOrder(
    order: ClientSalesCatalogOrder,
    patch: Partial<Pick<ClientSalesCatalogOrder, "status" | "paymentStatus" | "fulfillmentStatus">>,
  ) {
    if (updatingOrderId) return;

    setUpdatingOrderId(order.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_order_status",
          companyId: order.companyId,
          orderId: order.id,
          status: patch.status,
          paymentStatus: patch.paymentStatus,
          fulfillmentStatus: patch.fulfillmentStatus,
        }),
      });
      const data = await response.json().catch(() => null) as {
        order?: ClientSalesCatalogOrder;
        items?: ClientSalesCatalogItem[];
        error?: string;
      } | null;

      if (!response.ok || !data?.order) {
        throw new Error(data?.error ?? "Nao foi possivel atualizar o pedido.");
      }

      setOrders((current) => current.map((entry) => (entry.id === data.order!.id ? data.order! : entry)));
      applyUpdatedItems(data.items);
      setNotice({ tone: "success", message: "Pedido atualizado." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao atualizar pedido." });
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function refreshCatalogImports() {
    if (!selectedCompanyId || loadingCatalogImports) return;

    setLoadingCatalogImports(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/dashboard/sales-catalog/imports?companyId=${encodeURIComponent(selectedCompanyId)}&processQueued=1`);
      const data = await response.json().catch(() => null) as { importJobs?: ClientSalesCatalogImportJob[]; error?: string } | null;

      if (!response.ok || !data?.importJobs) {
        throw new Error(data?.error ?? "Nao foi possivel carregar importacoes.");
      }

      setCatalogImportJobs(data.importJobs);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao carregar importacoes." });
    } finally {
      setLoadingCatalogImports(false);
    }
  }

  function updateCatalogImportItem(itemId: string, patch: Omit<SalesCatalogImportItemPatch, "id">) {
    const touchedJob = catalogImportJobs.find((job) => job.items.some((item) => item.id === itemId));
    if (touchedJob) updateCatalogImportJobNotice(touchedJob.id, null);

    setCatalogImportPatches((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? { id: itemId }),
        ...patch,
      },
    }));
    setCatalogImportJobs((current) => current.map((job) => ({
      ...job,
      items: job.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    })));
  }

  function handleCatalogImportFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []).slice(0, 6);
    const option = getCatalogImportPlatformOption(catalogImportSourcePlatform);
    const invalidFiles = getInvalidCatalogImportFiles(selectedFiles, option);

    if (invalidFiles.length > 0) {
      setCatalogImportFiles([]);
      setNotice({
        tone: "warning",
        message: `${option.label} aceita ${option.fileTypeLabel}. Revise: ${invalidFiles.slice(0, 3).map((file) => file.name).join(", ")}.`,
      });
      event.currentTarget.value = "";
      return;
    }

    setCatalogImportFiles(selectedFiles);
    setCatalogImportSourceKind(resolveCatalogImportSourceKind(option, selectedFiles));
  }

  function handleCatalogImportSourcePlatform(value: SalesCatalogImportPlatform) {
    setCatalogImportSourcePlatform(value);
    const option = getCatalogImportPlatformOption(value);
    const invalidFiles = getInvalidCatalogImportFiles(catalogImportFiles, option);

    if (invalidFiles.length > 0) {
      setCatalogImportFiles([]);
      setNotice({
        tone: "warning",
        message: `${option.label} usa ${option.fileTypeLabel}. Removi o anexo atual para evitar importacao errada.`,
      });
    }

    setCatalogImportSourceKind(resolveCatalogImportSourceKind(option, invalidFiles.length > 0 ? [] : catalogImportFiles));

    if (!catalogImportTitle.trim() && option.defaultTitle) {
      setCatalogImportTitle(option.defaultTitle);
    }
  }

  function handleCatalogImportTargetMode(value: SalesCatalogImportTargetMode) {
    setCatalogImportTargetMode(value);

    if (value === "connectyhub_checkout") {
      setCatalogImportDefaultDestination("connectyhub_checkout");
    } else if (value === "external_site") {
      setCatalogImportDefaultDestination("external_site");
    }
  }

  async function createCatalogImport() {
    if (!selectedCompanyId || creatingCatalogImport) return;

    if (catalogImportFiles.length === 0) {
      setNotice({ tone: "warning", message: "Anexe um arquivo legivel para importar produtos com IA." });
      return;
    }

    if (catalogImportSourceKind === "site") {
      setNotice({ tone: "warning", message: "Importacao por link foi desativada. Anexe um arquivo do catalogo." });
      return;
    }

    const selectedPlatform = getCatalogImportPlatformOption(catalogImportSourcePlatform);
    const invalidFiles = getInvalidCatalogImportFiles(catalogImportFiles, selectedPlatform);
    if (invalidFiles.length > 0) {
      setNotice({
        tone: "warning",
        message: `${selectedPlatform.label} aceita ${selectedPlatform.fileTypeLabel}. Troque o arquivo antes de importar.`,
      });
      return;
    }
    const importSourceKind = resolveCatalogImportSourceKind(selectedPlatform, catalogImportFiles);
    const monitorTitle = catalogImportTitle.trim() || selectedPlatform.defaultTitle || "Importacao de produtos";

    setCreatingCatalogImport(true);
    setNotice(null);
    setCatalogImportMonitor({
      open: true,
      jobId: null,
      title: monitorTitle,
      sourcePlatform: catalogImportSourcePlatform,
      sourceKind: importSourceKind,
      status: "preparing",
      message: "Lendo o arquivo e preparando a importacao.",
      previewItems: [],
      visiblePreviewCount: 0,
      errorMessage: null,
      startedAt: Date.now(),
    });

    try {
      const previewItems = await buildCatalogImportPreviewItems(catalogImportFiles, catalogImportSourcePlatform);

      setCatalogImportMonitor((current) => current?.open ? {
        ...current,
        status: "uploading",
        message: previewItems.length > 0
          ? "Encontramos uma pre-visualizacao do arquivo. Agora a IA vai validar os produtos."
          : "Arquivo enviado para leitura. A IA vai identificar produtos, precos e imagens.",
        previewItems,
        visiblePreviewCount: Math.min(previewItems.length, 1),
      } : current);

      const formData = new FormData();
      formData.set("companyId", selectedCompanyId);
      formData.set("sourceKind", importSourceKind);
      formData.set("sourcePlatform", catalogImportSourcePlatform);
      formData.set("targetMode", catalogImportTargetMode);
      formData.set("defaultSalesDestination", catalogImportDefaultDestination);
      formData.set("title", catalogImportTitle);
      formData.set("text", catalogImportText);
      formData.set(
        "assignedAgentIds",
        JSON.stringify(selectedCatalogImportAgentScope?.agentId ? [selectedCatalogImportAgentScope.agentId] : []),
      );
      formData.set(
        "assignedWhatsappInstanceIds",
        JSON.stringify(selectedCatalogImportAgentScope ? [selectedCatalogImportAgentScope.id] : []),
      );

      for (const file of catalogImportFiles) {
        formData.append("files", file);
      }

      const response = await fetch("/api/dashboard/sales-catalog/imports", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null) as { importJob?: ClientSalesCatalogImportJob; error?: string } | null;

      if (!response.ok || !data?.importJob) {
        throw new Error(data?.error ?? "Nao foi possivel importar produtos.");
      }

      setCatalogImportJobs((current) => [data.importJob!, ...current.filter((job) => job.id !== data.importJob!.id)]);
      setCatalogImportMonitor((current) => current?.open ? {
        ...current,
        jobId: data.importJob!.id,
        status: data.importJob!.status,
        message: getCatalogImportMonitorMessage(data.importJob!),
        errorMessage: data.importJob!.errorMessage,
        visiblePreviewCount: data.importJob!.items.length > 0 ? current.previewItems.length : current.visiblePreviewCount,
      } : current);
      setCatalogImportText("");
      setCatalogImportFiles([]);
      setNotice({
        tone: data.importJob.status === "failed" ? "error" : "success",
        message: data.importJob.status === "failed"
          ? data.importJob.errorMessage ?? "Importacao criada, mas a extracao falhou."
          : data.importJob.items.length > 0
            ? `Importacao pronta para revisar: ${data.importJob.items.length} item(ns) encontrados.`
            : "Importacao enfileirada. O cron vai extrair os produtos em instantes.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao importar produtos.";
      setCatalogImportMonitor((current) => current?.open ? {
        ...current,
        status: "failed",
        message,
        errorMessage: message,
      } : current);
      setNotice({ tone: "error", message });
    } finally {
      setCreatingCatalogImport(false);
    }
  }

  function openCatalogImportMonitor(job: ClientSalesCatalogImportJob) {
    setCatalogImportMonitor({
      open: true,
      jobId: job.id,
      title: job.title ?? formatImportPlatform(job.sourcePlatform),
      sourcePlatform: job.sourcePlatform,
      sourceKind: job.sourceKind,
      status: job.status,
      message: getCatalogImportMonitorMessage(job),
      previewItems: job.items.map(mapImportItemToPreviewItem),
      visiblePreviewCount: job.items.length,
      errorMessage: job.errorMessage,
      startedAt: Date.now(),
    });

    if (job.status === "uploaded" || job.status === "extracting") {
      void refreshCatalogImports();
    }
  }

  function closeCatalogImportMonitor() {
    setCatalogImportMonitor((current) => current ? { ...current, open: false } : current);
  }

  async function saveCatalogImportReview(job: ClientSalesCatalogImportJob) {
    if (!selectedCompanyId || savingCatalogImportId) return;

    const patches = getCatalogImportPatchesForJob(job);
    if (patches.length === 0) {
      updateCatalogImportJobNotice(job.id, {
        tone: "warning",
        message: "A revisao ja esta salva. Edite algum campo ou clique em Publicar para liberar os produtos prontos.",
      });
      setNotice(null);
      return;
    }

    setSavingCatalogImportId(job.id);
    setNotice(null);
    updateCatalogImportJobNotice(job.id, null);

    try {
      const response = await fetch(`/api/dashboard/sales-catalog/imports/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          patches,
        }),
      });
      const data = await response.json().catch(() => null) as { importJob?: ClientSalesCatalogImportJob; error?: string } | null;

      if (!response.ok || !data?.importJob) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a revisao.");
      }

      setCatalogImportJobs((current) => current.map((entry) => (entry.id === data.importJob!.id ? data.importJob! : entry)));
      clearCatalogImportPatches(patches);
      updateCatalogImportJobNotice(job.id, { tone: "success", message: "Alteracoes da revisao salvas." });
      setNotice({ tone: "success", message: "Revisao salva." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar revisao.";
      updateCatalogImportJobNotice(job.id, { tone: "error", message });
      setNotice({ tone: "error", message });
    } finally {
      setSavingCatalogImportId(null);
    }
  }

  async function publishCatalogImport(job: ClientSalesCatalogImportJob) {
    if (!selectedCompanyId || publishingCatalogImportId) return;

    setPublishingCatalogImportId(job.id);
    setNotice(null);

    try {
      const patches = getCatalogImportPatchesForJob(job);
      const response = await fetch(`/api/dashboard/sales-catalog/imports/${encodeURIComponent(job.id)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          patches,
        }),
      });
      const data = await response.json().catch(() => null) as {
        importJob?: ClientSalesCatalogImportJob;
        items?: ClientSalesCatalogItem[];
        error?: string;
      } | null;

      if (!response.ok || !data?.importJob) {
        throw new Error(data?.error ?? "Nao foi possivel publicar a importacao.");
      }

      setCatalogImportJobs((current) => current.map((entry) => (entry.id === data.importJob!.id ? data.importJob! : entry)));
      if (data.items?.length) {
        setItems((current) => {
          const nextIds = new Set(data.items!.map((item) => item.id));
          return [...data.items!, ...current.filter((item) => !nextIds.has(item.id))];
        });
        publishSalesCatalogUpdated({
          companyId: selectedCompanyId,
          itemIds: data.items.map((item) => item.id),
        });
      }
      clearCatalogImportPatches(patches);
      updateCatalogImportJobNotice(job.id, {
        tone: data.importJob.errorMessage ? "warning" : "success",
        message: data.importJob.errorMessage ?? "Importacao publicada no catalogo.",
      });
      setNotice({
        tone: data.importJob.errorMessage ? "warning" : "success",
        message: data.importJob.errorMessage ?? `Importacao publicada: ${data.importJob.items.filter((item) => item.status === "published").length} item(ns).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao publicar importacao.";
      updateCatalogImportJobNotice(job.id, { tone: "error", message });
      setNotice({ tone: "error", message });
    } finally {
      setPublishingCatalogImportId(null);
    }
  }

  async function cancelCatalogImport(job: ClientSalesCatalogImportJob) {
    if (!selectedCompanyId || cancelingCatalogImportId || !canCancelCatalogImportJob(job)) return;

    const confirmed = window.confirm("Cancelar esta importacao? Os itens revisados serao ignorados e nada sera publicado.");
    if (!confirmed) return;

    setCancelingCatalogImportId(job.id);
    setNotice(null);

    try {
      const response = await fetch(`/api/dashboard/sales-catalog/imports/${encodeURIComponent(job.id)}?companyId=${encodeURIComponent(selectedCompanyId)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null) as { importJob?: ClientSalesCatalogImportJob; error?: string } | null;

      if (!response.ok || !data?.importJob) {
        throw new Error(data?.error ?? "Nao foi possivel cancelar a importacao.");
      }

      setCatalogImportJobs((current) => current.map((entry) => (entry.id === data.importJob!.id ? data.importJob! : entry)));
      clearCatalogImportPatches(data.importJob.items.map((item) => ({ id: item.id })));
      setCatalogImportMonitor((current) => current?.jobId === data.importJob!.id ? {
        ...current,
        status: data.importJob!.status,
        message: getCatalogImportMonitorMessage(data.importJob!),
        errorMessage: data.importJob!.errorMessage,
        visiblePreviewCount: data.importJob!.items.length,
      } : current);
      updateCatalogImportJobNotice(job.id, { tone: "success", message: "Importacao cancelada. Nenhum produto sera publicado." });
      setNotice({ tone: "success", message: "Importacao cancelada. Nenhum produto sera publicado." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao cancelar importacao.";
      updateCatalogImportJobNotice(job.id, { tone: "error", message });
      setNotice({ tone: "error", message });
    } finally {
      setCancelingCatalogImportId(null);
    }
  }

  async function deleteCatalogImport(job: ClientSalesCatalogImportJob) {
    if (!selectedCompanyId || deletingCatalogImportId || isCatalogImportJobActive(job)) return;

    const confirmed = window.confirm("Excluir esta importacao da lista? Produtos ja publicados nao serao apagados.");
    if (!confirmed) return;

    setDeletingCatalogImportId(job.id);
    setNotice(null);

    try {
      const response = await fetch(`/api/dashboard/sales-catalog/imports/${encodeURIComponent(job.id)}?companyId=${encodeURIComponent(selectedCompanyId)}&mode=remove`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null) as {
        deletedJobId?: string;
        error?: string;
        storageReleaseError?: string | null;
      } | null;

      if (!response.ok || !data?.deletedJobId) {
        throw new Error(data?.error ?? "Nao foi possivel excluir a importacao.");
      }

      setCatalogImportJobs((current) => current.filter((entry) => entry.id !== data.deletedJobId));
      clearCatalogImportPatches(job.items.map((item) => ({ id: item.id })));
      updateCatalogImportJobNotice(job.id, null);
      setCatalogImportMonitor((current) => current?.jobId === data.deletedJobId ? null : current);

      const message = data.storageReleaseError
        ? "Importacao excluida, mas o contador de armazenamento precisa ser conferido."
        : "Importacao excluida da lista.";
      setNotice({ tone: data.storageReleaseError ? "warning" : "success", message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao excluir importacao.";
      updateCatalogImportJobNotice(job.id, { tone: "error", message });
      setNotice({ tone: "error", message });
    } finally {
      setDeletingCatalogImportId(null);
    }
  }

  function getCatalogImportPatchesForJob(job: ClientSalesCatalogImportJob) {
    return job.items
      .map((item) => catalogImportPatches[item.id])
      .filter((patch): patch is SalesCatalogImportItemPatch => Boolean(patch));
  }

  function clearCatalogImportPatches(patches: SalesCatalogImportItemPatch[]) {
    if (patches.length === 0) return;

    const ids = new Set(patches.map((patch) => patch.id));
    setCatalogImportPatches((current) => Object.fromEntries(
      Object.entries(current).filter(([itemId]) => !ids.has(itemId)),
    ));
  }

  function updateCatalogImportJobNotice(jobId: string, nextNotice: Notice | null) {
    setCatalogImportJobNotices((current) => {
      if (nextNotice) {
        return { ...current, [jobId]: nextNotice };
      }

      if (!(jobId in current)) return current;
      const next = { ...current };
      delete next[jobId];
      return next;
    });
  }

  async function importWhatsappCatalog() {
    if (!selectedCompanyId || !selectedCatalogImportInstance || importing) return;

    setImporting(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_whatsapp_catalog",
          companyId: selectedCompanyId,
          whatsappInstanceId: selectedCatalogImportInstance.id,
        }),
      });
      const data = await response.json().catch(() => null) as {
        items?: ClientSalesCatalogItem[];
        imported?: number;
        updated?: number;
        skipped?: number;
        hasMore?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !data?.items) {
        throw new Error(data?.error ?? "Nao foi possivel importar o catalogo WhatsApp.");
      }

      setItems((current) => {
        const updatedIds = new Set(data.items!.map((item) => item.id));
        return [...data.items!, ...current.filter((item) => !updatedIds.has(item.id))];
      });
      publishSalesCatalogUpdated({
        companyId: selectedCompanyId,
        itemIds: data.items.map((item) => item.id),
      });

      setNotice({
        tone: "success",
        message: `Catalogo WhatsApp sincronizado: ${data.imported ?? 0} novos, ${data.updated ?? 0} atualizados${data.skipped ? `, ${data.skipped} ignorados` : ""}${data.hasMore ? ". Ainda ha mais paginas no provedor." : "."}`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao importar catalogo WhatsApp." });
    } finally {
      setImporting(false);
    }
  }

  async function exportWhatsappCatalog() {
    if (!selectedCompanyId || !selectedCatalogExportInstance || selectedCatalogExportItems.length === 0 || exportingWhatsappCatalog) return;

    setExportingWhatsappCatalog(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export_whatsapp_catalog",
          companyId: selectedCompanyId,
          whatsappInstanceId: selectedCatalogExportInstance.id,
          itemIds: selectedCatalogExportItems.map((item) => item.id),
        }),
      });
      const data = await response.json().catch(() => null) as {
        items?: ClientSalesCatalogItem[];
        exported?: number;
        providerSupported?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !data?.items) {
        throw new Error(data?.error ?? "Nao foi possivel exportar o catalogo para o WhatsApp.");
      }

      setItems((current) => {
        const updatedIds = new Set(data.items!.map((item) => item.id));
        return current.map((item) => updatedIds.has(item.id) ? data.items!.find((updated) => updated.id === item.id) ?? item : item);
      });
      setSelectedCatalogExportItemIds([]);

      setNotice({
        tone: data.providerSupported ? "success" : "warning",
        message: data.providerSupported
          ? `${data.exported ?? 0} produto(s) exportado(s) para o WhatsApp.`
          : `${data.exported ?? 0} produto(s) vinculados a ${selectedCatalogExportInstance.label}. A criacao nativa no catalogo WhatsApp fica pendente do endpoint de cadastro do provedor.`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao exportar catalogo WhatsApp." });
    } finally {
      setExportingWhatsappCatalog(false);
    }
  }

  function toggleWhatsappExportItem(itemId: string) {
    setSelectedCatalogExportItemIds((current) => (
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    ));
  }

  async function setWhatsappVisibility(item: ClientSalesCatalogItem, visible: boolean) {
    if (!item.whatsappCatalogId || visibilityId) return;

    setVisibilityId(item.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_whatsapp_visibility",
          companyId: item.companyId,
          itemId: item.id,
          visible,
        }),
      });
      const data = await response.json().catch(() => null) as { item?: ClientSalesCatalogItem; error?: string } | null;

      if (!response.ok || !data?.item) {
        throw new Error(data?.error ?? "Nao foi possivel sincronizar o produto no WhatsApp.");
      }

      setItems((current) => current.map((entry) => (entry.id === data.item!.id ? data.item! : entry)));
      publishSalesCatalogUpdated({ companyId: data.item.companyId, itemIds: [data.item.id] });
      setNotice({ tone: "success", message: visible ? "Produto exibido no catalogo WhatsApp." : "Produto ocultado no catalogo WhatsApp." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao sincronizar produto." });
    } finally {
      setVisibilityId(null);
    }
  }

  async function deleteItem(item: ClientSalesCatalogItem) {
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      return;
    }

    setDeletingId(item.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: item.companyId, itemId: item.id }),
      });
      const data = await response.json().catch(() => null) as { deletedItemId?: string; error?: string } | null;

      if (!response.ok || data?.deletedItemId !== item.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o item.");
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      publishSalesCatalogItemDeleted({ companyId: item.companyId, itemId: item.id });
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Item removido do catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir item." });
    } finally {
      setDeletingId(null);
    }
  }

  async function copyTag(item: ClientSalesCatalogItem) {
    const tag = item.salesDestination === "external_site" && item.externalLinkButtonTag ? item.externalLinkButtonTag : item.tag;
    try {
      await navigator.clipboard.writeText(tag);
      setNotice({ tone: "success", message: `Tag copiada: ${tag}` });
    } catch {
      setNotice({ tone: "warning", message: tag });
    }
  }

  async function copyStoreLink() {
    if (!selectedStorePath) return;

    const url = `${window.location.origin}${selectedStorePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ tone: "success", message: "Link da loja copiado." });
    } catch {
      setNotice({ tone: "warning", message: url });
    }
  }

  function openStorefrontSettings() {
    setActiveTab("setup");
    setStorefrontSettingsHighlighted(true);
    window.setTimeout(() => {
      document.getElementById("sales-catalog-storefront-settings")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      document.getElementById("sales-catalog-storefront-hero-title")?.focus();
    }, 0);
    window.setTimeout(() => setStorefrontSettingsHighlighted(false), 3600);
  }

  function editItem(item: ClientSalesCatalogItem) {
    if (item.companyId && item.companyId !== selectedCompanyId) {
      changeCompany(item.companyId);
    }

    setEditingItemId(item.id);
    setActiveTab("products");
    setTitle(item.title);
    setCategory(item.category ?? "");
    setHighlightLabel(item.highlightLabel ?? "");
    setStoreFeatured(item.storeFeatured);
    setStoreFeaturedRank(item.storeFeaturedRank !== null ? String(item.storeFeaturedRank) : "");
    setPrice(item.price ?? "");
    setSalesDestination(item.salesDestination);
    setProductUrl(item.productUrl ?? "");
    setExternalButtonLabel(item.externalLinkButtonLabel ?? item.title);
    setDescription(item.description);
    setSalePrice(item.offer.salePrice ?? "");
    setSaleStartsAt(item.offer.saleStartsAt ?? "");
    setSaleEndsAt(item.offer.saleEndsAt ?? "");
    setCouponCode(item.offer.couponCode ?? "");
    setCouponDescription(item.offer.couponDescription ?? "");
    setCallToAction(item.offer.callToAction ?? "");
    setOfferNotes(item.offer.notes ?? "");
    setStatus(item.status === "archived" ? "draft" : item.status);
    setSelectedAttributes(Object.fromEntries(item.attributes.map((attribute) => [attribute.id, attribute.values])));
    setInventoryStatus(item.inventory.status);
    setStockQuantity(item.inventory.quantity !== null ? String(item.inventory.quantity) : "");
    setLowStockThreshold(item.inventory.lowStockThreshold !== null ? String(item.inventory.lowStockThreshold) : "");
    setAllowBackorder(item.inventory.allowBackorder);
    setInventoryNotes(item.inventory.notes ?? "");
    setSkuDrafts(item.skus.map(buildSkuDraftFromSku));
    setFulfillmentMode(item.fulfillment.mode);
    setSchedulingRequired(item.fulfillment.schedulingRequired);
    setServiceDuration(item.fulfillment.serviceDuration ?? "");
    setDeliveryInstructions(item.fulfillment.deliveryInstructions ?? "");
    setAccessInstructions(item.fulfillment.accessInstructions ?? "");
    setWeightGrams(item.shipping.weightGrams !== null ? String(item.shipping.weightGrams) : "");
    setLengthCm(item.shipping.dimensions.lengthCm !== null ? String(item.shipping.dimensions.lengthCm) : "");
    setWidthCm(item.shipping.dimensions.widthCm !== null ? String(item.shipping.dimensions.widthCm) : "");
    setHeightCm(item.shipping.dimensions.heightCm !== null ? String(item.shipping.dimensions.heightCm) : "");
    setShippingProfile(item.shipping.profile);
    setShippingNotes(item.shipping.notes ?? "");
    setEditingMedia(item.media);
    setFiles([]);
    setConfirmDeleteId(null);
    setProductFormTab("essential");
    setNotice({ tone: "warning", message: `Editando item: ${item.title}` });
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).slice(0, 8));
    event.target.value = "";
  }

  function moveEditingMediaToCover(mediaId: string) {
    setEditingMedia((current) => {
      const target = current.find((media) => media.id === mediaId);

      if (!target || target.kind !== "image") return current;

      return [target, ...current.filter((media) => media.id !== mediaId)];
    });
  }

  function resetForm() {
    setEditingItemId(null);
    setEditingMedia([]);
    setTitle("");
    setCategory("");
    setHighlightLabel("");
    setStoreFeatured(false);
    setStoreFeaturedRank("");
    setPrice("");
    setSalesDestination("connectyhub_checkout");
    setProductUrl("");
    setExternalButtonLabel("");
    setDescription("");
    setSalePrice("");
    setSaleStartsAt("");
    setSaleEndsAt("");
    setCouponCode("");
    setCouponDescription("");
    setCallToAction("");
    setOfferNotes("");
    setStatus("active");
    setSelectedAttributes({});
    setInventoryStatus("in_stock");
    setStockQuantity("");
    setLowStockThreshold("");
    setAllowBackorder(false);
    setInventoryNotes("");
    setSkuDrafts([]);
    setFulfillmentMode("physical");
    setSchedulingRequired(false);
    setServiceDuration("");
    setDeliveryInstructions("");
    setAccessInstructions("");
    setWeightGrams("");
    setLengthCm("");
    setWidthCm("");
    setHeightCm("");
    setShippingProfile("default");
    setShippingNotes("");
    setFiles([]);
    setProductFormTab("essential");
  }

  function resetOrderForm() {
    setOrderItemId("");
    setOrderSkuId("");
    setOrderQuantity("1");
    setOrderCustomerName("");
    setOrderCustomerPhone("");
    setOrderCustomerDocument("");
    setOrderCustomerEmail("");
    setOrderDestinationCep("");
    setOrderDestinationAddress("");
    setOrderShippingTotal("");
    setOrderTotal("");
    setOrderPaymentMethod("");
    setOrderShippingMethod("");
    setOrderInternalNotes("");
    setOrderStatus("pending_payment");
    setOrderPaymentStatus("pending");
    setOrderFulfillmentStatus("pending");
  }

  if (companies.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Workspace / Vendas"
          title="Catalogo de Vendas"
          description="Cadastre uma empresa antes de montar o catalogo."
        />
        <Panel title="Empresa obrigatoria" eyebrow="catalogo">
          <Link
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200"
            href="/dashboard/empresa"
          >
            <Plus className="h-4 w-4" />
            Cadastrar empresa
          </Link>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace / Vendas"
        title="Catalogo de Vendas"
        description="Itens que o agente pode apresentar e enviar no WhatsApp."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NeonBadge tone="cyan">{visibleItems.length} itens</NeonBadge>
          </div>
        }
      />

      {notice ? (
        <div
          className={cn(
            "mb-4 rounded-xl border px-4 py-3 text-[12px]",
            notice.tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "",
            notice.tone === "warning" ? "border-amber-400/25 bg-amber-400/10 text-amber-100" : "",
            notice.tone === "error" ? "border-rose-400/25 bg-rose-400/10 text-rose-100" : "",
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mb-2 grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatTile icon={PackagePlus} label="Ativos" value={String(stats.active)} tone="green" />
        <StatTile icon={CheckCircle2} label="Prontos" value={String(stats.ready)} tone="cyan" />
        <StatTile icon={Upload} label="Arquivos" value={String(stats.media)} tone="amber" />
        <StatTile icon={CloudDownload} label="WhatsApp" value={String(stats.whatsapp)} tone="violet" />
        <StatTile icon={ClipboardList} label="Pedidos" value={String(stats.orderCount)} tone="rose" />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2">
        <CommerceTile label="Venda propria" value={String(stats.clientDirectOrders)} tone="green" />
        <CommerceTile label="Revenda CH" value={String(stats.connectyHubResaleOrders)} tone="cyan" />
        <CommerceTile label="Direta CH" value={String(stats.connectyHubDirectOrders)} tone="violet" />
        <CommerceTile label="Comissao" value={String(stats.commissionOrders)} tone="amber" />
      </div>

      <div className="mb-4 rounded-xl border p-3" style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <Store className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Loja publica</p>
              <p className="mt-1 truncate text-[14px] font-semibold text-slate-100">{selectedCompany?.name ?? "Empresa"}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {selectedStorePath ? selectedStorePath : "Escolha uma empresa para liberar o link da loja."}
              </p>
              <div className="mt-3 max-w-3xl rounded-lg border border-cyan-300/25 bg-cyan-300/5 px-3 py-2">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-cyan-200">Frase inicial da loja</p>
                <p className="mt-1 text-[12px] font-semibold leading-4 text-slate-100">
                  {storefrontHeroTitle} <span className="text-blue-300">{storefrontHeroHighlight}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{storefrontHeroSubtitle}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NeonBadge tone={featuredProductsCount > 1 ? "amber" : featuredProductsCount === 1 ? "green" : "zinc"}>
              {featuredProductsCount > 1 ? `${featuredProductsCount} em conflito` : `${featuredProductsCount} destaque`}
            </NeonBadge>
            <button
              type="button"
              onClick={openStorefrontSettings}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
            >
              <PencilLine className="h-3.5 w-3.5" />
              Editar frase
            </button>
            {selectedStorePath ? (
              <>
                <button
                  type="button"
                  onClick={copyStoreLink}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar link
                </button>
                <Link
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-400 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-emerald-300"
                  href={selectedStorePath}
                  target="_blank"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir loja
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div id="sales-catalog-tour-tabs" className="mb-4 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        <TabButton active={activeTab === "setup"} icon={Settings2} label="Configuracao" mobileLabel="Config." onClick={() => setActiveTab("setup")} />
        <TabButton active={activeTab === "shipping"} icon={Truck} label="Entrega e Frete" mobileLabel="Frete" onClick={() => setActiveTab("shipping")} />
        <TabButton active={activeTab === "products"} icon={PackagePlus} label="Produtos" onClick={() => setActiveTab("products")} />
        <TabButton active={activeTab === "checkout"} icon={CreditCard} label="Checkouts" mobileLabel="Checkouts" onClick={() => setActiveTab("checkout")} />
        <TabButton active={activeTab === "orders"} icon={ClipboardList} label="Pedidos WhatsApp" mobileLabel="Pedidos" onClick={() => setActiveTab("orders")} />
        <TabButton active={activeTab === "payments"} icon={CreditCard} label="Pagamentos" mobileLabel="Pagto." onClick={() => setActiveTab("payments")} />
      </div>

      {activeTab === "setup" ? (
        <Panel id="sales-catalog-tour-setup" title="Configuracao do Catalogo" eyebrow={selectedCompany?.name ?? "empresa"} tone="cyan" compact>
          <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.42fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <label className="block">
                <FieldLabel>Empresa</FieldLabel>
                <select
                  value={selectedCompanyId}
                  onChange={(event) => changeCompany(event.target.value)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel>Tipo de venda</FieldLabel>
                <select
                  value={settingsDraft.businessType}
                  onChange={(event) => applyBusinessTemplate(event.target.value as SalesCatalogBusinessType)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {salesCatalogBusinessTemplates.map((template) => (
                    <option key={template.value} value={template.value}>{template.label}</option>
                  ))}
                </select>
              </label>

              <AccordionSection
                id="sales-catalog-storefront-settings"
                icon={Store}
                title="Editar frase inicial da loja"
                tone="cyan"
                defaultOpen
                className={storefrontSettingsHighlighted ? "ring-2 ring-blue-500/70 ring-offset-2 ring-offset-white" : undefined}
              >
                <div className="grid gap-3">
                  <div className="rounded-lg border border-blue-300/40 bg-blue-50 px-3 py-2">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-blue-600">Previa da frase que aparece no topo da loja</p>
                    <p className="mt-1 text-[13px] font-bold leading-5 text-slate-950">
                      {storefrontHeroTitle} <span className="text-blue-600">{storefrontHeroHighlight}</span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{storefrontHeroSubtitle}</p>
                  </div>
                  <label className="block">
                    <FieldLabel>Frase principal em preto</FieldLabel>
                    <input
                      id="sales-catalog-storefront-hero-title"
                      value={settingsDraft.storefront.heroTitle ?? ""}
                      onChange={(event) => updateStorefrontSettings({ heroTitle: event.target.value.slice(0, 90) })}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder="Qualidade que voce sente."
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Frase em azul</FieldLabel>
                    <input
                      value={settingsDraft.storefront.heroHighlight ?? ""}
                      onChange={(event) => updateStorefrontSettings({ heroHighlight: event.target.value.slice(0, 90) })}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder="Resultados que voce ve."
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Descricao abaixo da frase</FieldLabel>
                    <textarea
                      value={settingsDraft.storefront.heroSubtitle ?? ""}
                      onChange={(event) => updateStorefrontSettings({ heroSubtitle: event.target.value.slice(0, 180) })}
                      className="min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      placeholder="Produtos certificados, procedencia garantida e entrega segura para todo o Brasil."
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <p className="text-[11px] leading-4 text-slate-500">
                    Depois de editar, clique em salvar para atualizar a frase da loja publica.
                  </p>
                  <button
                    type="button"
                    disabled={!selectedCompanyId || savingSettings}
                    onClick={saveSettings}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[12px] font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar frase da loja
                  </button>
                </div>
              </AccordionSection>

              <AccordionSection id="sales-catalog-tour-categories" icon={Tags} title="Categorias" tone="green" defaultOpen>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel>Categorias</FieldLabel>
                  <button
                    type="button"
                    onClick={() => addCategoryRow()}
                    className="inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova
                  </button>
                </div>

                <div className="grid gap-2">
                  {categoryRows.map((categoryName, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                      <input
                        value={categoryName}
                        onChange={(event) => updateCategoryRow(index, event.target.value)}
                        className="h-10 min-w-0 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                        placeholder="Nome da categoria"
                        style={{ borderColor: "var(--ch-border)" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeCategoryRow(index)}
                        className="grid h-10 w-10 place-items-center rounded-lg border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100"
                        style={{ borderColor: "var(--ch-border)" }}
                        title="Remover categoria"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

              </AccordionSection>

              <div className="grid gap-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    Estoque por variacao
                    <HelpHint title="Estoque por variacao">Ative quando cada tamanho, cor ou SKU precisa ter quantidade propria.</HelpHint>
                  </span>
                  <input
                    checked={settingsDraft.trackInventory}
                    type="checkbox"
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, trackInventory: event.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    Fotos por variacao
                    <HelpHint title="Fotos por variacao">Ative quando cada cor, modelo ou variacao deve ter midias diferentes.</HelpHint>
                  </span>
                  <input
                    checked={settingsDraft.variationMedia}
                    type="checkbox"
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, variationMedia: event.target.checked }))}
                  />
                </label>
              </div>
            </div>

            <div id="sales-catalog-tour-attributes" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>Variacoes</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addAttribute}
                    className="inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Manual
                  </button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {settingsDraft.attributes.map((attribute) => (
                  <div key={attribute.id} className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                    <div className="flex items-start gap-2">
                      <input
                        value={attribute.name}
                        onChange={(event) => updateAttribute(attribute.id, { name: event.target.value.slice(0, 50) })}
                        className="h-10 min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                        placeholder="Nome da variacao"
                        style={{ borderColor: "var(--ch-border)" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeAttribute(attribute.id)}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100"
                        style={{ borderColor: "var(--ch-border)" }}
                        title="Remover variacao"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      value={attribute.values.join("\n")}
                      onChange={(event) => updateAttribute(attribute.id, { values: parseLines(event.target.value).slice(0, 40) })}
                      className="mt-2 min-h-24 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      placeholder="Uma opcao por linha"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                      <input
                        checked={attribute.required}
                        type="checkbox"
                        onChange={(event) => updateAttribute(attribute.id, { required: event.target.checked })}
                      />
                      Obrigatoria no atendimento
                    </label>
                  </div>
                ))}
              </div>

              <AccordionSection id="sales-catalog-tour-payments" icon={CreditCard} title="Pagamentos no WhatsApp" tone="amber">
                <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
                  {settingsDraft.paymentMethods.map((method) => (
                    <div key={method.id} className="grid gap-2 py-3 first:pt-0 last:pb-0" style={{ borderColor: "var(--ch-border)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-200">
                          <input
                            checked={method.enabled}
                            type="checkbox"
                            onChange={(event) => updatePaymentMethod(method.id, { enabled: event.target.checked })}
                          />
                          {method.label}
                        </label>
                        <label className="flex items-center gap-2 text-[11px] text-slate-400">
                          <input
                            checked={method.requiresProof}
                            type="checkbox"
                            onChange={(event) => updatePaymentMethod(method.id, { requiresProof: event.target.checked })}
                          />
                          Comprovante
                        </label>
                      </div>
                      <input
                        value={method.instructions ?? ""}
                        onChange={(event) => updatePaymentMethod(method.id, { instructions: event.target.value.slice(0, 240) })}
                        className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                        placeholder="Regra que o agente deve seguir"
                        style={{ borderColor: "var(--ch-border)" }}
                      />
                    </div>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection icon={ClipboardList} title="Pedido e dados do lead" tone="violet" defaultOpen>
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="block">
                    <FieldLabel>Pedido minimo</FieldLabel>
                    <input
                      value={settingsDraft.orderPolicy.minimumOrderValue ?? ""}
                      onChange={(event) => updateOrderPolicy({ minimumOrderValue: event.target.value.slice(0, 40) })}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder="Opcional"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Reserva</FieldLabel>
                    <select
                      value={settingsDraft.orderPolicy.reservationPolicy}
                      onChange={(event) => updateOrderPolicy({ reservationPolicy: event.target.value as SalesCatalogReservationPolicy })}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    >
                      <option value="after_payment">Apos pagamento</option>
                      <option value="before_payment">Antes do pagamento</option>
                      <option value="manual_approval">Aprovacao humana</option>
                    </select>
                  </label>
                  <label className="block">
                    <FieldLabel>Carrinho parado</FieldLabel>
                    <input
                      value={settingsDraft.orderPolicy.abandonedCartMinutes ?? ""}
                      onChange={(event) => updateOrderPolicy({ abandonedCartMinutes: parseOptionalNumber(event.target.value) })}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      inputMode="numeric"
                      placeholder="Minutos"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Pos-venda</FieldLabel>
                    <input
                      value={settingsDraft.orderPolicy.followUpDays ?? ""}
                      onChange={(event) => updateOrderPolicy({ followUpDays: parseOptionalNumber(event.target.value) })}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      inputMode="numeric"
                      placeholder="Dias"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      Fechar sem pagamento
                      <HelpHint title="Fechar sem pagamento">Permite registrar o pedido antes do pagamento, quando a operacao confirmar depois.</HelpHint>
                    </span>
                    <input
                      checked={settingsDraft.orderPolicy.allowOrderWithoutPayment}
                      type="checkbox"
                      onChange={(event) => updateOrderPolicy({ allowOrderWithoutPayment: event.target.checked })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      Confirmacao humana
                      <HelpHint title="Confirmacao humana">Exige revisao de uma pessoa antes do pedido avancar.</HelpHint>
                    </span>
                    <input
                      checked={settingsDraft.orderPolicy.requireHumanConfirmation}
                      type="checkbox"
                      onChange={(event) => updateOrderPolicy({ requireHumanConfirmation: event.target.checked })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      Pedir CEP antes do frete
                      <HelpHint title="Pedir CEP antes do frete">Orienta o agente a coletar o CEP antes de prometer prazo ou valor de entrega.</HelpHint>
                    </span>
                    <input
                      checked={settingsDraft.orderPolicy.askCepBeforeQuote}
                      type="checkbox"
                      onChange={(event) => updateOrderPolicy({ askCepBeforeQuote: event.target.checked })}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Retencao</FieldLabel>
                    <input
                      value={settingsDraft.leadDataPolicy.retentionDays ?? ""}
                      onChange={(event) => updateLeadDataPolicy({ retentionDays: parseOptionalNumber(event.target.value) })}
                      className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      inputMode="numeric"
                      placeholder="Dias"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {salesCatalogLeadDataFields.map((field) => {
                    const checked = settingsDraft.leadDataPolicy.requiredFields.includes(field.value);
                    return (
                      <button
                        key={field.value}
                        type="button"
                        onClick={() => toggleLeadDataField(field.value)}
                        className={cn(
                          "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition",
                          checked ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
                        )}
                        style={{ borderColor: checked ? undefined : "var(--ch-border)" }}
                      >
                        {checked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                        {field.label}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-cyan-300" />
                    <FieldLabel>Consentimento</FieldLabel>
                  </div>
                  <input
                    value={settingsDraft.leadDataPolicy.consentMessage ?? ""}
                    onChange={(event) => updateLeadDataPolicy({ consentMessage: event.target.value.slice(0, 240) })}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Mensagem curta para uso dos dados do pedido"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </AccordionSection>

              <AccordionSection icon={MessageSquareText} title="Automacoes do checkout" tone="cyan">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 p-3">
                  <p className="text-[13px] font-semibold text-slate-100">
                    Mensagens automaticas, WhatsApp de envio e Order Bump agora ficam em Automacoes.
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-400">
                    O catalogo fica responsavel por produtos, pagamento, frete e pedido. As mensagens que o agente envia ao lead ficam em um ambiente unico.
                  </p>
                  <Link
                    href="/dashboard/automacoes"
                    className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/35 px-3 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/10"
                  >
                    <MessageSquareText className="h-4 w-4" />
                    Gerenciar automacoes
                  </Link>
                </div>
              </AccordionSection>

              <button
                type="button"
                disabled={!selectedCompanyId || savingSettings}
                onClick={saveSettings}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar e continuar
              </button>
            </div>
          </div>
        </Panel>
      ) : activeTab === "shipping" ? (
        <Panel id="sales-catalog-tour-shipping" title="Entrega e Frete" eyebrow={selectedCompany?.name ?? "empresa"} tone="green" compact>
          <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.34fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <label className="block">
                <FieldLabel>Empresa</FieldLabel>
                <select
                  value={selectedCompanyId}
                  onChange={(event) => changeCompany(event.target.value)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel>CEP de origem</FieldLabel>
                <input
                  value={shippingDraft.originCep}
                  onChange={(event) => setShippingDraft((current) => ({ ...current, originCep: cepInput(event.target.value) }))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  inputMode="numeric"
                  placeholder="00000-000"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Estados ativos</p>
                  <p className="mt-2 font-mono text-[24px] font-bold text-cyan-200">{shippingDraft.rules.filter((rule) => rule.active).length}</p>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Status</p>
                  <p className="mt-2 text-[13px] font-semibold text-slate-200">{selectedShippingSettings?.configured ? "Configurado" : "Pendente"}</p>
                </div>
              </div>

              <label className="block">
                <FieldLabel>Separacao</FieldLabel>
                <input
                  value={shippingDraft.defaultHandlingDays}
                  onChange={(event) => setShippingDraft((current) => ({ ...current, defaultHandlingDays: digitsOnly(event.target.value, 2) }))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  inputMode="numeric"
                  placeholder="Dias internos"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                <span className="flex items-center gap-1.5 text-slate-300">
                  Retirada local
                  <HelpHint title="Retirada local">Ative quando o cliente puder retirar o pedido no endereco combinado.</HelpHint>
                </span>
                <input
                  checked={shippingDraft.localPickup}
                  type="checkbox"
                  onChange={(event) => setShippingDraft((current) => ({ ...current, localPickup: event.target.checked }))}
                />
              </label>

              <button
                type="button"
                disabled={!selectedCompanyId || savingShipping}
                onClick={saveShippingSettings}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingShipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar frete
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--ch-border)" }}>
              <div className="overflow-visible md:overflow-x-auto">
                <div className="min-w-0 md:min-w-[1120px]">
                  <div className="hidden grid-cols-[72px_minmax(150px,1fr)_112px_112px_110px_100px_100px_130px_88px] gap-2 border-b px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-slate-500 md:grid" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                    <span>Estado</span>
                    <span>Atendimento</span>
                    <span>CEP ini.</span>
                    <span>CEP fim</span>
                    <span>Valor</span>
                    <span>Prazo min.</span>
                    <span>Prazo max.</span>
                    <span>Gratis acima</span>
                    <span>Faixas</span>
                  </div>
                  <div className="max-h-[620px] overflow-y-auto">
                    {shippingDraft.rules.map((rule) => (
                      <div
                        key={rule.uf}
                        className="grid gap-2 border-b px-3 py-3 last:border-b-0 md:grid-cols-[72px_minmax(150px,1fr)_112px_112px_110px_100px_100px_130px_88px] md:items-center md:py-2"
                        style={{ borderColor: "var(--ch-border)" }}
                      >
                        <div>
                          <p className="font-mono text-[12px] font-bold text-cyan-200">{rule.uf}</p>
                          <p className="truncate text-[10px] text-slate-500">{rule.state}</p>
                        </div>
                        <label className="flex items-center gap-2 text-[12px] text-slate-300">
                          <input
                            checked={rule.active}
                            type="checkbox"
                            onChange={(event) => updateShippingRule(rule.uf, { active: event.target.checked })}
                          />
                          Vende neste estado
                        </label>
                        <input
                          value={rule.cepStart ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { cepStart: cepInput(event.target.value) })}
                          className="h-10 min-w-0 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="00000-000"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.cepEnd ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { cepEnd: cepInput(event.target.value) })}
                          className="h-10 min-w-0 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="99999-999"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.price ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { price: event.target.value.slice(0, 40) })}
                          className="h-10 min-w-0 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          placeholder="R$ 29,90"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.minDays ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { minDays: parseOptionalNumber(event.target.value) })}
                          className="h-10 min-w-0 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="2"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.maxDays ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { maxDays: parseOptionalNumber(event.target.value) })}
                          className="h-10 min-w-0 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="5"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.freeShippingThreshold ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { freeShippingThreshold: event.target.value.slice(0, 40) })}
                          className="h-10 min-w-0 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          placeholder="R$ 300,00"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedShippingUf(rule.uf)}
                          className={cn(
                            "h-10 min-w-0 rounded-lg border px-2 font-mono text-[10px] font-semibold uppercase tracking-wide transition",
                            selectedShippingUf === rule.uf ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
                          )}
                          style={{ borderColor: selectedShippingUf === rule.uf ? undefined : "var(--ch-border)" }}
                        >
                          Editar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {selectedShippingRule ? (
              <AccordionSection icon={Truck} title="Servicos e faixas" tone="green" className="xl:col-span-2" defaultOpen>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <FieldLabel>Servicos e faixas</FieldLabel>
                    <p className="text-[12px] font-semibold text-slate-200">{selectedShippingRule.uf} - {selectedShippingRule.state}</p>
                  </div>
                  <select
                    value={selectedShippingUf}
                    onChange={(event) => setSelectedShippingUf(event.target.value)}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    {shippingDraft.rules.map((rule) => (
                      <option key={rule.uf} value={rule.uf}>{rule.uf} - {rule.state}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  {selectedShippingRule.services.map((service) => (
                    <div key={service.id} className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-200">
                          <input
                            checked={service.active}
                            type="checkbox"
                            onChange={(event) => updateShippingService(selectedShippingRule.uf, service.id, { active: event.target.checked })}
                          />
                          {service.name}
                        </label>
                        <NeonBadge tone={service.provider === "correios" ? "cyan" : "green"}>{service.provider === "correios" ? "Correios" : "Transp."}</NeonBadge>
                      </div>

                      <input
                        value={service.name}
                        onChange={(event) => updateShippingService(selectedShippingRule.uf, service.id, { name: event.target.value.slice(0, 80) })}
                        className="mt-3 h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                        placeholder="Nome do servico"
                        style={{ borderColor: "var(--ch-border)" }}
                      />

                      <div className="mt-3 overflow-visible md:overflow-x-auto">
                        <div className="grid min-w-0 gap-2 md:min-w-[520px]">
                          <div className="hidden grid-cols-[22px_minmax(120px,1.4fr)_92px_106px_58px_58px_34px] gap-2 px-1 font-mono text-[8px] uppercase tracking-widest text-slate-500 md:grid">
                            <span></span>
                            <span>Faixa</span>
                            <span>Peso</span>
                            <span>Valor</span>
                            <span>Min</span>
                            <span>Max</span>
                            <span></span>
                          </div>
                          {service.tiers.map((tier) => (
                            <div key={tier.id} className="grid gap-2 rounded-lg border border-white/10 p-2 md:grid-cols-[22px_minmax(120px,1.4fr)_92px_106px_58px_58px_34px] md:items-center md:border-0 md:p-0">
                              <input
                                checked={tier.active}
                                type="checkbox"
                                onChange={(event) => updateWeightTier(selectedShippingRule.uf, service.id, tier.id, { active: event.target.checked })}
                              />
                              <input
                                value={tier.name}
                                onChange={(event) => updateWeightTier(selectedShippingRule.uf, service.id, tier.id, { name: event.target.value.slice(0, 80) })}
                                className="h-9 min-w-0 rounded-lg border bg-transparent px-2 text-[11px] outline-none"
                                placeholder="Faixa"
                                style={{ borderColor: "var(--ch-border)" }}
                              />
                              <input
                                value={tier.maxWeightGrams ?? ""}
                                onChange={(event) => updateWeightTier(selectedShippingRule.uf, service.id, tier.id, { maxWeightGrams: parseOptionalNumber(event.target.value) })}
                                className="h-9 min-w-0 rounded-lg border bg-transparent px-2 text-[11px] outline-none"
                                inputMode="numeric"
                                placeholder="g"
                                style={{ borderColor: "var(--ch-border)" }}
                              />
                              <input
                                value={tier.price ?? ""}
                                onChange={(event) => updateWeightTier(selectedShippingRule.uf, service.id, tier.id, { price: event.target.value.slice(0, 40) })}
                                className="h-9 min-w-0 rounded-lg border bg-transparent px-2 text-[11px] outline-none"
                                placeholder="R$"
                                style={{ borderColor: "var(--ch-border)" }}
                              />
                              <input
                                value={tier.minDays ?? ""}
                                onChange={(event) => updateWeightTier(selectedShippingRule.uf, service.id, tier.id, { minDays: parseOptionalNumber(event.target.value) })}
                                className="h-9 min-w-0 rounded-lg border bg-transparent px-2 text-[11px] outline-none"
                                inputMode="numeric"
                                placeholder="min"
                                style={{ borderColor: "var(--ch-border)" }}
                              />
                              <input
                                value={tier.maxDays ?? ""}
                                onChange={(event) => updateWeightTier(selectedShippingRule.uf, service.id, tier.id, { maxDays: parseOptionalNumber(event.target.value) })}
                                className="h-9 min-w-0 rounded-lg border bg-transparent px-2 text-[11px] outline-none"
                                inputMode="numeric"
                                placeholder="max"
                                style={{ borderColor: "var(--ch-border)" }}
                              />
                              <button
                                type="button"
                                onClick={() => removeWeightTier(selectedShippingRule.uf, service.id, tier.id)}
                                className="grid h-9 w-9 place-items-center rounded-lg border text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-100"
                                style={{ borderColor: "var(--ch-border)" }}
                                title="Remover faixa"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => addWeightTier(selectedShippingRule.uf, service.id)}
                        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                        style={{ borderColor: "var(--ch-border)" }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar faixa
                      </button>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            ) : null}

            <AccordionSection icon={Truck} title="Calculo por CEP" tone="cyan" className="xl:col-span-2">
              <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_140px_150px]">
                <select
                  value={quoteItemId}
                  onChange={(event) => setQuoteItemId(event.target.value)}
                  className="h-11 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <option value="">Selecionar produto</option>
                  {visibleItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
                <input
                  value={quoteCep}
                  onChange={(event) => setQuoteCep(cepInput(event.target.value))}
                  className="h-11 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  inputMode="numeric"
                  placeholder="CEP destino"
                  style={{ borderColor: "var(--ch-border)" }}
                />
                <button
                  type="button"
                  disabled={!canCalculateQuote}
                  onClick={calculateQuote}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-bold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {calculatingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  Calcular
                </button>
              </div>

              {quoteResult ? (
                <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--ch-border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-slate-200">
                      {quoteResult.destination ? `${quoteResult.destination.uf} - ${quoteResult.destination.state}` : "Destino nao identificado"}
                    </p>
                    {quoteResult.item ? (
                      <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                        {formatSalesCatalogWeight(quoteResult.item.weightGrams)}
                        {quoteResult.item.weightSource === "default" ? " estimado" : ""}
                      </p>
                    ) : null}
                  </div>

                  {quoteResult.error ? (
                    <p className="mt-2 text-[12px] text-amber-200">{quoteResult.error}</p>
                  ) : null}

                  {quoteResult.quotes.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {quoteResult.quotes.map((quote) => (
                        <div key={`${quote.serviceId}-${quote.price}-${quote.minDays}-${quote.maxDays}`} className="rounded-lg border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] font-semibold text-slate-100">{quote.serviceName}</p>
                            <NeonBadge tone={quote.provider === "correios" ? "cyan" : "green"}>{quote.provider === "correios" ? "Correios" : quote.provider === "carrier" ? "Transp." : "Manual"}</NeonBadge>
                          </div>
                          <p className="mt-2 font-mono text-[18px] font-bold text-cyan-200">{quote.price}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatQuoteDeadline(quote.minDays, quote.maxDays)}</p>
                          {quote.notes ? <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-400">{quote.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </AccordionSection>
          </div>
        </Panel>
      ) : activeTab === "checkout" ? (
        <div className="grid gap-4">
          <Panel title="Checkouts e pedidos" eyebrow={selectedCompany?.name ?? "acompanhamento"} tone="cyan" compact>
            <CheckoutStageOverview summary={checkoutSummary} />
            <CheckoutStageFilterBar
              className="mt-4"
              value={checkoutStageFilter}
              onChange={setCheckoutStageFilter}
            />

            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[12px] leading-5 text-amber-100">
              Checkouts abandonados sao calculados a partir de pedidos pendentes sem pagamento confirmado por mais de {abandonedCheckoutMinutes} minuto(s). Eles continuam no historico do lead e nao entram como produto cadastrado.
            </div>

            {filteredCheckoutRecords.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {filteredCheckoutRecords.map((record) => (
                  <CheckoutRecordCard key={`${record.order.id}-${record.paymentSession?.id ?? "no-session"}`} record={record} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                Nenhum checkout encontrado neste filtro.
              </div>
            )}
          </Panel>
        </div>
      ) : activeTab === "payments" ? (
        <div className="grid gap-4">
          <Panel title="Sessoes de pagamento" eyebrow={selectedCompany?.name ?? "checkout"} tone="amber" compact>
            <CommerceRevenueOverview summary={commerceSummary} />
            <CommercialFlowFilterBar
              className="mt-4"
              value={paymentFlowFilter}
              onChange={setPaymentFlowFilter}
            />

            {filteredPaymentSessions.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {filteredPaymentSessions.slice(0, 12).map((session) => (
                  <PaymentSessionCard key={session.id} session={session} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                Nenhum checkout encontrado neste filtro.
              </div>
            )}
          </Panel>
        </div>
      ) : activeTab === "orders" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.58fr)_minmax(0,1fr)]">
          <Panel id="sales-catalog-tour-orders" title="Novo pedido WhatsApp" eyebrow={selectedCompany?.name ?? "empresa"} tone="violet" compact>
            <div className="space-y-3">
              <label className="block">
                <FieldLabel>Empresa</FieldLabel>
                <select
                  value={selectedCompanyId}
                  onChange={(event) => changeCompany(event.target.value)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <FieldLabel>Produto do pedido</FieldLabel>
                <select
                  value={orderItemId}
                  onChange={(event) => selectOrderItem(event.target.value)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <option value="">Selecionar item do catalogo</option>
                  {visibleItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}{item.offer.salePrice ? ` - ${item.offer.salePrice}` : item.price ? ` - ${item.price}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedOrderItem?.skus.length ? (
                <label className="block">
                  <FieldLabel>SKU / variacao</FieldLabel>
                  <select
                    value={orderSkuId}
                    onChange={(event) => {
                      const sku = selectedOrderItem.skus.find((entry) => entry.id === event.target.value) ?? null;
                      setOrderSkuId(event.target.value);
                      setOrderTotal(sku?.salePrice ?? sku?.price ?? selectedOrderItem.offer.salePrice ?? selectedOrderItem.price ?? "");
                    }}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <option value="">Sem SKU especifico</option>
                    {selectedOrderItem.skus.map((sku) => (
                      <option key={sku.id ?? sku.skuCode} value={sku.id ?? ""}>
                        {sku.skuCode}{sku.title ? ` - ${sku.title}` : ""}{sku.salePrice ? ` - ${sku.salePrice}` : sku.price ? ` - ${sku.price}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
                <label className="block">
                  <FieldLabel>Qtd.</FieldLabel>
                  <input
                    value={orderQuantity}
                    onChange={(event) => setOrderQuantity(digitsOnly(event.target.value, 5) || "1")}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="numeric"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Total</FieldLabel>
                  <input
                    value={orderTotal}
                    onChange={(event) => setOrderTotal(event.target.value.slice(0, 80))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="R$ 197,00"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </div>

              <AccordionSection icon={MessageSquareText} title="Lead no WhatsApp" tone="cyan" defaultOpen>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={orderCustomerName}
                    onChange={(event) => setOrderCustomerName(event.target.value.slice(0, 140))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Nome do lead"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                  <input
                    value={orderCustomerPhone}
                    onChange={(event) => setOrderCustomerPhone(event.target.value.slice(0, 40))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Telefone WhatsApp"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                  <input
                    value={orderCustomerDocument}
                    onChange={(event) => setOrderCustomerDocument(event.target.value.slice(0, 40))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="CPF/CNPJ opcional"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                  <input
                    value={orderCustomerEmail}
                    onChange={(event) => setOrderCustomerEmail(event.target.value.slice(0, 160))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="E-mail opcional"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </div>
              </AccordionSection>

              <AccordionSection icon={Truck} title="Entrega e pagamento" tone="green">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={orderDestinationCep}
                    onChange={(event) => setOrderDestinationCep(cepInput(event.target.value))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="numeric"
                    placeholder="CEP"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                  <input
                    value={orderShippingTotal}
                    onChange={(event) => setOrderShippingTotal(event.target.value.slice(0, 80))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Frete"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                  <input
                    value={orderPaymentMethod}
                    onChange={(event) => setOrderPaymentMethod(event.target.value.slice(0, 80))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Pagamento: Pix, link, boleto"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                  <input
                    value={orderShippingMethod}
                    onChange={(event) => setOrderShippingMethod(event.target.value.slice(0, 80))}
                    className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Entrega: PAC, Sedex, retirada"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </div>
                <input
                  value={orderDestinationAddress}
                  onChange={(event) => setOrderDestinationAddress(event.target.value.slice(0, 300))}
                  className="mt-3 h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Endereco de entrega"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </AccordionSection>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <FieldLabel>Pedido</FieldLabel>
                  <select
                    value={orderStatus}
                    onChange={(event) => setOrderStatus(event.target.value as SalesCatalogOrderStatus)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    {orderStatusOptions.map((option) => (
                      <option key={option} value={option}>{formatSalesCatalogOrderStatus(option)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>Pagamento</FieldLabel>
                  <select
                    value={orderPaymentStatus}
                    onChange={(event) => setOrderPaymentStatus(event.target.value as SalesCatalogPaymentStatus)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    {paymentStatusOptions.map((option) => (
                      <option key={option} value={option}>{formatSalesCatalogPaymentStatus(option)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>Execucao</FieldLabel>
                  <select
                    value={orderFulfillmentStatus}
                    onChange={(event) => setOrderFulfillmentStatus(event.target.value as SalesCatalogFulfillmentStatus)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    {fulfillmentStatusOptions.map((option) => (
                      <option key={option} value={option}>{formatSalesCatalogFulfillmentStatus(option)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <textarea
                value={orderInternalNotes}
                onChange={(event) => setOrderInternalNotes(event.target.value.slice(0, 1200))}
                className="min-h-24 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                placeholder="Observacoes internas do pedido, combinado no WhatsApp, comprovante, restricoes ou proximo passo."
                style={{ borderColor: "var(--ch-border)" }}
              />

              <button
                type="button"
                disabled={!canCreateOrder}
                onClick={createOrder}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                Registrar pedido
              </button>
            </div>
          </Panel>

          <Panel title="Pedidos WhatsApp" eyebrow={selectedCompany?.name ?? "acompanhamento"} tone="amber" compact>
            <CommerceRevenueOverview summary={commerceSummary} />
            <CommercialFlowFilterBar
              className="mt-4"
              value={orderFlowFilter}
              onChange={setOrderFlowFilter}
            />

            {filteredOrders.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    paymentSession={visiblePaymentSessions.find((session) => session.id === order.latestPaymentSessionId || session.orderId === order.id) ?? null}
                    order={order}
                    paymentLoading={creatingPaymentSessionId === order.id}
                    updating={updatingOrderId === order.id}
                    onCreatePayment={() => createOrderPaymentSession(order)}
                    onUpdate={(patch) => updateOrder(order, patch)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                Nenhum pedido encontrado neste filtro.
              </div>
            )}
          </Panel>
        </div>
      ) : (
        <div className={cn(
          "grid gap-4",
          activeTab === "products"
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]"
            : "xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]",
        )}>
        <div className={activeTab === "products" ? "contents" : "space-y-4"}>
          {activeTab === "products" ? (
          <>
          {!hasConfiguredSettings ? (
            <div className="order-0 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-[12px] text-amber-50 xl:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                  <div className="min-w-0">
                    <p className="font-semibold text-amber-100">Configuracao do catalogo pendente</p>
                    <p className="mt-1 text-slate-300">Voce ja pode cadastrar produtos. Complete a configuracao depois para regras de pagamento, pedidos e WhatsApp.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("setup")}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-amber-100 transition hover:bg-amber-300/10"
                  style={{ borderColor: "rgba(252, 211, 77, 0.35)" }}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Configurar
                </button>
              </div>
            </div>
          ) : null}
          {salesCatalogAiImportPanelEnabled ? (
            <SalesCatalogImportPanel
              companies={companies}
              companyName={selectedCompany?.name ?? "empresa"}
              connectedInstances={connectedWhatsappInstances}
              creating={creatingCatalogImport}
              defaultDestination={catalogImportDefaultDestination}
              files={catalogImportFiles}
              jobs={catalogImportJobs}
              jobNotices={catalogImportJobNotices}
              jobPatches={catalogImportPatches}
              loading={loadingCatalogImports}
              cancelingJobId={cancelingCatalogImportId}
              deletingJobId={deletingCatalogImportId}
              publishingJobId={publishingCatalogImportId}
              savingJobId={savingCatalogImportId}
              sourceKind={catalogImportSourceKind}
              sourcePlatform={catalogImportSourcePlatform}
              sourceText={catalogImportText}
              selectedAgentScopeId={catalogImportAgentScopeId}
              selectedCompanyId={selectedCompanyId}
              targetMode={catalogImportTargetMode}
              title={catalogImportTitle}
              onChangeAgentScope={setCatalogImportAgentScopeId}
              onChangeCompany={changeCompany}
              onChangeFiles={handleCatalogImportFiles}
              onChangeItem={updateCatalogImportItem}
              onChangeSourcePlatform={handleCatalogImportSourcePlatform}
              onChangeSourceText={setCatalogImportText}
              onChangeTargetMode={handleCatalogImportTargetMode}
              onChangeTitle={setCatalogImportTitle}
              onCancel={cancelCatalogImport}
              onCreate={createCatalogImport}
              onDelete={deleteCatalogImport}
              onOpenMonitor={openCatalogImportMonitor}
              onPublish={publishCatalogImport}
              onRefresh={refreshCatalogImports}
              onSaveReview={saveCatalogImportReview}
            />
          ) : null}
          {salesCatalogAiImportPanelEnabled && catalogImportMonitor?.open ? (
            <CatalogImportProgressModal
              job={monitoredCatalogImportJob}
              canceling={monitoredCatalogImportJob ? cancelingCatalogImportId === monitoredCatalogImportJob.id : false}
              loading={loadingCatalogImports || creatingCatalogImport}
              monitor={catalogImportMonitor}
              onCancel={cancelCatalogImport}
              onClose={closeCatalogImportMonitor}
              onRefresh={refreshCatalogImports}
            />
          ) : null}
          <WhatsAppCatalogBridgePanel
            className="order-2"
            companies={companies}
            companyName={selectedCompany?.name ?? "empresa"}
            canExport={canExportWhatsappCatalog}
            canImport={canImportWhatsappCatalog}
            connectedInstances={connectedWhatsappInstances}
            exportItemIds={selectedCatalogExportItems.map((item) => item.id)}
            exporting={exportingWhatsappCatalog}
            importing={importing}
            items={visibleWhatsappCatalogItems}
            selectedExportInstanceId={selectedCatalogExportInstance?.id ?? ""}
            selectedImportInstanceId={selectedCatalogImportInstance?.id ?? ""}
            selectedCompanyId={selectedCompanyId}
            onChangeCompany={changeCompany}
            onChangeExportInstance={setSelectedCatalogExportInstanceId}
            onChangeImportInstance={setSelectedCatalogImportInstanceId}
            onExport={exportWhatsappCatalog}
            onImport={importWhatsappCatalog}
            onToggleExportItem={toggleWhatsappExportItem}
          />
          <Panel className="order-1 overflow-visible" id="sales-catalog-tour-products" title={editingItemId ? "Editar item" : "Cadastrar produto manualmente"} eyebrow={selectedCompany?.name ?? "empresa"} tone="cyan" compact>
            <div className="space-y-3">
            <SalesProductFormTabs activeTab={productFormTab} onChange={setProductFormTab} tabs={salesCatalogProductFormTabs} />

            <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_130px_120px_130px_120px]" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">produto</p>
                <p className="mt-1 truncate text-[14px] font-semibold text-slate-100">{title.trim() || "Novo produto"}</p>
              </div>
              <MiniStat label="preco" value={price.trim() || "Sem preco"} />
              <MiniStat label="status" value={status} />
              <button type="button" onClick={() => setProductFormTab("media")} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10" style={{ borderColor: "var(--ch-border)" }}>
                <Upload className="h-3.5 w-3.5" />
                {files.length + editingMedia.length} midias
              </button>
              <button type="button" disabled={!canCreate} onClick={createItem} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>

            {productFormTab === "essential" ? (
              <>
            <label className="block">
              <FieldLabel>Empresa</FieldLabel>
              <select
                value={selectedCompanyId}
                onChange={(event) => changeCompany(event.target.value)}
                className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                style={{ borderColor: "var(--ch-border)" }}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <FieldLabel>Nome</FieldLabel>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                placeholder="Ex.: Plano mensal, camiseta preta, consulta inicial"
                style={{ borderColor: "var(--ch-border)" }}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>Categoria</FieldLabel>
                {categoryOptions.length > 0 ? (
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <option value="">Selecionar categoria</option>
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={category}
                    onChange={(event) => setCategory(event.target.value.slice(0, 80))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Produto, servico, plano"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                )}
              </label>
              <label className="block">
                <FieldLabel>Valor</FieldLabel>
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value.slice(0, 60))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="R$ 197,00"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <FieldLabel>Destino da venda</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                <DestinationButton
                  active={salesDestination === "connectyhub_checkout"}
                  icon={CreditCard}
                  label="Checkout CH"
                  onClick={() => setSalesDestination("connectyhub_checkout")}
                />
                <DestinationButton
                  active={salesDestination === "external_site"}
                  icon={ExternalLink}
                  label="Site externo"
                  onClick={() => setSalesDestination("external_site")}
                />
              </div>

              {salesDestination === "external_site" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="block">
                    <FieldLabel>Link do produto</FieldLabel>
                    <input
                      value={productUrl}
                      onChange={(event) => setProductUrl(event.target.value.slice(0, 1000))}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder="https://site.com/produto"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Texto do botao</FieldLabel>
                    <input
                      value={externalButtonLabel}
                      onChange={(event) => setExternalButtonLabel(event.target.value.slice(0, 48))}
                      className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder={title.trim() || "Comprar agora"}
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="block">
              <FieldLabel>Selo de destaque</FieldLabel>
              <HighlightLabelInput
                value={highlightLabel}
                onChange={setHighlightLabel}
                inputClassName="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                inputStyle={{ borderColor: "var(--ch-border)" }}
                placeholder="Ex.: Mais vendido, Mais procurado, Oferta especial"
                suggestions={highlightLabelSuggestions}
              />
            </div>

            <div className="grid gap-3 rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <label className="flex items-start gap-3">
                <input
                  checked={storeFeatured}
                  className="mt-1 h-4 w-4"
                  onChange={(event) => {
                    setStoreFeatured(event.target.checked);
                    if (event.target.checked) {
                      setStoreFeaturedRank("1");
                    } else {
                      setStoreFeaturedRank("");
                    }
                  }}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-slate-100">Produto principal da loja</span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                    Apenas um produto pode ocupar o topo da loja publica. Ao salvar, este produto substitui qualquer destaque anterior.
                  </span>
                </span>
              </label>
              {storeFeatured && currentFeaturedItem && currentFeaturedItem.id !== editingItemId ? (
                <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] leading-4 text-amber-100">
                  Destaque atual: {currentFeaturedItem.title}. Ao salvar, ele sera desmarcado automaticamente.
                </p>
              ) : null}
            </div>

            <label className="block">
              <FieldLabel>Descricao comercial</FieldLabel>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, 1800))}
                className="min-h-28 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                placeholder="O que e, para quem serve, principais beneficios, entrega, garantias e condicoes."
                style={{ borderColor: "var(--ch-border)" }}
              />
            </label>
              </>
            ) : null}

            {productFormTab === "pricing" ? (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="mb-3 flex items-center gap-2">
                <BadgePercent className="h-4 w-4 text-cyan-300" />
                <FieldLabel>Oferta e fechamento</FieldLabel>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Valor promocional</FieldLabel>
                  <input
                    value={salePrice}
                    onChange={(event) => setSalePrice(event.target.value.slice(0, 60))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="R$ 147,00"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Cupom</FieldLabel>
                  <input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]+/g, "").slice(0, 32))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="WHATS10"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Inicio</FieldLabel>
                  <input
                    value={saleStartsAt}
                    onChange={(event) => setSaleStartsAt(event.target.value)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    type="date"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Fim</FieldLabel>
                  <input
                    value={saleEndsAt}
                    onChange={(event) => setSaleEndsAt(event.target.value)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    type="date"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3">
                <input
                  value={couponDescription}
                  onChange={(event) => setCouponDescription(event.target.value.slice(0, 160))}
                  className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Ex.: 10% de desconto para pedidos fechados no WhatsApp"
                  style={{ borderColor: "var(--ch-border)" }}
                />
                <input
                  value={callToAction}
                  onChange={(event) => setCallToAction(event.target.value.slice(0, 180))}
                  className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Ex.: Posso reservar essa oferta para voce agora?"
                  style={{ borderColor: "var(--ch-border)" }}
                />
                <input
                  value={offerNotes}
                  onChange={(event) => setOfferNotes(event.target.value.slice(0, 240))}
                  className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Condicoes: nao cumulativo, valido enquanto houver estoque, pagamento via Pix"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </div>
            </div>
            ) : null}

            {productFormTab === "stock" ? (
              <>
            {productAttributes.length > 0 ? (
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                <div className="mb-3 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-cyan-300" />
                  <FieldLabel>Variacoes deste item</FieldLabel>
                </div>
                <div className="space-y-3">
                  {productAttributes.map((attribute) => (
                    <div key={attribute.id}>
                      <p className="mb-2 text-[11px] font-semibold text-slate-300">{attribute.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {attribute.values.map((value) => {
                          const checked = (selectedAttributes[attribute.id] ?? []).includes(value);
                          return (
                            <button
                              key={`${attribute.id}-${value}`}
                              type="button"
                              onClick={() => toggleSelectedAttribute(attribute, value)}
                              className={cn(
                                "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition",
                                checked ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
                              )}
                              style={{ borderColor: checked ? undefined : "var(--ch-border)" }}
                            >
                              {checked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="mb-3 flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-cyan-300" />
                <FieldLabel>Estoque deste item</FieldLabel>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <FieldLabel>Disponibilidade</FieldLabel>
                  <select
                    value={inventoryStatus}
                    onChange={(event) => setInventoryStatus(event.target.value as SalesCatalogStockStatus)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <option value="in_stock">Disponivel</option>
                    <option value="out_of_stock">Esgotado</option>
                    <option value="on_backorder">Sob encomenda</option>
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>Quantidade</FieldLabel>
                  <input
                    value={stockQuantity}
                    onChange={(event) => setStockQuantity(digitsOnly(event.target.value, 7))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="numeric"
                    placeholder={inventoryEnabled ? "Unidades" : "Opcional"}
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Alerta baixo</FieldLabel>
                  <input
                    value={lowStockThreshold}
                    onChange={(event) => setLowStockThreshold(digitsOnly(event.target.value, 7))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="numeric"
                    placeholder="Unidades"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                  <span className="text-slate-300">Aceita encomenda</span>
                  <input
                    checked={allowBackorder}
                    type="checkbox"
                    onChange={(event) => setAllowBackorder(event.target.checked)}
                  />
                </label>
                <input
                  value={inventoryNotes}
                  onChange={(event) => setInventoryNotes(event.target.value.slice(0, 240))}
                  className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Ex.: reposicao toda sexta, poucas unidades, lote sob pedido"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </div>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-cyan-300" />
                  <FieldLabel>SKUs e variacoes vendaveis</FieldLabel>
                </div>
                <button
                  type="button"
                  onClick={addSkuDraft}
                  className="inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar SKU
                </button>
              </div>

              {skuDrafts.length > 0 ? (
                <div className="grid gap-3">
                  {skuDrafts.map((sku, index) => (
                    <div key={`${sku.id ?? "new"}-${index}`} className="rounded-lg border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
                      <div className="grid gap-2 lg:grid-cols-[140px_minmax(160px,1fr)_minmax(180px,1.2fr)_90px]">
                        <input
                          value={sku.skuCode}
                          onChange={(event) => updateSkuDraft(index, { skuCode: skuCodeInput(event.target.value) })}
                          className="h-10 rounded-lg border bg-transparent px-3 font-mono text-[11px] outline-none"
                          placeholder="SKU"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={sku.title}
                          onChange={(event) => updateSkuDraft(index, { title: event.target.value.slice(0, 120) })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          placeholder="Nome interno"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={sku.attributesText}
                          onChange={(event) => updateSkuDraft(index, { attributesText: event.target.value.slice(0, 220) })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          placeholder="Atributo: opcao; atributo: opcao"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <button
                          type="button"
                          onClick={() => removeSkuDraft(index)}
                          className="grid h-10 place-items-center rounded-lg border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100"
                          style={{ borderColor: "var(--ch-border)" }}
                          title="Remover SKU"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                        <input
                          value={sku.price}
                          onChange={(event) => updateSkuDraft(index, { price: event.target.value.slice(0, 60) })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          placeholder="Preco"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={sku.salePrice}
                          onChange={(event) => updateSkuDraft(index, { salePrice: event.target.value.slice(0, 60) })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          placeholder="Oferta"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <select
                          value={sku.stockStatus}
                          onChange={(event) => updateSkuDraft(index, { stockStatus: event.target.value as SalesCatalogSku["stockStatus"] })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          style={{ borderColor: "var(--ch-border)" }}
                        >
                          <option value="in_stock">Disponivel</option>
                          <option value="out_of_stock">Esgotado</option>
                          <option value="on_backorder">Encomenda</option>
                        </select>
                        <input
                          value={sku.stockQuantity}
                          onChange={(event) => updateSkuDraft(index, { stockQuantity: digitsOnly(event.target.value, 7) })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="Qtd."
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={sku.weightGrams}
                          onChange={(event) => updateSkuDraft(index, { weightGrams: digitsOnly(event.target.value, 6) })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="Peso g"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <select
                          value={sku.status}
                          onChange={(event) => updateSkuDraft(index, { status: event.target.value as SalesCatalogSkuStatus })}
                          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                          style={{ borderColor: "var(--ch-border)" }}
                        >
                          <option value="active">Ativo</option>
                          <option value="draft">Rascunho</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                  Sem SKUs manuais. O sistema cria um SKU principal automaticamente ao salvar.
                </p>
              )}
            </div>
              </>
            ) : null}

            {productFormTab === "delivery" ? (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-cyan-300" />
                <FieldLabel>Entrega deste item</FieldLabel>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Tipo</FieldLabel>
                  <select
                    value={fulfillmentMode}
                    onChange={(event) => setFulfillmentMode(event.target.value as SalesCatalogFulfillmentMode)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <option value="physical">Produto fisico</option>
                    <option value="digital">Digital no WhatsApp</option>
                    <option value="service">Servico / agendamento</option>
                    <option value="subscription">Assinatura / plano</option>
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>Duracao ou prazo</FieldLabel>
                  <input
                    value={serviceDuration}
                    onChange={(event) => setServiceDuration(event.target.value.slice(0, 80))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    placeholder="Ex.: 1 hora, 30 dias, acesso imediato"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                  <span className="text-slate-300">Precisa agendar</span>
                  <input
                    checked={schedulingRequired}
                    type="checkbox"
                    onChange={(event) => setSchedulingRequired(event.target.checked)}
                  />
                </label>
                <input
                  value={accessInstructions}
                  onChange={(event) => setAccessInstructions(event.target.value.slice(0, 240))}
                  className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Acesso/execucao: link, arquivo, chamada, onboarding, renovacao"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </div>
              <input
                value={deliveryInstructions}
                onChange={(event) => setDeliveryInstructions(event.target.value.slice(0, 240))}
                className="mt-3 h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                placeholder="Instrucao de entrega: prazo, local, retirada, envio digital, dados necessarios"
                style={{ borderColor: "var(--ch-border)" }}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Peso</FieldLabel>
                  <input
                    value={weightGrams}
                    onChange={(event) => setWeightGrams(digitsOnly(event.target.value, 6))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="numeric"
                    placeholder="Gramas"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Frete</FieldLabel>
                  <select
                    value={shippingProfile}
                    onChange={(event) => setShippingProfile(event.target.value as SalesCatalogShippingProfile)}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <option value="default">Tabela por estado</option>
                    <option value="free">Frete gratis</option>
                    <option value="custom">Combinar no atendimento</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <FieldLabel>Comprimento</FieldLabel>
                  <input
                    value={lengthCm}
                    onChange={(event) => setLengthCm(decimalInput(event.target.value, 6))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="decimal"
                    placeholder="cm"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Largura</FieldLabel>
                  <input
                    value={widthCm}
                    onChange={(event) => setWidthCm(decimalInput(event.target.value, 6))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="decimal"
                    placeholder="cm"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Altura</FieldLabel>
                  <input
                    value={heightCm}
                    onChange={(event) => setHeightCm(decimalInput(event.target.value, 6))}
                    className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    inputMode="decimal"
                    placeholder="cm"
                    style={{ borderColor: "var(--ch-border)" }}
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <FieldLabel>Observacao de frete</FieldLabel>
                <input
                  value={shippingNotes}
                  onChange={(event) => setShippingNotes(event.target.value.slice(0, 240))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="Ex.: produto fragil, entrega refrigerada, envio em ate 2 dias"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>
            </div>
            ) : null}

            {productFormTab === "media" ? (
              <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="block">
                <FieldLabel>Fotos, GIFs, videos ou arquivos</FieldLabel>
                <label
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-center text-[12px] text-slate-400 transition hover:border-cyan-300/60 hover:text-cyan-200"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <Upload className="h-4 w-4" />
                  {files.length > 0 ? `${files.length} arquivo(s)` : "Selecionar arquivos"}
                  <input
                    multiple
                    accept="image/*,video/*,.gif,.mp4,.webm,.mov,.pdf,.doc,.docx,.txt,.md,.csv,.json,application/json"
                    className="sr-only"
                    type="file"
                    onChange={handleFiles}
                  />
                </label>
              </label>
              <label className="block">
                <FieldLabel>Status</FieldLabel>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as SalesCatalogItemStatus)}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {editingItemId && editingMedia.length > 0 ? (
              <div className="grid gap-2">
                {editingMedia.map((media) => {
                  const coverMediaId = editingMedia.find((entry) => entry.kind === "image")?.id ?? null;
                  const isCover = media.kind === "image" && media.id === coverMediaId;

                  return (
                    <div key={media.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                      <span className="flex min-w-0 items-center gap-2 text-slate-300">
                        <MediaIcon media={media} />
                        <span className="truncate">{media.fileName}</span>
                        {isCover ? <NeonBadge tone="green">Capa</NeonBadge> : null}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {media.kind === "image" && !isCover ? (
                          <button
                            type="button"
                            onClick={() => moveEditingMediaToCover(media.id)}
                            className="inline-flex h-7 items-center justify-center rounded-md border px-2 font-mono text-[9px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/10"
                            style={{ borderColor: "var(--ch-border)" }}
                            title="Usar como capa"
                          >
                            Capa
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setEditingMedia((current) => current.filter((entry) => entry.id !== media.id))}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100"
                          style={{ borderColor: "var(--ch-border)" }}
                          title="Remover arquivo"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {files.length > 0 ? (
              <div className="grid gap-2">
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="flex min-w-0 items-center gap-2 text-slate-300">
                      <FileIcon contentType={file.type} fileName={file.name} />
                      <span className="truncate">{file.name}</span>
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-slate-500">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100"
                      style={{ borderColor: "var(--ch-border)" }}
                      title="Remover arquivo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
              </>
            ) : null}

            <div className={cn("grid gap-2", editingItemId ? "sm:grid-cols-[minmax(0,1fr)_160px]" : "")}>
              <button
                type="button"
                disabled={!canCreate}
                onClick={createItem}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : editingItemId ? <Save className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
                {editingItemId ? "Salvar alteracoes" : "Cadastrar no catalogo"}
              </button>
              {editingItemId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-bold text-slate-300 transition hover:bg-slate-400/10 hover:text-slate-100"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              ) : null}
            </div>
            </div>
          </Panel>
          </>
          ) : (
          <WhatsAppCatalogBridgePanel
            companies={companies}
            companyName={selectedCompany?.name ?? "empresa"}
            canExport={canExportWhatsappCatalog}
            canImport={canImportWhatsappCatalog}
            connectedInstances={connectedWhatsappInstances}
            exportItemIds={selectedCatalogExportItems.map((item) => item.id)}
            exporting={exportingWhatsappCatalog}
            importing={importing}
            items={visibleWhatsappCatalogItems}
            selectedExportInstanceId={selectedCatalogExportInstance?.id ?? ""}
            selectedImportInstanceId={selectedCatalogImportInstance?.id ?? ""}
            selectedCompanyId={selectedCompanyId}
            onChangeCompany={changeCompany}
            onChangeExportInstance={setSelectedCatalogExportInstanceId}
            onChangeImportInstance={setSelectedCatalogImportInstanceId}
            onExport={exportWhatsappCatalog}
            onImport={importWhatsappCatalog}
            onToggleExportItem={toggleWhatsappExportItem}
          />
          )}
        </div>

        <Panel className={activeTab === "products" ? "order-3 xl:col-span-2" : undefined} title="Itens cadastrados" eyebrow={selectedCompany?.name ?? "catalogo"} tone="green" compact>
          {visibleItems.length > 0 ? (
            <div className="grid gap-3">
              {visibleItems.map((item) => (
                <CatalogItemCard
                  key={item.id}
                  confirmDelete={confirmDeleteId === item.id}
                  deleting={deletingId === item.id}
                  item={item}
                  visibilityLoading={visibilityId === item.id}
                  onCopy={() => copyTag(item)}
                  onDelete={() => deleteItem(item)}
                  onEdit={() => editItem(item)}
                  onWhatsappVisibility={(visible) => setWhatsappVisibility(item, visible)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
              Nenhum item cadastrado para esta empresa.
            </div>
          )}
        </Panel>
      </div>
      )}
    </>
  );
}

function WhatsAppCatalogBridgePanel({
  canExport,
  canImport,
  className,
  companies,
  companyName,
  connectedInstances,
  exportItemIds,
  exporting,
  importing,
  items,
  selectedCompanyId,
  selectedExportInstanceId,
  selectedImportInstanceId,
  onChangeCompany,
  onChangeExportInstance,
  onChangeImportInstance,
  onExport,
  onImport,
  onToggleExportItem,
}: {
  canExport: boolean;
  canImport: boolean;
  className?: string;
  companies: ClientCompany[];
  companyName: string;
  connectedInstances: ClientSalesCatalogWhatsappInstance[];
  exportItemIds: string[];
  exporting: boolean;
  importing: boolean;
  items: ClientSalesCatalogItem[];
  selectedCompanyId: string;
  selectedExportInstanceId: string;
  selectedImportInstanceId: string;
  onChangeCompany: (companyId: string) => void;
  onChangeExportInstance: (instanceId: string) => void;
  onChangeImportInstance: (instanceId: string) => void;
  onExport: () => void;
  onImport: () => void;
  onToggleExportItem: (itemId: string) => void;
}) {
  const exportIds = new Set(exportItemIds);
  const exportableItems = items.filter((item) => item.status !== "archived");
  const selectedExportInstance = connectedInstances.find((instance) => instance.id === selectedExportInstanceId) ?? null;

  return (
    <Panel className={className} title="Sincronizar com WhatsApp" eyebrow={`${companyName} / opcional`} tone="violet" compact>
      <div className="space-y-3">
        <div className="rounded-xl border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-[11px] leading-5 text-slate-600">
          <p className="font-semibold text-slate-900">Esta area e somente para catalogo nativo do WhatsApp.</p>
          <p className="mt-1">
            Produtos cadastrados no catalogo da empresa ja seguem a regra de agentes escolhida em cada item.
            Use aqui apenas para trazer produtos que ja existem no WhatsApp do agente.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <FieldLabel>Empresa</FieldLabel>
            <select
              value={selectedCompanyId}
              onChange={(event) => onChangeCompany(event.target.value)}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <FieldLabel>Importar do WhatsApp</FieldLabel>
            <select
              value={selectedImportInstanceId}
              onChange={(event) => onChangeImportInstance(event.target.value)}
              disabled={connectedInstances.length === 0}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {connectedInstances.length > 0 ? (
                connectedInstances.map((instance) => (
                  <option key={instance.id} value={instance.id}>{instance.label}</option>
                ))
              ) : (
                <option value="">Nenhuma instancia conectada</option>
              )}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={!canImport}
          onClick={onImport}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-bold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--ch-border)" }}
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Trazer produtos do WhatsApp
        </button>

        <div className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(220px,0.48fr)_minmax(0,1fr)]" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
          <div className="space-y-3">
            <label className="block">
              <FieldLabel>Vincular a agente</FieldLabel>
              <select
                value={selectedExportInstanceId}
                onChange={(event) => onChangeExportInstance(event.target.value)}
                disabled={connectedInstances.length === 0}
                className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                style={{ borderColor: "var(--ch-border)" }}
              >
                {connectedInstances.length > 0 ? (
                  connectedInstances.map((instance) => (
                    <option key={instance.id} value={instance.id}>{instance.label}</option>
                  ))
                ) : (
                  <option value="">Nenhuma instancia conectada</option>
                )}
              </select>
            </label>
            <MiniStat label="produtos WhatsApp" value={exportableItems.length.toString()} />
            <button
              type="button"
              disabled={!canExport}
              onClick={onExport}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-bold text-violet-100 transition hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              Vincular produtos do WhatsApp
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--ch-border)" }}>
            {exportableItems.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
                {exportableItems.map((item) => {
                  const checked = exportIds.has(item.id);
                  const assignedToSelected = Boolean(
                    selectedExportInstance
                    && (
                      item.assignedWhatsappInstanceIds.includes(selectedExportInstance.id)
                      || (selectedExportInstance.agentId ? item.assignedAgentIds.includes(selectedExportInstance.agentId) : false)
                    ),
                  );

                  return (
                    <label key={item.id} className="grid cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-[12px] transition hover:bg-cyan-400/5">
                      <input
                        checked={checked}
                        type="checkbox"
                        onChange={() => onToggleExportItem(item.id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-200">{item.title}</span>
                        <span className="block truncate text-[10px] text-slate-500">{item.price ? `${item.price} ${item.currency}` : item.category ?? item.tag}</span>
                      </span>
                      {assignedToSelected ? <NeonBadge tone="green">vinculado</NeonBadge> : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-[12px] text-slate-500">
                Nenhum produto do WhatsApp sincronizado. Clique em &quot;Trazer produtos do WhatsApp&quot; apenas se esse numero ja tiver catalogo nativo no WhatsApp.
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SalesCatalogImportPanel({
  companies,
  companyName,
  connectedInstances,
  creating,
  defaultDestination,
  files,
  jobs,
  jobNotices,
  jobPatches,
  loading,
  cancelingJobId,
  deletingJobId,
  publishingJobId,
  savingJobId,
  selectedAgentScopeId,
  selectedCompanyId,
  sourceKind,
  sourcePlatform,
  sourceText,
  targetMode,
  title,
  onChangeAgentScope,
  onChangeCompany,
  onChangeFiles,
  onChangeItem,
  onChangeSourcePlatform,
  onChangeSourceText,
  onChangeTargetMode,
  onChangeTitle,
  onCancel,
  onCreate,
  onDelete,
  onOpenMonitor,
  onPublish,
  onRefresh,
  onSaveReview,
}: {
  companies: ClientCompany[];
  companyName: string;
  connectedInstances: ClientSalesCatalogWhatsappInstance[];
  creating: boolean;
  defaultDestination: SalesCatalogImportDestination;
  files: File[];
  jobs: ClientSalesCatalogImportJob[];
  jobNotices: Record<string, Notice>;
  jobPatches: CatalogImportPatchMap;
  loading: boolean;
  cancelingJobId: string | null;
  deletingJobId: string | null;
  publishingJobId: string | null;
  savingJobId: string | null;
  selectedAgentScopeId: string;
  selectedCompanyId: string;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  sourceText: string;
  targetMode: SalesCatalogImportTargetMode;
  title: string;
  onChangeAgentScope: (instanceId: string) => void;
  onChangeCompany: (companyId: string) => void;
  onChangeFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeItem: (itemId: string, patch: Omit<SalesCatalogImportItemPatch, "id">) => void;
  onChangeSourcePlatform: (value: SalesCatalogImportPlatform) => void;
  onChangeSourceText: (value: string) => void;
  onChangeTargetMode: (value: SalesCatalogImportTargetMode) => void;
  onChangeTitle: (value: string) => void;
  onCancel: (job: ClientSalesCatalogImportJob) => void;
  onCreate: () => void;
  onDelete: (job: ClientSalesCatalogImportJob) => void;
  onOpenMonitor: (job: ClientSalesCatalogImportJob) => void;
  onPublish: (job: ClientSalesCatalogImportJob) => void;
  onRefresh: () => void;
  onSaveReview: (job: ClientSalesCatalogImportJob) => void;
}) {
  const hasInput = files.length > 0;
  const canCreate = hasInput && !creating;
  const selectedPlatform = getCatalogImportPlatformOption(sourcePlatform);
  const platformNotice = getCatalogImportPlatformNotice(sourcePlatform, sourceKind);
  const destinationNotice = getImportDestinationNotice(targetMode, defaultDestination);

  return (
    <Panel id="sales-catalog-ai-importer" title="Importador IA" eyebrow={companyName} tone="green" compact>
      <div className="space-y-3">
        <div className="grid gap-2 lg:grid-cols-2">
          <label className="block">
            <FieldLabel>Empresa de destino</FieldLabel>
            <select
              value={selectedCompanyId}
              onChange={(event) => onChangeCompany(event.target.value)}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Os produtos entram no catalogo desta empresa.</p>
          </label>

          <label className="block">
            <FieldLabel>Agentes que vendem</FieldLabel>
            <select
              value={selectedAgentScopeId}
              onChange={(event) => onChangeAgentScope(event.target.value)}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              style={{ borderColor: "var(--ch-border)" }}
            >
              <option value="">Todos os agentes da empresa</option>
              {connectedInstances.map((instance) => (
                <option key={instance.id} value={instance.id}>{instance.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Deixe em todos para qualquer agente da empresa vender; escolha um agente para restringir.
            </p>
          </label>
        </div>

        <div className="grid gap-2 lg:grid-cols-[1.2fr_0.7fr_1fr]">
          <label className="block">
            <FieldLabel>Plataforma</FieldLabel>
            <select
              value={sourcePlatform}
              onChange={(event) => onChangeSourcePlatform(event.target.value as SalesCatalogImportPlatform)}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {catalogImportPlatformOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{selectedPlatform.description}</p>
          </label>
          <label className="block">
            <FieldLabel>Arquivo esperado</FieldLabel>
            <div
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-[12px]"
              style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}
            >
              <span className="font-semibold text-slate-200">{selectedPlatform.fileTypeLabel}</span>
              <NeonBadge tone="cyan">{formatImportSourceKind(sourceKind)}</NeonBadge>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{selectedPlatform.fileExample}</p>
          </label>
          <label className="block">
            <FieldLabel>Titulo</FieldLabel>
            <input
              value={title}
              onChange={(event) => onChangeTitle(event.target.value.slice(0, 140))}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              placeholder="Cardapio, catalogo ou lista de produtos"
              style={{ borderColor: "var(--ch-border)" }}
            />
          </label>
        </div>

        <div className="rounded-xl border px-3 py-2 text-[11px] leading-5" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
          <p className="font-semibold text-slate-200">{platformNotice.title}</p>
          <p className="mt-1 text-slate-500">{platformNotice.description}</p>
        </div>

        <div className="grid gap-2">
          <FieldLabel>Destino da venda</FieldLabel>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <ImportChoiceButton
              active={targetMode === "connectyhub_checkout"}
              icon={CreditCard}
              label="Vender na CH"
              onClick={() => onChangeTargetMode("connectyhub_checkout")}
            />
            <ImportChoiceButton
              active={targetMode === "external_site"}
              icon={ExternalLink}
              label="Manter link"
              onClick={() => onChangeTargetMode("external_site")}
            />
          </div>
          <div className="rounded-lg border px-3 py-2 text-[11px] leading-5" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
            <p className="font-semibold text-slate-300">{destinationNotice.title}</p>
            <p className="mt-1 text-slate-500">{destinationNotice.description}</p>
          </div>
        </div>

        <label className="block">
          <FieldLabel>Observacoes opcionais</FieldLabel>
          <textarea
            value={sourceText}
            onChange={(event) => onChangeSourceText(event.target.value.slice(0, 60000))}
            className="min-h-28 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
            placeholder="Use apenas para orientar a leitura do arquivo, como regras de frete, categorias ou observacoes comerciais."
            style={{ borderColor: "var(--ch-border)" }}
          />
        </label>

        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-[12px] font-bold text-cyan-100 transition hover:bg-cyan-400/10" style={{ borderColor: "var(--ch-border)" }}>
          <Upload className="h-4 w-4" />
          {files.length > 0 ? `${files.length} arquivo(s)` : "Anexar arquivo, cardapio ou foto"}
          <input
            type="file"
            multiple
            accept={selectedPlatform.accept}
            className="sr-only"
            onChange={onChangeFiles}
          />
        </label>

        {files.length > 0 ? (
          <div className="grid gap-1.5">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
                <span className="flex min-w-0 items-center gap-2 text-slate-300">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                  <span className="truncate">{file.name}</span>
                </span>
                <span className="shrink-0 font-mono text-slate-500">{formatFileSize(file.size)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canCreate}
          onClick={onCreate}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
          Importar com IA
        </button>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">importacoes</p>
            <p className="mt-1 text-[11px] text-slate-500">{jobs.length} job(s) recentes</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        </div>

        {jobs.length > 0 ? (
          <div className="grid max-h-[760px] gap-3 overflow-y-auto pr-1">
            {jobs.map((job) => (
              <CatalogImportJobCard
                key={job.id}
                job={job}
                canceling={cancelingJobId === job.id}
                deleting={deletingJobId === job.id}
                hasChanges={job.items.some((item) => Boolean(jobPatches[item.id]))}
                publishing={publishingJobId === job.id}
                saving={savingJobId === job.id}
                notice={jobNotices[job.id] ?? null}
                onChangeItem={onChangeItem}
                onCancel={() => onCancel(job)}
                onDelete={() => onDelete(job)}
                onOpenMonitor={() => onOpenMonitor(job)}
                onPublish={() => onPublish(job)}
                onSaveReview={() => onSaveReview(job)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            Nenhuma importacao criada para esta empresa.
          </div>
        )}
      </div>
    </Panel>
  );
}

function ImportChoiceButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-lg border px-2 font-mono text-[10px] font-bold uppercase tracking-wide transition",
        active ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100" : "text-slate-500 hover:bg-emerald-400/10 hover:text-emerald-100",
      )}
      style={{ borderColor: active ? undefined : "var(--ch-border)" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function DuplicateActionButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-lg border px-2 font-mono text-[10px] font-bold uppercase tracking-wide transition",
        active ? "border-amber-300/70 bg-amber-300/20 text-amber-900" : "text-slate-600 hover:bg-amber-400/10 hover:text-amber-900",
      )}
      style={{ borderColor: active ? undefined : "var(--ch-border)" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function CatalogImportProgressModal({
  job,
  canceling,
  loading,
  monitor,
  onCancel,
  onClose,
  onRefresh,
}: {
  job: ClientSalesCatalogImportJob | null;
  canceling: boolean;
  loading: boolean;
  monitor: CatalogImportMonitorState;
  onCancel: (job: ClientSalesCatalogImportJob) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const canceled = job ? isCatalogImportJobCanceled(job) : false;
  const officialItems = canceled ? [] : job?.items.map(mapImportItemToPreviewItem) ?? [];
  const visiblePreviewItems = monitor.previewItems.slice(0, Math.max(0, monitor.visiblePreviewCount));
  const visibleItems = canceled ? [] : officialItems.length > 0 ? officialItems : visiblePreviewItems;
  const active = job ? isCatalogImportJobActive(job) : monitor.status === "preparing" || monitor.status === "uploading";
  const progress = job ? getCatalogImportJobProgress(job) : getCatalogImportMonitorProgress(monitor);
  const statusLabel = job ? formatCatalogImportJobStatus(job) : formatCatalogImportMonitorStatus(monitor.status);
  const message = job ? getCatalogImportMonitorMessage(job) : monitor.message;
  const errorMessage = job?.errorMessage ?? monitor.errorMessage;
  const itemCount = job?.items.length ?? monitor.previewItems.length;
  const imageCount = job?.items.filter((item) => item.imageUrl).length ?? monitor.previewItems.filter((item) => item.imageUrl).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-blue-500">importacao com ia</p>
            <h3 className="mt-1 truncate text-xl font-bold text-slate-950">{monitor.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
          </div>
          <div className="flex items-center gap-2">
            <NeonBadge tone={job ? catalogImportJobStatusTone(job) : monitor.status === "failed" ? "rose" : active ? "cyan" : "green"}>
              {statusLabel}
            </NeonBadge>
            {job && canCancelCatalogImportJob(job) ? (
              <button
                type="button"
                disabled={canceling || loading}
                onClick={() => onCancel(job)}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-rose-200 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                {canceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Cancelar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="Fechar acompanhamento da importacao"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">progresso</span>
                {active || loading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    job
                      ? job.status === "failed" && !isCatalogImportJobCanceled(job) ? "bg-rose-500" : "bg-blue-500"
                      : monitor.status === "failed" ? "bg-rose-500" : "bg-blue-500",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-3 font-mono text-2xl font-bold text-slate-950">{progress}%</p>
              <p className="text-xs text-slate-500">
                {canceled
                  ? "Importacao encerrada pelo usuario."
                  : officialItems.length > 0
                  ? "Produtos oficiais carregados do banco."
                  : "Pre-visualizacao do arquivo enquanto a IA processa."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="itens" value={String(itemCount)} />
              <MiniStat label="imagens" value={String(imageCount)} />
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar leitura
            </button>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">produtos encontrados</p>
                <p className="text-xs text-slate-500">{formatImportPlatform(monitor.sourcePlatform)} / {formatImportSourceKind(monitor.sourceKind)}</p>
              </div>
              {active ? <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_18px_rgba(24,119,242,0.8)]" /> : null}
            </div>

            <div className="max-h-[460px] overflow-y-auto p-3">
              {canceled ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-900">Importacao cancelada</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Os produtos encontrados ficaram ocultos da revisao e nao serao publicados.
                  </p>
                </div>
              ) : visibleItems.length > 0 ? (
                <div className="grid gap-2">
                  {visibleItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        {item.imageUrl ? <ImageIcon className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{index + 1}. {item.title}</p>
                        <p className="truncate text-xs text-slate-500">{item.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.price ? <span className="font-mono text-xs font-bold text-slate-900">{item.price}</span> : null}
                        <ImportPreviewStatusDot status={item.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-14 animate-pulse rounded-xl bg-white" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportPreviewStatusDot({ status }: { status: CatalogImportPreviewItemStatus }) {
  const tone = status === "failed"
    ? "bg-rose-500"
    : status === "warning"
      ? "bg-amber-400"
      : status === "ready"
        ? "bg-emerald-500"
        : "bg-cyan-500";

  return <span className={cn("h-2.5 w-2.5 rounded-full", tone)} />;
}

function CatalogImportJobCard({
  job,
  canceling,
  deleting,
  hasChanges,
  notice,
  publishing,
  saving,
  onChangeItem,
  onCancel,
  onDelete,
  onOpenMonitor,
  onPublish,
  onSaveReview,
}: {
  job: ClientSalesCatalogImportJob;
  canceling: boolean;
  deleting: boolean;
  hasChanges: boolean;
  notice: Notice | null;
  publishing: boolean;
  saving: boolean;
  onChangeItem: (itemId: string, patch: Omit<SalesCatalogImportItemPatch, "id">) => void;
  onCancel: () => void;
  onDelete: () => void;
  onOpenMonitor: () => void;
  onPublish: () => void;
  onSaveReview: () => void;
}) {
  const canceled = isCatalogImportJobCanceled(job);
  const pendingItems = canceled ? [] : job.items.filter(isCatalogImportItemPendingReview);
  const canPublish = pendingItems.length > 0 && !publishing;
  const canCancel = canCancelCatalogImportJob(job);
  const active = isCatalogImportJobActive(job);
  const canDelete = !active && !saving && !publishing && !canceling;
  const progress = getCatalogImportJobProgress(job);

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-100">{job.title ?? formatImportPlatform(job.sourcePlatform)}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
            {job.createdAt ? <span>{formatDateTime(job.createdAt)}</span> : null}
            <span>{formatImportPlatform(job.sourcePlatform)}</span>
            <span>{formatImportSourceKind(job.sourceKind)}</span>
            <span>{formatImportTargetMode(job.targetMode)}</span>
            <span>{job.assignedAgentIds.length || job.assignedWhatsappInstanceIds.length ? "agente especifico" : "todos os agentes"}</span>
            {job.inputUrl ? <span className="max-w-[190px] truncate">{job.inputUrl}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" /> : null}
          <NeonBadge tone={catalogImportJobStatusTone(job)}>{formatCatalogImportJobStatus(job)}</NeonBadge>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <MiniStat label="importados" value={String(job.items.length)} />
        <MiniStat label="pendentes" value={String(pendingItems.length)} />
        <MiniStat label="externos" value={String(job.items.filter((item) => item.salesDestination === "external_site").length)} />
        <MiniStat label="duplicados" value={String(job.items.filter((item) => item.duplicateCandidates.length > 0).length)} />
        <MiniStat label="imagens" value={String(job.items.filter((item) => item.imageUrl).length)} />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            job.status === "failed" && !isCatalogImportJobCanceled(job) ? "bg-rose-500" : active ? "bg-cyan-500" : "bg-emerald-500",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {job.errorMessage ? (
        <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100">
          {job.errorMessage}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenMonitor}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100"
          style={{ borderColor: "var(--ch-border)" }}
        >
          <Eye className="h-3.5 w-3.5" />
          Acompanhar
        </button>
        {!canceled ? (
          <button
            type="button"
            disabled={saving || publishing}
            onClick={onSaveReview}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100 disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : hasChanges ? (
              <Save className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {hasChanges ? "Salvar alteracoes" : "Sem alteracoes"}
          </button>
        ) : null}
        {!canceled && canCancel ? (
          <button
            type="button"
            disabled={canceling || saving || publishing}
            onClick={onCancel}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-300/50 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50"
          >
            {canceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canDelete || deleting}
          onClick={onDelete}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-300/50 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Excluir
        </button>
        {!canceled ? (
          <button
            type="button"
            disabled={!canPublish}
            onClick={onPublish}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Publicar
          </button>
        ) : null}
      </div>

      {notice ? (
        <div
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-[11px]",
            notice.tone === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "",
            notice.tone === "warning" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "",
            notice.tone === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "",
          )}
        >
          {notice.message}
        </div>
      ) : null}

      {canceled ? (
        <div className="mt-3 rounded-lg border border-slate-300/20 bg-slate-900/20 px-3 py-2 text-[11px] text-slate-400">
          Importacao cancelada. {job.items.length} item(ns) encontrados foram ocultos da revisao e nao serao publicados.
        </div>
      ) : pendingItems.length > 0 ? (
        <div className="mt-3 grid gap-2">
          <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-900">
            Mostrando somente itens pendentes de revisao. Os produtos ja publicados aparecem apenas em Itens cadastrados.
          </div>
          {pendingItems.map((item) => (
            <CatalogImportItemEditor
              key={item.id}
              item={item}
              onChange={(patch) => onChangeItem(item.id, patch)}
            />
          ))}
        </div>
      ) : job.items.length > 0 ? (
        <div className="mt-3 rounded-lg border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-[11px] text-emerald-800">
          Produtos publicados. Eles agora aparecem somente em Itens cadastrados.
        </div>
      ) : null}
    </div>
  );
}

function CatalogImportItemEditor({
  item,
  onChange,
}: {
  item: ClientSalesCatalogImportItem;
  onChange: (patch: Omit<SalesCatalogImportItemPatch, "id">) => void;
}) {
  const canImportImage = Boolean(item.imageUrl) && item.salesDestination === "connectyhub_checkout";
  const selectedDuplicateTargetId = item.duplicateTargetItemId ?? item.duplicateCandidates[0]?.itemId ?? "";

  function changeDuplicateAction(action: SalesCatalogImportDuplicateAction) {
    onChange({
      duplicateAction: action,
      duplicateTargetItemId: action === "update_existing" || action === "skip"
        ? selectedDuplicateTargetId || item.duplicateCandidates[0]?.itemId || null
        : null,
    });
  }

  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <NeonBadge tone={importItemStatusTone(item.status)}>{formatImportItemStatus(item.status)}</NeonBadge>
          <NeonBadge tone={importDestinationTone(item.salesDestination)}>{formatImportDestination(item.salesDestination)}</NeonBadge>
          <span className="inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
            {Math.round(item.confidence * 100)}%
          </span>
        </div>
        {item.price ? <span className="font-mono text-[12px] font-semibold text-emerald-200">R$ {item.price}</span> : null}
      </div>

      {item.duplicateCandidates.length > 0 ? (
        <div className="mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-amber-800">possivel duplicidade</p>
              <p className="mt-1 text-[11px] text-slate-700">
                Encontramos produto parecido no catalogo. Por seguranca, a acao inicial e ignorar ate voce decidir.
              </p>
            </div>
            <NeonBadge tone="amber">{Math.round((item.duplicateCandidates[0]?.score ?? 0) * 100)}%</NeonBadge>
          </div>

          <select
            value={selectedDuplicateTargetId}
            onChange={(event) => onChange({
              duplicateTargetItemId: event.target.value,
              duplicateAction: item.duplicateAction === "create_new" ? "update_existing" : item.duplicateAction,
            })}
            className="mt-2 h-9 w-full rounded-lg border bg-transparent px-3 text-[11px] outline-none"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {item.duplicateCandidates.map((candidate) => (
              <option key={candidate.itemId} value={candidate.itemId}>
                {candidate.title}
                {candidate.price ? ` - R$ ${candidate.price}` : ""}
                {candidate.reasons.length ? ` (${candidate.reasons.join(", ")})` : ""}
              </option>
            ))}
          </select>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <DuplicateActionButton
              active={item.duplicateAction === "skip"}
              icon={Trash2}
              label="Ignorar"
              onClick={() => changeDuplicateAction("skip")}
            />
            <DuplicateActionButton
              active={item.duplicateAction === "update_existing"}
              icon={RefreshCw}
              label="Atualizar"
              onClick={() => changeDuplicateAction("update_existing")}
            />
            <DuplicateActionButton
              active={item.duplicateAction === "create_new"}
              icon={PackagePlus}
              label="Criar novo"
              onClick={() => changeDuplicateAction("create_new")}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_105px]">
        <input
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value.slice(0, 160) })}
          className="h-10 min-w-0 rounded-lg border bg-transparent px-3 text-[12px] font-semibold text-slate-100 outline-none"
          placeholder="Nome do item"
          style={{ borderColor: "var(--ch-border)" }}
        />
        <input
          value={item.price ?? ""}
          onChange={(event) => onChange({ price: event.target.value.slice(0, 60) })}
          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
          placeholder="Preco"
          style={{ borderColor: "var(--ch-border)" }}
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <select
          value={item.salesDestination}
          onChange={(event) => {
            const salesDestination = event.target.value as SalesCatalogImportDestination;
            onChange({
              salesDestination,
              ...(item.imageUrl ? { importExternalImage: salesDestination === "connectyhub_checkout" } : {}),
            });
          }}
          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
          style={{ borderColor: "var(--ch-border)" }}
        >
          <option value="connectyhub_checkout">Checkout</option>
          <option value="external_site">Site externo</option>
        </select>
        <select
          value={item.status}
          onChange={(event) => onChange({ status: event.target.value as ClientSalesCatalogImportItem["status"] })}
          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
          style={{ borderColor: "var(--ch-border)" }}
        >
          <option value="draft">Rascunho</option>
          <option value="ready">Pronto</option>
          <option value="discarded">Ignorar</option>
          <option value="published">Publicado</option>
        </select>
        <input
          value={item.category ?? ""}
          onChange={(event) => onChange({ category: event.target.value.slice(0, 80) })}
          className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
          placeholder="Categoria"
          style={{ borderColor: "var(--ch-border)" }}
        />
      </div>

      <input
        value={item.productUrl ?? ""}
        onChange={(event) => onChange({ productUrl: event.target.value.slice(0, 1000) })}
        className="mt-2 h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
        placeholder="URL do produto"
        style={{ borderColor: "var(--ch-border)" }}
      />

      {item.imageUrl ? (
        <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-[11px] font-semibold text-cyan-100">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Imagem detectada</span>
            </span>
            {item.imageImportStatus ? (
              <NeonBadge tone={imageImportStatusTone(item.imageImportStatus)}>{formatImageImportStatus(item.imageImportStatus)}</NeonBadge>
            ) : null}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
            <input
              value={item.imageUrl}
              onChange={(event) => {
                const imageUrl = event.target.value.slice(0, 1000);
                onChange({
                  imageUrl,
                  importExternalImage: item.salesDestination === "connectyhub_checkout" && Boolean(imageUrl.trim()),
                });
              }}
              className="h-10 min-w-0 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              placeholder="URL da imagem"
              style={{ borderColor: "var(--ch-border)" }}
            />
            <label
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-semibold text-slate-300",
                canImportImage ? "cursor-pointer hover:bg-cyan-400/10 hover:text-cyan-100" : "cursor-not-allowed opacity-55",
              )}
              style={{ borderColor: "var(--ch-border)" }}
            >
              <input
                type="checkbox"
                checked={canImportImage && item.importExternalImage}
                disabled={!canImportImage}
                onChange={(event) => onChange({ importExternalImage: event.target.checked })}
                className="h-4 w-4 accent-cyan-300"
              />
              Trazer imagens
            </label>
          </div>
          {item.imageImportError ? (
            <p className="mt-2 text-[11px] text-amber-200">{item.imageImportError}</p>
          ) : null}
        </div>
      ) : null}

      <textarea
        value={item.description ?? ""}
        onChange={(event) => onChange({ description: event.target.value.slice(0, 1400) })}
        className="mt-2 min-h-16 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
        placeholder="Descricao"
        style={{ borderColor: "var(--ch-border)" }}
      />

      {item.warnings.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.warnings.map((warning) => (
            <span key={warning} className="inline-flex max-w-full rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-100">
              <span className="truncate">{warning}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CheckoutStageOverview({ summary }: { summary: Record<SalesCatalogCheckoutStage, { count: number; amount: number }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
      <CheckoutMetric label="Pagos" value={String(summary.paid.count)} hint={formatCurrency(summary.paid.amount)} tone="green" />
      <CheckoutMetric label="Aguardando" value={String(summary.pending.count)} hint={formatCurrency(summary.pending.amount)} tone="cyan" />
      <CheckoutMetric label="Abandonados" value={String(summary.abandoned.count)} hint={formatCurrency(summary.abandoned.amount)} tone="amber" />
      <CheckoutMetric label="Falhas" value={String(summary.failed.count)} hint={formatCurrency(summary.failed.amount)} tone="rose" />
      <CheckoutMetric label="Cancelados" value={String(summary.cancelled.count)} hint={formatCurrency(summary.cancelled.amount)} tone="zinc" />
      <CheckoutMetric label="Reembolsos" value={String(summary.refunded.count)} hint={formatCurrency(summary.refunded.amount)} tone="violet" />
    </div>
  );
}

function CheckoutMetric({
  hint,
  label,
  tone,
  value,
}: {
  hint: string;
  label: string;
  tone: SalesCatalogTone;
  value: string;
}) {
  const toneStyle = salesCatalogToneStyles[tone];

  return (
    <div
      className="min-w-0 rounded-xl border px-3 py-2.5"
      style={{
        background: `linear-gradient(135deg, rgba(${toneStyle.rgb},0.12), rgba(255,255,255,0.018)), var(--ch-panel)`,
        borderColor: `rgba(${toneStyle.rgb},0.34)`,
      }}
    >
      <p className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={cn("mt-1 font-mono text-[18px] font-bold leading-none", toneStyle.text)}>{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-500">{hint}</p>
    </div>
  );
}

function CheckoutStageFilterBar({
  className,
  onChange,
  value,
}: {
  className?: string;
  onChange: (value: CheckoutStageFilter) => void;
  value: CheckoutStageFilter;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {checkoutStageFilterOptions.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition",
              active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
            )}
            style={{ borderColor: active ? undefined : "var(--ch-border)" }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckoutRecordCard({ record }: { record: SalesCatalogCheckoutRecord }) {
  const itemSummary = record.order.items.length > 0
    ? record.order.items.map((item) => `${item.quantity}x ${item.title}`).join(", ")
    : "Pedido sem item vinculado";
  const checkoutUrl = record.paymentSession?.checkoutUrl ?? null;

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-slate-100">{record.customerLabel}</p>
            <NeonBadge tone={checkoutStageTone(record.status.stage)}>{record.status.label}</NeonBadge>
          </div>
          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
            {record.customerPhone ? <span>{record.customerPhone}</span> : null}
            <span>Pedido {record.order.id.slice(0, 8)}</span>
            {record.latestAt ? <span>{formatDateTime(record.latestAt)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <NeonBadge tone={commercialFlowTone(record.order.commercialFlowType)}>{formatCommercialFlowLabel(record.order.commercialFlowType)}</NeonBadge>
          <NeonBadge tone={paymentStatusTone(record.order.paymentStatus)}>{formatSalesCatalogPaymentStatus(record.order.paymentStatus)}</NeonBadge>
          {record.paymentSession ? <NeonBadge tone={paymentSessionTone(record.paymentSession.status)}>{formatSalesCatalogPaymentSessionStatus(record.paymentSession.status)}</NeonBadge> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
          <p className="line-clamp-2 text-[12px] text-slate-300">{itemSummary}</p>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">{record.status.description}</p>
          {record.paymentSession?.failureReason ? (
            <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100">
              {record.paymentSession.failureReason}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Valor</p>
          <p className="mt-1 font-mono text-[18px] font-bold text-cyan-200">{formatCurrency(record.amount)}</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            {record.status.stage === "abandoned" ? `Parado ha mais de ${record.abandonedMinutes} min.` : record.paymentSession ? "Checkout rastreado" : "Sem sessao de checkout"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {checkoutUrl ? (
          <>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(checkoutUrl)}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
              style={{ borderColor: "var(--ch-border)" }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar checkout
            </button>
            <a
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100"
              href={checkoutUrl}
              rel="noreferrer"
              target="_blank"
              style={{ borderColor: "var(--ch-border)" }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir checkout
            </a>
          </>
        ) : null}
        {record.order.leadId ? (
          <Link
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10"
            href="/dashboard/atendimento"
            style={{ borderColor: "var(--ch-border)" }}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Ver lead
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  paymentSession,
  paymentLoading,
  updating,
  onCreatePayment,
  onUpdate,
}: {
  order: ClientSalesCatalogOrder;
  paymentSession: ClientSalesCatalogPaymentSession | null;
  paymentLoading: boolean;
  updating: boolean;
  onCreatePayment: () => void;
  onUpdate: (patch: Partial<Pick<ClientSalesCatalogOrder, "status" | "paymentStatus" | "fulfillmentStatus">>) => void;
}) {
  const customerLabel = order.customerName ?? order.customerPhone ?? "Lead sem nome";
  const itemSummary = order.items.length > 0
    ? order.items.map((item) => `${item.quantity}x ${item.title}`).join(", ")
    : "Pedido sem item vinculado";

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-100">{customerLabel}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
            {order.customerPhone ? <span>{order.customerPhone}</span> : null}
            {order.destinationCep ? <span>CEP {order.destinationCep}</span> : null}
            {order.updatedAt ? <span>{formatDateTime(order.updatedAt)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <NeonBadge tone={commercialFlowTone(order.commercialFlowType)}>{formatCommercialFlowLabel(order.commercialFlowType)}</NeonBadge>
          <NeonBadge tone={revenueOwnerTone(order.revenueOwnerType)}>{formatRevenueOwnerLabel(order.revenueOwnerType)}</NeonBadge>
          {order.commissionEligible ? <NeonBadge tone="amber">comissao</NeonBadge> : null}
          <NeonBadge tone={orderStatusTone(order.status)}>{formatSalesCatalogOrderStatus(order.status)}</NeonBadge>
          <NeonBadge tone={paymentStatusTone(order.paymentStatus)}>{formatSalesCatalogPaymentStatus(order.paymentStatus)}</NeonBadge>
          <NeonBadge tone={fulfillmentStatusTone(order.fulfillmentStatus)}>{formatSalesCatalogFulfillmentStatus(order.fulfillmentStatus)}</NeonBadge>
        </div>
      </div>

      <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
        <p className="line-clamp-2 text-[12px] text-slate-300">{itemSummary}</p>
        <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
          {order.total ? <span>Total {order.total}</span> : null}
          {order.shippingTotal ? <span>Frete {order.shippingTotal}</span> : null}
          {order.paymentMethod ? <span>{order.paymentMethod}</span> : null}
          {order.shippingMethod ? <span>{order.shippingMethod}</span> : null}
        </p>
        {order.items.some((item) => item.productOriginType !== "client" || item.commissionEligible) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {order.items.map((item) => (
              <span key={item.id} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                <BadgePercent className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {item.title}: {formatCommercialFlowLabel(item.commercialFlowType)}
                  {item.commissionEligible ? " com comissao" : ""}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-200">Pagamento Pix</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {paymentSession ? formatSalesCatalogPaymentSessionStatus(paymentSession.status) : "Nenhum checkout gerado"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {paymentSession?.checkoutUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(paymentSession.checkoutUrl!)}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar link
                </button>
                <a
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100"
                  href={paymentSession.checkoutUrl}
                  rel="noreferrer"
                  target="_blank"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir
                </a>
              </>
            ) : (
              <button
                type="button"
                disabled={paymentLoading || !order.total}
                onClick={onCreatePayment}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10 disabled:opacity-50"
                style={{ borderColor: "var(--ch-border)" }}
              >
                {paymentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                Gerar Pix
              </button>
            )}
          </div>
        </div>
      {paymentSession?.pixQrCode ? (
        <p className="mt-2 line-clamp-2 break-all font-mono text-[10px] text-slate-500">{paymentSession.pixQrCode}</p>
      ) : null}
      </div>

      <OrderOperationalChecklist order={order} paymentSession={paymentSession} />

      {order.items.some((item) => item.attributes.length > 0) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {order.items.flatMap((item) => item.attributes.map((attribute) => (
            <span key={`${item.id}-${attribute.id}`} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
              <SlidersHorizontal className="h-3 w-3 shrink-0" />
              <span className="truncate">{attribute.name}: {attribute.values.join(", ")}</span>
            </span>
          )))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <label className="block">
          <FieldLabel>Pedido</FieldLabel>
          <select
            value={order.status}
            disabled={updating}
            onChange={(event) => onUpdate({ status: event.target.value as SalesCatalogOrderStatus })}
            className="h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {orderStatusOptions.map((option) => (
              <option key={option} value={option}>{formatSalesCatalogOrderStatus(option)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <FieldLabel>Pagamento</FieldLabel>
          <div className="relative">
            <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select
              value={order.paymentStatus}
              disabled={updating}
              onChange={(event) => onUpdate({ paymentStatus: event.target.value as SalesCatalogPaymentStatus })}
              className="h-10 w-full rounded-lg border bg-transparent pl-9 pr-3 text-[12px] outline-none disabled:opacity-50"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {paymentStatusOptions.map((option) => (
                <option key={option} value={option}>{formatSalesCatalogPaymentStatus(option)}</option>
              ))}
            </select>
          </div>
        </label>
        <label className="block">
          <FieldLabel>Execucao</FieldLabel>
          <div className="relative">
            <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select
              value={order.fulfillmentStatus}
              disabled={updating}
              onChange={(event) => onUpdate({ fulfillmentStatus: event.target.value as SalesCatalogFulfillmentStatus })}
              className="h-10 w-full rounded-lg border bg-transparent pl-9 pr-3 text-[12px] outline-none disabled:opacity-50"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {fulfillmentStatusOptions.map((option) => (
                <option key={option} value={option}>{formatSalesCatalogFulfillmentStatus(option)}</option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {order.internalNotes || updating ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
          {updating ? <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-cyan-300" /> : <ClipboardList className="mt-0.5 h-3.5 w-3.5 text-slate-500" />}
          <span className="min-w-0">{updating ? "Atualizando pedido..." : order.internalNotes}</span>
        </div>
      ) : null}
    </div>
  );
}

function OrderOperationalChecklist({
  order,
  paymentSession,
}: {
  order: ClientSalesCatalogOrder;
  paymentSession: ClientSalesCatalogPaymentSession | null;
}) {
  const paymentStep = buildPaymentOperationStep(order, paymentSession);
  const inventoryStep = buildInventoryOperationStep(order);
  const whatsappStep = buildWhatsappOperationStep(order);
  const fulfillmentStep = buildFulfillmentOperationStep(order);
  const nextStep = buildOrderNextStep(order, paymentSession);

  return (
    <div className="mt-3 rounded-lg border px-3 py-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-200">Pos-venda operacional</p>
          <p className="mt-1 text-[11px] text-slate-500">{nextStep}</p>
        </div>
        {order.inventoryDeductedAt || order.inventoryRestoredAt || order.paymentWhatsappNotifiedAt ? (
          <NeonBadge tone="green">rastreado</NeonBadge>
        ) : (
          <NeonBadge tone="amber">em aberto</NeonBadge>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <OperationStep icon={CreditCard} {...paymentStep} />
        <OperationStep icon={PackagePlus} {...inventoryStep} />
        <OperationStep icon={MessageSquareText} {...whatsappStep} />
        <OperationStep icon={ShieldCheck} {...fulfillmentStep} />
      </div>
    </div>
  );
}

function OperationStep({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof PackagePlus;
  label: string;
  value: string;
  hint: string;
  tone: SalesCatalogTone;
}) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className="h-3.5 w-3.5 text-cyan-300" />
      </div>
      <p className="mt-2 text-[12px] font-semibold text-slate-100">{value}</p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{hint}</p>
      <div className="mt-2">
        <NeonBadge tone={tone}>{operationToneLabel(tone)}</NeonBadge>
      </div>
    </div>
  );
}

function PaymentSessionCard({ session }: { session: ClientSalesCatalogPaymentSession }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-100">Pedido {session.orderId.slice(0, 8)}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>R$ {session.amount}</span>
            {session.providerPaymentId ? <span>MP {session.providerPaymentId}</span> : null}
            {session.createdAt ? <span>{formatDateTime(session.createdAt)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <NeonBadge tone={commercialFlowTone(session.commercialFlowType)}>{formatCommercialFlowLabel(session.commercialFlowType)}</NeonBadge>
          <NeonBadge tone={revenueOwnerTone(session.paymentOwnerType)}>{formatRevenueOwnerLabel(session.paymentOwnerType)}</NeonBadge>
          {session.commissionEligible ? <NeonBadge tone="amber">comissao</NeonBadge> : null}
          <NeonBadge tone={paymentSessionTone(session.status)}>{formatSalesCatalogPaymentSessionStatus(session.status)}</NeonBadge>
        </div>
      </div>

      {session.checkoutUrl ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(session.checkoutUrl!)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
            style={{ borderColor: "var(--ch-border)" }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar checkout
          </button>
          <a
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100"
            href={session.checkoutUrl}
            rel="noreferrer"
            target="_blank"
            style={{ borderColor: "var(--ch-border)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir
          </a>
        </div>
      ) : null}

      {session.failureReason ? (
        <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100">
          {session.failureReason}
        </p>
      ) : null}
    </div>
  );
}

function CatalogItemCard({
  item,
  confirmDelete,
  deleting,
  visibilityLoading,
  onCopy,
  onDelete,
  onEdit,
  onWhatsappVisibility,
}: {
  item: ClientSalesCatalogItem;
  confirmDelete: boolean;
  deleting: boolean;
  visibilityLoading: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onWhatsappVisibility: (visible: boolean) => void;
}) {
  const cover = item.media.find((media) => media.kind === "image");
  const sourceLabel = item.source === "whatsapp_catalog" ? "WhatsApp" : "Interno";

  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[92px_minmax(0,1fr)]" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg border" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
        {cover ? (
          <Image alt={item.title} className="object-cover" fill sizes="92px" src={cover.storageUrl} />
        ) : (
          <Tags className="h-8 w-8 text-slate-600" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-slate-100">{item.title}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {item.category ? <span>{item.category}</span> : null}
              {item.offer.salePrice ? (
                <span>Oferta {item.offer.salePrice} {item.currency}</span>
              ) : item.price ? (
                <span>{item.price} {item.currency}</span>
              ) : null}
              <span>{formatStatus(item.status)}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {item.storeFeatured ? <NeonBadge tone="green">Destaque loja{item.storeFeaturedRank ? ` #${item.storeFeaturedRank}` : ""}</NeonBadge> : null}
            {item.highlightLabel ? <NeonBadge tone="amber">{item.highlightLabel}</NeonBadge> : null}
            <NeonBadge tone={salesDestinationTone(item.salesDestination)}>{formatSalesCatalogSalesDestination(item.salesDestination)}</NeonBadge>
            <NeonBadge tone={item.source === "whatsapp_catalog" ? "green" : "cyan"}>{sourceLabel}</NeonBadge>
            {item.assignedAgentIds.length > 0 || item.assignedWhatsappInstanceIds.length > 0 ? (
              <NeonBadge tone="violet">{item.assignedAgentIds.length || item.assignedWhatsappInstanceIds.length} agente(s)</NeonBadge>
            ) : null}
            <NeonBadge tone={inventoryTone(item.inventory.status)}>{formatSalesCatalogStockStatus(item.inventory.status)}</NeonBadge>
            <NeonBadge tone={item.readiness === "ready" ? "green" : "amber"}>{formatReadiness(item.readiness)}</NeonBadge>
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{item.description || "Sem descricao cadastrada."}</p>

        {hasOfferDetails(item) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.price && item.offer.salePrice ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                de {item.price}
              </span>
            ) : null}
            {item.offer.salePrice ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-cyan-200" style={{ borderColor: "var(--ch-border)" }}>
                <BadgePercent className="h-3 w-3" />
                {item.offer.salePrice}
              </span>
            ) : null}
            {item.offer.couponCode ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] text-slate-300" style={{ borderColor: "var(--ch-border)" }}>
                {item.offer.couponCode}
              </span>
            ) : null}
            {formatOfferWindow(item) ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                {formatOfferWindow(item)}
              </span>
            ) : null}
          </div>
        ) : null}

        {item.attributes.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.attributes.slice(0, 5).map((attribute) => (
              <span key={attribute.id} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                <SlidersHorizontal className="h-3 w-3 shrink-0" />
                <span className="truncate">{attribute.name}: {attribute.values.join(", ")}</span>
              </span>
            ))}
          </div>
        ) : null}

        {item.skus.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.skus.slice(0, 6).map((sku) => (
              <span key={sku.id ?? sku.skuCode} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] text-cyan-200" style={{ borderColor: "var(--ch-border)" }}>
                <Tags className="h-3 w-3 shrink-0" />
                <span className="truncate">{sku.skuCode}</span>
              </span>
            ))}
          </div>
        ) : null}

        {hasFulfillmentDetails(item) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
              <Truck className="h-3 w-3" />
              {formatSalesCatalogFulfillmentMode(item.fulfillment.mode)}
            </span>
            {item.fulfillment.schedulingRequired ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                agendamento
              </span>
            ) : null}
            {item.fulfillment.serviceDuration ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                {item.fulfillment.serviceDuration}
              </span>
            ) : null}
          </div>
        ) : null}

        {hasInventoryDetails(item) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.inventory.quantity !== null ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                <PackagePlus className="h-3 w-3" />
                {item.inventory.quantity} un.
              </span>
            ) : null}
            {item.inventory.lowStockThreshold !== null ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                alerta {item.inventory.lowStockThreshold}
              </span>
            ) : null}
            {item.inventory.allowBackorder ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                encomenda
              </span>
            ) : null}
            {item.inventory.notes ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                <span className="truncate">{item.inventory.notes}</span>
              </span>
            ) : null}
          </div>
        ) : null}

        {hasShippingDetails(item) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.shipping.weightGrams ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                <Truck className="h-3 w-3" />
                {formatSalesCatalogWeight(item.shipping.weightGrams)}
              </span>
            ) : null}
            {formatDimensions(item) ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                {formatDimensions(item)}
              </span>
            ) : null}
            {item.shipping.profile !== "default" ? (
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                {item.shipping.profile === "free" ? "frete gratis" : "frete a combinar"}
              </span>
            ) : null}
          </div>
        ) : null}

        {item.salesDestination === "external_site" && (item.productUrl || item.externalLinkButtonTag) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.externalLinkButtonTag ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] text-violet-200" style={{ borderColor: "var(--ch-border)" }}>
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.externalLinkButtonTag}</span>
              </span>
            ) : null}
            {item.productUrl ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                <span className="truncate">{item.productUrl}</span>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.media.slice(0, 6).map((media) => (
            <span key={media.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
              <MediaIcon media={media} />
              {media.fileName}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
            style={{ borderColor: "var(--ch-border)" }}
            title={item.salesDestination === "external_site" && item.externalLinkButtonTag ? item.externalLinkButtonTag : item.tag}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{item.salesDestination === "external_site" && item.externalLinkButtonTag ? item.externalLinkButtonTag : item.tag}</span>
          </button>
          {item.whatsappCatalogId ? (
            <button
              type="button"
              onClick={() => onWhatsappVisibility(item.whatsappCatalogHidden)}
              disabled={visibilityLoading}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10 disabled:opacity-50"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {visibilityLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : item.whatsappCatalogHidden ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {item.whatsappCatalogHidden ? "Mostrar no WhatsApp" : "Ocultar no WhatsApp"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100"
            style={{ borderColor: "var(--ch-border)" }}
          >
            <PencilLine className="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-50",
              confirmDelete ? "border-rose-400/35 bg-rose-400/10 text-rose-100" : "text-slate-400 hover:bg-rose-400/10 hover:text-rose-100",
            )}
            style={{ borderColor: confirmDelete ? undefined : "var(--ch-border)" }}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {confirmDelete ? "Confirmar" : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccordionSection({
  icon: Icon,
  title,
  children,
  className,
  defaultOpen = false,
  id,
  tone = "cyan",
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  id?: string;
  tone?: SalesCatalogTone;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneStyle = salesCatalogToneStyles[tone];

  return (
    <section
      id={id}
      className={cn("overflow-hidden rounded-xl border", className)}
      style={{
        borderColor: `rgba(${toneStyle.rgb},0.34)`,
        background: `linear-gradient(180deg, rgba(${toneStyle.rgb},0.070), rgba(255,255,255,0.020)), var(--ch-surface-2)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.050), 0 14px 34px rgba(${toneStyle.rgb},0.045)`,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.025]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
            style={{ borderColor: `rgba(${toneStyle.rgb},0.30)`, background: `rgba(${toneStyle.rgb},0.12)`, color: toneStyle.fill }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">{title}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition", open ? "rotate-180" : "", toneStyle.label)} />
      </button>
      {open ? (
        <div className="border-t p-3" style={{ borderColor: `rgba(${toneStyle.rgb},0.22)` }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function StatTile({ icon: Icon, label, value, tone = "cyan" }: { icon: typeof PackagePlus; label: string; value: string; tone?: SalesCatalogTone }) {
  const toneStyle = salesCatalogToneStyles[tone];

  return (
    <div
      className="min-w-0 rounded-xl border px-2 py-2 sm:px-3 sm:py-2.5"
      style={{
        background: `linear-gradient(90deg, rgba(${toneStyle.rgb},0.13), rgba(255,255,255,0.022)), var(--ch-panel)`,
        borderColor: `rgba(${toneStyle.rgb},0.35)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.055), 0 8px 20px rgba(${toneStyle.rgb},0.035)`,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <p className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500 sm:text-[9px] sm:tracking-[0.16em]">{label}</p>
        <span
          className="hidden h-6 w-6 shrink-0 place-items-center rounded-lg sm:grid"
          style={{ background: `rgba(${toneStyle.rgb},0.14)`, color: toneStyle.fill }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className={cn("mt-1 truncate font-mono text-[16px] font-bold leading-none sm:text-[18px]", toneStyle.text)}>{value}</p>
    </div>
  );
}

function CommerceTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: SalesCatalogTone;
}) {
  const toneStyle = salesCatalogToneStyles[tone];

  return (
    <div
      className="min-w-0 rounded-xl border px-2 py-2 sm:px-3 sm:py-2.5"
      style={{
        background: `linear-gradient(90deg, rgba(${toneStyle.rgb},0.11), rgba(255,255,255,0.020)), var(--ch-panel)`,
        borderColor: `rgba(${toneStyle.rgb},0.34)`,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <p className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.10em] text-slate-500 sm:text-[9px] sm:tracking-[0.16em]">{label}</p>
        <span
          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 font-mono text-[9px] font-bold"
          style={{ background: `rgba(${toneStyle.rgb},0.15)`, color: toneStyle.fill }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function CommercialFlowFilterBar({
  value,
  onChange,
  className,
}: {
  value: CommercialFlowFilter;
  onChange: (value: CommercialFlowFilter) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {commercialFlowFilterOptions.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition",
              active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
            )}
            style={{ borderColor: active ? undefined : "var(--ch-border)" }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CommerceRevenueOverview({ summary }: { summary: CommerceSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 xl:gap-3">
        <RevenueMetric label="Pedidos criados" value={formatCurrency(summary.orderAmount)} hint={`${summary.orderCount} pedido(s)`} tone="cyan" />
        <RevenueMetric label="Pagamentos aprovados" value={formatCurrency(summary.approvedAmount)} hint={`${summary.approvedPayments} checkout(s)`} tone="green" />
        <RevenueMetric label="Aguardando pagamento" value={formatCurrency(summary.pendingAmount)} hint={`${summary.pendingPayments} pendente(s)`} tone="amber" />
        <RevenueMetric label="Base com comissao" value={formatCurrency(summary.commissionApprovedAmount)} hint={`${summary.commissionOrders} pedido(s)`} tone="violet" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {summary.flows.map((flow) => (
          <CommerceFlowCard key={flow.flow} flow={flow} />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <RevenueSplitRow
          label="Valores aprovados do cliente"
          value={formatCurrency(summary.clientApprovedAmount)}
          hint="Venda propria cai na conta conectada do cliente"
          tone="green"
        />
        <RevenueSplitRow
          label="Valores aprovados ConnectyHub"
          value={formatCurrency(summary.connectyHubApprovedAmount)}
          hint="Revenda ou venda direta com recebimento ConnectyHub"
          tone="cyan"
        />
        <RevenueSplitRow
          label="Valores aprovados em split"
          value={formatCurrency(summary.splitApprovedAmount)}
          hint="Recebimento dividido entre as partes"
          tone="amber"
        />
        <RevenueSplitRow
          label="Valores aprovados parceiros"
          value={formatCurrency(summary.externalApprovedAmount)}
          hint="Produto ou provedor externo"
          tone="violet"
        />
      </div>
    </div>
  );
}

function RevenueMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: SalesCatalogTone;
}) {
  return (
    <div className="min-w-0 rounded-xl border px-2 py-2 sm:px-3 sm:py-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-3">
        <p className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-widest">{label}</p>
        <span className="hidden sm:inline-flex"><NeonBadge tone={tone}>{hint}</NeonBadge></span>
      </div>
      <p className="mt-1 truncate font-mono text-[13px] font-bold text-slate-100 sm:mt-3 sm:text-[20px]">{value}</p>
    </div>
  );
}

function CommerceFlowCard({ flow }: { flow: CommerceFlowSummary }) {
  return (
    <div className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <div className="flex items-center justify-between gap-2">
        <NeonBadge tone={commercialFlowTone(flow.flow)}>{formatCommercialFlowLabel(flow.flow)}</NeonBadge>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{flow.orders} pedido(s)</span>
      </div>
      <p className="mt-3 font-mono text-[18px] font-bold text-slate-100">{formatCurrency(flow.approvedAmount)}</p>
      <p className="mt-1 text-[11px] text-slate-500">{formatCommercialFlowDescription(flow.flow)}</p>
      <div className="mt-3 grid gap-1.5 text-[11px] text-slate-400">
        <SummaryLine label="Pedidos" value={formatCurrency(flow.orderAmount)} />
        <SummaryLine label="Pendentes" value={`${flow.pendingPayments} / ${formatCurrency(flow.pendingAmount)}`} />
        <SummaryLine label="Falhas" value={String(flow.failedPayments)} />
        <SummaryLine label="Recebedor" value={formatRevenueOwnerLabel(flow.paymentOwnerType)} />
        {flow.commissionApprovedAmount > 0 ? <SummaryLine label="Base comissao" value={formatCurrency(flow.commissionApprovedAmount)} /> : null}
      </div>
    </div>
  );
}

function RevenueSplitRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: SalesCatalogTone;
}) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-100">{label}</p>
          <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
        </div>
        <NeonBadge tone={tone}>{value}</NeonBadge>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-slate-300">{value}</span>
    </div>
  );
}

function getMercadoPagoConnectionErrorMessage(reason: string | null) {
  if (reason === "config") {
    return "Mercado Pago ainda precisa ser configurado no painel admin da ConnectyHub. Depois disso, conecte pela secao Integracoes.";
  }

  if (reason === "invalid_oauth_credentials") {
    return "As credenciais do aplicativo Mercado Pago da ConnectyHub nao foram aceitas. Confira se o Client ID e o App ID do aplicativo, nao o e-mail da conta, e tente novamente.";
  }

  if (reason === "missing_company") {
    return "Escolha uma empresa antes de conectar o Mercado Pago.";
  }

  if (reason === "invalid_state") {
    return "Nao conseguimos validar o retorno do Mercado Pago. Tente conectar novamente.";
  }

  if (reason === "token_exchange") {
    return "Mercado Pago retornou a autorizacao, mas nao conseguimos concluir a conexao. Tente novamente ou chame o suporte.";
  }

  return "Nao foi possivel abrir a conexao com Mercado Pago agora. Tente novamente ou chame o suporte.";
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[12px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function SalesProductFormTabs({
  activeTab,
  onChange,
  tabs,
}: {
  activeTab: SalesCatalogProductFormTab;
  onChange: (tab: SalesCatalogProductFormTab) => void;
  tabs: Array<{ id: SalesCatalogProductFormTab; label: string; icon: LucideIcon }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-xl border p-1.5 sm:grid-cols-5" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 font-mono text-[9px] font-bold uppercase tracking-wide transition",
              active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-transparent text-slate-500 hover:bg-white/[0.035] hover:text-slate-200",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  icon: Icon,
  label,
  mobileLabel,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof PackagePlus;
  label: string;
  mobileLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-[10px] font-semibold leading-none transition disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-10 sm:w-auto sm:gap-2 sm:px-3 sm:text-[12px]",
        active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
      )}
      style={{ borderColor: active ? undefined : "var(--ch-border)" }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
      <span className="min-w-0 truncate sm:hidden">{mobileLabel ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function DestinationButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition",
        active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
      )}
      style={{ borderColor: active ? undefined : "var(--ch-border)" }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function FieldLabel({ children, help }: { children: string; help?: string }) {
  const helpText = help ?? salesCatalogHelpText[children];

  return (
    <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
      {children}
      {helpText ? <HelpHint title={children}>{helpText}</HelpHint> : null}
    </span>
  );
}

function MediaIcon({ media }: { media: SalesCatalogMedia }) {
  if (media.kind === "image") return <ImageIcon className="h-3 w-3" />;
  if (media.kind === "video") return <Video className="h-3 w-3" />;
  return <FileText className="h-3 w-3" />;
}

function FileIcon({ contentType, fileName }: { contentType: string; fileName: string }) {
  const lowerType = contentType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(lowerName)) return <ImageIcon className="h-3 w-3" />;
  if (lowerType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lowerName)) return <Video className="h-3 w-3" />;
  return <FileText className="h-3 w-3" />;
}

function inferImportSourceKindFromFile(file: File): SalesCatalogImportSourceKind {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
  if (type.includes("spreadsheet") || /\.(xlsx?|ods)$/i.test(name)) return "excel";
  if (type.includes("csv") || name.endsWith(".csv") || name.endsWith(".tsv")) return "csv";
  return "text";
}

function resolveCatalogImportSourceKind(option: CatalogImportPlatformOption, files: File[]) {
  const inferred = files[0] ? inferImportSourceKindFromFile(files[0]) : option.sourceKind;

  if (option.value === "auto" || option.sourceKind === "mixed" || option.value === "generic_sheet") {
    return option.acceptedSourceKinds.includes(inferred) ? inferred : option.sourceKind;
  }

  return option.sourceKind;
}

function getInvalidCatalogImportFiles(files: File[], option: CatalogImportPlatformOption) {
  if (option.value === "auto") return [];

  return files.filter((file) => !option.acceptedSourceKinds.includes(inferImportSourceKindFromFile(file)));
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

async function buildCatalogImportPreviewItems(files: File[], platform: SalesCatalogImportPlatform): Promise<CatalogImportPreviewItem[]> {
  const previews: CatalogImportPreviewItem[] = [];

  for (const file of files) {
    const sourceKind = inferImportSourceKindFromFile(file);

    if (sourceKind === "csv" || sourceKind === "text") {
      const text = (await file.text().catch(() => "")).slice(0, 260000);
      previews.push(...extractCatalogImportPreviewItemsFromText(text, file.name, platform));
    } else {
      previews.push({
        id: `${file.name}-${file.size}`,
        title: file.name,
        detail: sourceKind === "image" ? "Imagem enviada para leitura do cardapio." : "Arquivo enviado para leitura da IA.",
        price: null,
        imageUrl: null,
        status: "scanning",
      });
    }
  }

  return previews.slice(0, 80);
}

function extractCatalogImportPreviewItemsFromText(text: string, fileName: string, platform: SalesCatalogImportPlatform) {
  const rows = parseDelimitedPreviewRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0]!.map(normalizeImportPreviewColumn);

  return rows.slice(1)
    .map((row, index): CatalogImportPreviewItem | null => {
      const title = readImportPreviewCell(row, headers, ["nome", "name", "title", "titulo", "produto", "product", "post_title"]);
      if (!title) return null;

      const price = readImportPreviewCell(row, headers, [
        "preco",
        "price",
        "regular_price",
        "sale_price",
        "preco_normal",
        "preco_regular",
        "valor",
        "variant_price",
      ]);
      const category = readImportPreviewCell(row, headers, ["categorias", "categories", "categoria", "category", "tipo"]);
      const description = readImportPreviewCell(row, headers, ["descricao_curta", "short_description", "descricao", "description"]);
      const imageUrl = readImportPreviewCell(row, headers, ["imagens", "images", "image", "image_src", "url_imagem", "foto"]);
      const detail = [category, description || formatImportPlatform(platform)]
        .filter(Boolean)
        .join(" / ")
        .slice(0, 180);

      return {
        id: `${fileName}-${index}-${title}`,
        title: title.slice(0, 140),
        detail,
        price: formatImportPreviewPrice(price),
        imageUrl: imageUrl ? imageUrl.split(",")[0]?.trim() ?? null : null,
        status: price ? "scanning" : "warning",
      };
    })
    .filter((item): item is CatalogImportPreviewItem => Boolean(item))
    .slice(0, 80);
}

function parseDelimitedPreviewRows(text: string) {
  const delimiter = detectPreviewDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      if (rows.length >= 82) break;
      continue;
    }

    cell += char ?? "";
  }

  if (cell.trim() || row.length > 0) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  return rows;
}

function detectPreviewDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];

  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
}

function readImportPreviewCell(row: string[], headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeImportPreviewColumn);

  for (const alias of normalizedAliases) {
    const index = headers.indexOf(alias);
    const value = index >= 0 ? row[index]?.trim() : "";
    if (value) return value;
  }

  return null;
}

function normalizeImportPreviewColumn(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatImportPreviewPrice(value: string | null) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (/^r\$/i.test(cleaned)) return cleaned;
  return `R$ ${cleaned}`;
}

function mapImportItemToPreviewItem(item: ClientSalesCatalogImportItem): CatalogImportPreviewItem {
  return {
    id: item.id,
    title: item.title,
    detail: [item.category, formatImportDestination(item.salesDestination), item.warnings[0]]
      .filter(Boolean)
      .join(" / "),
    price: item.price ? `R$ ${item.price}` : null,
    imageUrl: item.imageUrl,
    status: item.status === "error"
      ? "failed"
      : item.warnings.length > 0 || item.status === "draft"
        ? "warning"
        : item.status === "ready" || item.status === "published"
          ? "ready"
          : "scanning",
  };
}

function isCatalogImportJobActive(job: ClientSalesCatalogImportJob) {
  return job.status === "uploaded" || job.status === "extracting" || job.status === "publishing";
}

function isCatalogImportItemPublishedToCatalog(item: ClientSalesCatalogImportItem) {
  return item.status === "published" || Boolean(item.publishedCatalogItemId) || Boolean(item.publishedLinkButtonId);
}

function isCatalogImportItemPendingReview(item: ClientSalesCatalogImportItem) {
  return !isCatalogImportItemPublishedToCatalog(item) && item.status !== "discarded";
}

function isCatalogImportJobCanceled(job: ClientSalesCatalogImportJob) {
  return job.status === "failed"
    && (
      job.stats.cancelled === true
      || /cancelad/i.test(job.errorMessage ?? "")
    );
}

function canCancelCatalogImportJob(job: ClientSalesCatalogImportJob) {
  return (job.status === "uploaded" || job.status === "extracting" || job.status === "review_required" || job.status === "ready_to_publish")
    && !isCatalogImportJobCanceled(job);
}

function getCatalogImportJobProgress(job: ClientSalesCatalogImportJob) {
  if (job.status === "failed" || job.status === "published") return 100;
  if (job.status === "ready_to_publish" || job.status === "review_required") return 100;
  if (job.status === "publishing") return 88;
  if (job.status === "extracting") return Math.min(86, 42 + Math.max(1, job.items.length) * 4);
  return job.items.length > 0 ? 38 : 18;
}

function getCatalogImportMonitorProgress(monitor: CatalogImportMonitorState) {
  if (monitor.status === "failed") return 100;
  if (monitor.status === "preparing") return 12;
  if (monitor.status === "uploading") {
    if (monitor.previewItems.length === 0) return 26;
    return Math.min(72, 30 + Math.round((monitor.visiblePreviewCount / Math.max(1, monitor.previewItems.length)) * 42));
  }
  return 30;
}

function getCatalogImportMonitorMessage(job: ClientSalesCatalogImportJob) {
  if (isCatalogImportJobCanceled(job)) return "Importacao cancelada. Nenhum produto sera publicado.";
  if (job.status === "uploaded") return "Importacao recebida. A fila vai iniciar a leitura em instantes.";
  if (job.status === "extracting") return "A IA esta lendo o arquivo e separando produtos, precos, imagens e duplicidades.";
  if (job.status === "review_required") return "Produtos encontrados. Alguns itens precisam da sua revisao antes de publicar.";
  if (job.status === "ready_to_publish") return "Produtos encontrados e prontos para publicar no catalogo.";
  if (job.status === "publishing") return "Publicando produtos no catalogo da empresa.";
  if (job.status === "published") return "Produtos publicados. Eles ja podem aparecer para o agente e no atendimento manual.";
  return job.errorMessage ?? "A importacao falhou. Revise o arquivo ou tente novamente.";
}

function formatCatalogImportMonitorStatus(value: CatalogImportMonitorStatus) {
  if (value === "preparing") return "preparando";
  if (value === "uploading") return "enviando";
  return formatImportJobStatus(value);
}

function formatCatalogImportJobStatus(job: ClientSalesCatalogImportJob) {
  if (isCatalogImportJobCanceled(job)) return "cancelado";
  return formatImportJobStatus(job.status);
}

function catalogImportJobStatusTone(job: ClientSalesCatalogImportJob): SalesCatalogTone {
  if (isCatalogImportJobCanceled(job)) return "zinc";
  return importJobStatusTone(job.status);
}

function formatImportSourceKind(value: SalesCatalogImportSourceKind) {
  if (value === "csv") return "CSV";
  if (value === "excel") return "Excel";
  if (value === "site") return "Site";
  if (value === "pdf") return "PDF";
  if (value === "image") return "Imagem";
  if (value === "mixed") return "Misto";
  return "Texto";
}

function formatImportPlatform(value: SalesCatalogImportPlatform) {
  if (value === "woocommerce") return "WooCommerce";
  if (value === "shopify") return "Shopify";
  if (value === "wix") return "Wix Stores";
  if (value === "nuvemshop") return "Nuvemshop";
  if (value === "loja_integrada") return "Loja Integrada";
  if (value === "tray") return "Tray";
  if (value === "anota_ai") return "Anota Ai";
  if (value === "ifood") return "iFood / delivery";
  if (value === "generic_menu") return "PDF ou foto";
  if (value === "generic_sheet") return "Planilha";
  return "Auto";
}

function getCatalogImportPlatformOption(value: SalesCatalogImportPlatform) {
  return catalogImportPlatformOptions.find((option) => option.value === value) ?? defaultCatalogImportPlatformOption;
}

function getCatalogImportPlatformNotice(value: SalesCatalogImportPlatform, sourceKind: SalesCatalogImportSourceKind) {
  if (value === "anota_ai") {
    return {
      title: "Anota Ai entra como origem prioritaria",
      description: "Para clientes vindos do Anota Ai, envie exportacao, planilha, PDF ou foto do cardapio. A IA tenta separar categorias, sabores, tamanhos, adicionais e combos. Imagens so entram automaticamente quando o arquivo tiver URL publica acessivel; se vier foto/PDF, o lojista completa as fotos depois.",
    };
  }

  if (value === "ifood" || value === "generic_menu" || sourceKind === "pdf" || sourceKind === "image") {
    return {
      title: "Cardapio por PDF ou foto",
      description: "A IA pode extrair nome, descricao, preco, categorias e adicionais. Ela nao deve inventar fotos comerciais: depois da importacao, o cliente revisa e sobe imagens reais dos produtos quando necessario.",
    };
  }

  if (value === "woocommerce" || value === "shopify" || value === "wix" || value === "nuvemshop" || value === "loja_integrada" || value === "tray") {
    return {
      title: "Exportacao de loja virtual",
      description: "Se a planilha trouxer URLs de imagens, a ConnectyHub tenta trazer essas imagens para o armazenamento do usuario ao publicar produtos para checkout interno. URLs privadas, expiradas ou bloqueadas geram aviso para upload manual.",
    };
  }

  return {
    title: "Importacao assistida por IA",
    description: "Selecione a plataforma quando souber a origem. Isso ajuda a IA a interpretar campos, variacoes, adicionais e imagens com menos revisao manual.",
  };
}

function getImportDestinationNotice(targetMode: SalesCatalogImportTargetMode, defaultDestination: SalesCatalogImportDestination) {
  if (targetMode === "connectyhub_checkout") {
    return {
      title: "Venda fica dentro da ConnectyHub",
      description: "Os produtos sao cadastrados para o agente vender no WhatsApp e gerar checkout ConnectyHub. Links externos do arquivo viram apenas evidencia, nao levam o lead para fora.",
    };
  }

  if (targetMode === "external_site") {
    return {
      title: "Manter link externo",
      description: "Use quando o cliente ainda quer mandar o lead para a loja antiga. O produto entra como botao rastreavel, mas a venda final acontece fora da ConnectyHub.",
    };
  }

  if (defaultDestination === "external_site") {
    return {
      title: "Revisao com preferencia para links externos",
      description: "A IA vai deixar itens com URL prontos para sair pelo link externo, mas voce pode trocar cada item para checkout ConnectyHub antes de publicar.",
    };
  }

  return {
    title: "Revisar antes de publicar",
    description: "O sistema mostra todos os itens antes de liberar. Em cada produto voce decide se vende pelo checkout ConnectyHub ou se mantem o link externo da loja antiga.",
  };
}

function formatImportTargetMode(value: SalesCatalogImportTargetMode) {
  if (value === "connectyhub_checkout") return "Checkout ConnectyHub";
  if (value === "external_site") return "Site externo";
  return "Revisao";
}

function formatImportDestination(value: SalesCatalogImportDestination) {
  if (value === "external_site") return "site";
  if (value === "manual_handoff") return "revisar";
  return "checkout";
}

function formatImportJobStatus(value: ClientSalesCatalogImportJob["status"]) {
  if (value === "uploaded") return "recebido";
  if (value === "extracting") return "extraindo";
  if (value === "review_required") return "revisar";
  if (value === "ready_to_publish") return "pronto";
  if (value === "publishing") return "publicando";
  if (value === "published") return "publicado";
  return "falhou";
}

function formatImportItemStatus(value: ClientSalesCatalogImportItem["status"]) {
  if (value === "draft") return "rascunho";
  if (value === "ready") return "pronto";
  if (value === "published") return "publicado";
  if (value === "discarded") return "ignorado";
  return "erro";
}

function formatImageImportStatus(value: NonNullable<ClientSalesCatalogImportItem["imageImportStatus"]>) {
  if (value === "pending") return "pendente";
  if (value === "imported") return "imagem salva";
  if (value === "skipped") return "sem importacao";
  return "falhou";
}

function importJobStatusTone(value: ClientSalesCatalogImportJob["status"]): SalesCatalogTone {
  if (value === "published" || value === "ready_to_publish") return "green";
  if (value === "review_required") return "amber";
  if (value === "failed") return "rose";
  if (value === "publishing" || value === "extracting") return "cyan";
  return "zinc";
}

function importItemStatusTone(value: ClientSalesCatalogImportItem["status"]): SalesCatalogTone {
  if (value === "published" || value === "ready") return "green";
  if (value === "draft") return "amber";
  if (value === "error") return "rose";
  return "zinc";
}

function importDestinationTone(value: SalesCatalogImportDestination): SalesCatalogTone {
  if (value === "external_site") return "violet";
  if (value === "manual_handoff") return "amber";
  return "cyan";
}

function imageImportStatusTone(value: NonNullable<ClientSalesCatalogImportItem["imageImportStatus"]>): SalesCatalogTone {
  if (value === "imported") return "green";
  if (value === "failed") return "rose";
  if (value === "pending") return "cyan";
  return "zinc";
}

function salesDestinationTone(value: SalesCatalogSalesDestination): SalesCatalogTone {
  if (value === "external_site") return "violet";
  if (value === "manual_handoff") return "amber";
  return "cyan";
}

function formatStatus(status: SalesCatalogItemStatus) {
  if (status === "draft") return "rascunho";
  if (status === "archived") return "arquivado";
  return "ativo";
}

function formatReadiness(value: ClientSalesCatalogItem["readiness"]) {
  if (value === "ready") return "pronto";
  if (value === "needs_media") return "sem midia";
  return "sem descricao";
}

function inventoryTone(status: SalesCatalogStockStatus) {
  if (status === "out_of_stock") return "rose";
  if (status === "on_backorder") return "amber";
  return "green";
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function buildSettingsDraft(settings: ClientSalesCatalogSettings | null): SettingsDraft {
  const commerceDefaults = createDefaultSalesCatalogCommerceSettings();

  return {
    businessType: settings?.businessType ?? "simple",
    categoriesText: (settings?.categories ?? []).join("\n"),
    attributes: cloneAttributes(settings?.attributes ?? []),
    storefront: {
      heroTitle: settings?.storefront.heroTitle ?? "",
      heroHighlight: settings?.storefront.heroHighlight ?? "",
      heroSubtitle: settings?.storefront.heroSubtitle ?? "",
    },
    trackInventory: settings?.trackInventory ?? false,
    variationMedia: settings?.variationMedia ?? false,
    paymentMethods: clonePaymentMethods(settings?.paymentMethods.length ? settings.paymentMethods : commerceDefaults.paymentMethods),
    orderPolicy: { ...(settings?.orderPolicy ?? commerceDefaults.orderPolicy) },
    leadDataPolicy: {
      ...(settings?.leadDataPolicy ?? commerceDefaults.leadDataPolicy),
      requiredFields: [...(settings?.leadDataPolicy.requiredFields ?? commerceDefaults.leadDataPolicy.requiredFields)],
    },
    messageTemplates: { ...(settings?.messageTemplates ?? commerceDefaults.messageTemplates) },
    automationSettings: { ...(settings?.automationSettings ?? commerceDefaults.automationSettings) },
    orderBumps: {
      enabled: settings?.orderBumps?.enabled ?? false,
      items: (settings?.orderBumps?.items ?? []).map((item) => ({ ...item })),
    },
  };
}

function buildShippingDraft(settings: ClientSalesCatalogShippingSettings | null): ShippingDraft {
  const rulesByUf = new Map(defaultSalesCatalogShippingRules.map((rule) => [rule.uf, cloneShippingRule(rule)]));

  for (const rule of settings?.rules ?? []) {
    if (!rulesByUf.has(rule.uf)) continue;

    rulesByUf.set(rule.uf, {
      ...rulesByUf.get(rule.uf)!,
      ...rule,
      services: cloneShippingServices(rule.services.length > 0 ? rule.services : rulesByUf.get(rule.uf)!.services),
    });
  }

  return {
    localPickup: settings?.localPickup ?? false,
    originCep: settings?.originCep ?? "",
    defaultHandlingDays: settings?.defaultHandlingDays !== null && settings?.defaultHandlingDays !== undefined
      ? String(settings.defaultHandlingDays)
      : "",
    rules: brazilianStates.map((state) => rulesByUf.get(state.uf) ?? cloneShippingRule({
      ...state,
      active: false,
      cepStart: null,
      cepEnd: null,
      price: null,
      minDays: null,
      maxDays: null,
      freeShippingThreshold: null,
      services: [],
      notes: null,
    })),
  };
}

function getCategoryRows(value: string) {
  const rows = value.split("\n").map((row) => row.replace(/\s+/g, " ").trim());
  return rows.length > 0 ? rows : [""];
}

function cloneAttributes(attributes: SalesCatalogAttribute[]) {
  return attributes.map((attribute) => ({
    ...attribute,
    values: [...attribute.values],
  }));
}

function clonePaymentMethods(methods: SalesCatalogPaymentMethod[]) {
  return methods.map((method) => ({ ...method }));
}

function buildEmptySkuDraft(input: {
  index: number;
  title: string;
  price: string;
  salePrice: string;
  inventoryStatus: SalesCatalogSku["stockStatus"];
  stockQuantity: string;
  lowStockThreshold: string;
  weightGrams: string;
  selectedAttributes: SalesCatalogItemAttribute[];
}): SkuDraft {
  const suffix = String(input.index).padStart(2, "0");

  return {
    id: null,
    skuCode: skuCodeInput(`${input.title || "SKU"}-${suffix}`),
    title: input.title,
    attributesText: formatSkuAttributesText(input.selectedAttributes),
    price: input.price,
    salePrice: input.salePrice,
    stockStatus: input.inventoryStatus,
    stockQuantity: input.stockQuantity,
    lowStockThreshold: input.lowStockThreshold,
    weightGrams: input.weightGrams,
    status: "active",
  };
}

function buildSkuDraftFromSku(sku: SalesCatalogSku): SkuDraft {
  return {
    id: sku.id,
    skuCode: sku.skuCode,
    title: sku.title ?? "",
    attributesText: formatSkuAttributesText(sku.attributes),
    price: sku.price ?? "",
    salePrice: sku.salePrice ?? "",
    stockStatus: sku.stockStatus,
    stockQuantity: sku.stockQuantity !== null ? String(sku.stockQuantity) : "",
    lowStockThreshold: sku.lowStockThreshold !== null ? String(sku.lowStockThreshold) : "",
    weightGrams: sku.weightGrams !== null ? String(sku.weightGrams) : "",
    status: sku.status,
  };
}

function serializeSkuDrafts(
  drafts: SkuDraft[],
  fallback: {
    title: string;
    price: string;
    salePrice: string;
    inventoryStatus: SalesCatalogSku["stockStatus"];
    stockQuantity: string;
    lowStockThreshold: string;
    weightGrams: string;
    lengthCm: string;
    widthCm: string;
    heightCm: string;
  },
) {
  return drafts
    .map((sku) => ({
      id: sku.id,
      skuCode: skuCodeInput(sku.skuCode),
      title: cleanInput(sku.title, 120),
      attributes: parseSkuAttributesText(sku.attributesText),
      price: cleanInput(sku.price, 60) ?? cleanInput(fallback.price, 60),
      salePrice: cleanInput(sku.salePrice, 60) ?? cleanInput(fallback.salePrice, 60),
      currency: "BRL",
      stockStatus: sku.stockStatus || fallback.inventoryStatus,
      stockQuantity: parseOptionalNumber(sku.stockQuantity) ?? parseOptionalNumber(fallback.stockQuantity),
      lowStockThreshold: parseOptionalNumber(sku.lowStockThreshold) ?? parseOptionalNumber(fallback.lowStockThreshold),
      weightGrams: parseOptionalNumber(sku.weightGrams) ?? parseOptionalNumber(fallback.weightGrams),
      dimensions: {
        lengthCm: parseOptionalNumber(fallback.lengthCm),
        widthCm: parseOptionalNumber(fallback.widthCm),
        heightCm: parseOptionalNumber(fallback.heightCm),
      },
      mediaIds: [],
      status: sku.status,
    }))
    .filter((sku) => sku.skuCode);
}

function parseSkuAttributesText(value: string): SalesCatalogItemAttribute[] {
  return value
    .split(/[;\n]/g)
    .map((part): SalesCatalogItemAttribute | null => {
      const [name, ...rest] = part.split(":");
      const label = name?.trim();
      const values = sanitizeList(rest.join(":").split(/[|,/]/g));

      if (!label || values.length === 0) return null;

      return {
        id: createAttributeId(label),
        name: label.slice(0, 50),
        values,
      };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item));
}

function formatSkuAttributesText(attributes: SalesCatalogItemAttribute[]) {
  return attributes
    .filter((attribute) => attribute.values.length > 0)
    .map((attribute) => `${attribute.name}: ${attribute.values.join("/")}`)
    .join("; ");
}

function cloneShippingRule(rule: SalesCatalogShippingRule): SalesCatalogShippingRule {
  return {
    ...rule,
    services: cloneShippingServices(rule.services),
  };
}

function cloneShippingServices(services: SalesCatalogShippingService[]) {
  return services.map((service) => ({
    ...service,
    tiers: service.tiers.map((tier) => ({ ...tier })),
  }));
}

function parseLines(value: string) {
  return sanitizeList(value.split(/[\n,;]/g));
}

function sanitizeList(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function skuCodeInput(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cepInput(value: string) {
  const digits = digitsOnly(value, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function cleanCep(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length === 8 ? digits : null;
}

function decimalInput(value: string, maxLength: number) {
  const normalized = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const [integer = "", decimal = ""] = normalized.split(".");
  const limitedInteger = integer.slice(0, maxLength);

  if (normalized.includes(".")) {
    return `${limitedInteger}.${decimal.slice(0, 2)}`;
  }

  return limitedInteger;
}

function parseOptionalNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function cleanInput(value: string | null, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim().slice(0, maxLength) ?? "";
  return normalized || null;
}

function formatQuoteDeadline(minDays: number | null, maxDays: number | null) {
  if (minDays !== null && maxDays !== null) return `${minDays} a ${maxDays} dia(s)`;
  if (minDays !== null) return `A partir de ${minDays} dia(s)`;
  if (maxDays !== null) return `Ate ${maxDays} dia(s)`;
  return "Prazo a combinar";
}

function createAttributeId(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "atributo";
}

function buildSelectedItemAttributes(
  attributes: SalesCatalogAttribute[],
  selected: Record<string, string[]>,
): SalesCatalogItemAttribute[] {
  return attributes
    .map((attribute): SalesCatalogItemAttribute | null => {
      const values = sanitizeList(selected[attribute.id] ?? []);
      if (values.length === 0) return null;

      return {
        id: attribute.id,
        name: attribute.name,
        values,
      };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item));
}

function hasShippingDetails(item: ClientSalesCatalogItem) {
  const dimensions = item.shipping.dimensions;

  return Boolean(
    item.shipping.weightGrams
      || dimensions.lengthCm
      || dimensions.widthCm
      || dimensions.heightCm
      || item.shipping.profile !== "default"
      || item.shipping.notes,
  );
}

function hasInventoryDetails(item: ClientSalesCatalogItem) {
  return Boolean(
    item.inventory.quantity !== null
      || item.inventory.lowStockThreshold !== null
      || item.inventory.allowBackorder
      || item.inventory.notes,
  );
}

function hasOfferDetails(item: ClientSalesCatalogItem) {
  return Boolean(
    item.offer.salePrice
      || item.offer.saleStartsAt
      || item.offer.saleEndsAt
      || item.offer.couponCode
      || item.offer.couponDescription
      || item.offer.callToAction
      || item.offer.notes,
  );
}

function hasFulfillmentDetails(item: ClientSalesCatalogItem) {
  return Boolean(
    item.fulfillment.mode !== "physical"
      || item.fulfillment.schedulingRequired
      || item.fulfillment.serviceDuration
      || item.fulfillment.deliveryInstructions
      || item.fulfillment.accessInstructions,
  );
}

function formatOfferWindow(item: ClientSalesCatalogItem) {
  if (item.offer.saleStartsAt && item.offer.saleEndsAt) return `${item.offer.saleStartsAt} ate ${item.offer.saleEndsAt}`;
  if (item.offer.saleStartsAt) return `desde ${item.offer.saleStartsAt}`;
  if (item.offer.saleEndsAt) return `ate ${item.offer.saleEndsAt}`;
  return null;
}

function buildPaymentOperationStep(order: ClientSalesCatalogOrder, paymentSession: ClientSalesCatalogPaymentSession | null) {
  const status = paymentSession?.status;

  if (order.paymentStatus === "confirmed" || order.status === "paid" || status === "approved") {
    return {
      label: "Pagamento",
      value: "Confirmado",
      hint: paymentSession?.paidAt ? `Pago em ${formatDateTime(paymentSession.paidAt)}` : order.paymentMethod ?? "Pagamento confirmado",
      tone: "green" as SalesCatalogTone,
    };
  }

  if (order.paymentStatus === "failed" || status === "rejected" || status === "cancelled" || status === "expired" || status === "error") {
    return {
      label: "Pagamento",
      value: "Falhou",
      hint: paymentSession?.failureReason ?? "Gerar novo checkout ou ajustar com o lead",
      tone: "rose" as SalesCatalogTone,
    };
  }

  if (order.paymentStatus === "refunded" || status === "refunded") {
    return {
      label: "Pagamento",
      value: "Reembolsado",
      hint: "Verificar devolucao de estoque e atendimento",
      tone: "violet" as SalesCatalogTone,
    };
  }

  return {
    label: "Pagamento",
    value: paymentSession ? "Aguardando" : "Sem checkout",
    hint: paymentSession ? formatSalesCatalogPaymentSessionStatus(paymentSession.status) : "Gere Pix ou combine pagamento",
    tone: paymentSession ? "cyan" as SalesCatalogTone : "amber" as SalesCatalogTone,
  };
}

function buildInventoryOperationStep(order: ClientSalesCatalogOrder) {
  if (order.inventoryRestoredAt) {
    return {
      label: "Estoque",
      value: "Devolvido",
      hint: `${order.inventoryRestoredItems || 1} item(ns) em ${formatDateTime(order.inventoryRestoredAt)}`,
      tone: "violet" as SalesCatalogTone,
    };
  }

  if (order.inventoryDeductedAt) {
    return {
      label: "Estoque",
      value: "Baixado",
      hint: `${order.inventoryDeductedItems || 1} item(ns) em ${formatDateTime(order.inventoryDeductedAt)}`,
      tone: "green" as SalesCatalogTone,
    };
  }

  if (order.paymentStatus === "confirmed" || order.status === "paid") {
    return {
      label: "Estoque",
      value: "Verificar",
      hint: "Produto sem quantidade rastreada ou baixa pendente",
      tone: "amber" as SalesCatalogTone,
    };
  }

  return {
    label: "Estoque",
    value: "Aguardando",
    hint: "Baixa automatica apos pagamento confirmado",
    tone: "zinc" as SalesCatalogTone,
  };
}

function buildWhatsappOperationStep(order: ClientSalesCatalogOrder) {
  if (order.paymentWhatsappNotifiedAt) {
    return {
      label: "WhatsApp",
      value: "Cliente avisado",
      hint: `Confirmacao enviada em ${formatDateTime(order.paymentWhatsappNotifiedAt)}`,
      tone: "green" as SalesCatalogTone,
    };
  }

  if (order.paymentStatus === "confirmed" || order.status === "paid") {
    return {
      label: "WhatsApp",
      value: "Acompanhar",
      hint: order.conversationId ? "Confirmacao automatica pendente" : "Pedido sem conversa vinculada",
      tone: "amber" as SalesCatalogTone,
    };
  }

  return {
    label: "WhatsApp",
    value: "Aguardando",
    hint: "O lead volta pelo checkout ou conversa original",
    tone: "zinc" as SalesCatalogTone,
  };
}

function buildFulfillmentOperationStep(order: ClientSalesCatalogOrder) {
  if (order.fulfillmentStatus === "fulfilled") {
    return {
      label: "Execucao",
      value: "Concluida",
      hint: "Pedido finalizado",
      tone: "green" as SalesCatalogTone,
    };
  }

  if (order.fulfillmentStatus === "scheduled" || order.fulfillmentStatus === "in_progress") {
    return {
      label: "Execucao",
      value: formatSalesCatalogFulfillmentStatus(order.fulfillmentStatus),
      hint: "Separacao, entrega ou atendimento em andamento",
      tone: "cyan" as SalesCatalogTone,
    };
  }

  if (order.fulfillmentStatus === "cancelled" || order.status === "cancelled") {
    return {
      label: "Execucao",
      value: "Cancelada",
      hint: "Verificar estoque, pagamento e repasse",
      tone: "rose" as SalesCatalogTone,
    };
  }

  return {
    label: "Execucao",
    value: order.paymentStatus === "confirmed" || order.status === "paid" ? "Separar" : "Pendente",
    hint: order.paymentStatus === "confirmed" || order.status === "paid" ? "Iniciar preparo do pedido" : "Aguardar pagamento",
    tone: order.paymentStatus === "confirmed" || order.status === "paid" ? "amber" as SalesCatalogTone : "zinc" as SalesCatalogTone,
  };
}

function buildOrderNextStep(order: ClientSalesCatalogOrder, paymentSession: ClientSalesCatalogPaymentSession | null) {
  if (order.status === "cancelled") return "Pedido cancelado. Confira se estoque, pagamento e repasse foram ajustados.";
  if (order.paymentStatus === "failed" || paymentSession?.status === "rejected" || paymentSession?.status === "error") return "Pagamento falhou. Gere novo checkout ou continue o atendimento no WhatsApp.";
  if (order.paymentStatus === "refunded" || paymentSession?.status === "refunded") return "Pagamento reembolsado. Confira devolucao de estoque e comissao.";
  if (order.paymentStatus !== "confirmed" && order.status !== "paid") return paymentSession ? "Aguardando confirmacao do pagamento." : "Gere um checkout ou registre pagamento combinado.";
  if (!order.inventoryDeductedAt && !order.inventoryRestoredAt) return "Pagamento confirmado. Verifique estoque ou produto sem quantidade rastreada.";
  if (!order.paymentWhatsappNotifiedAt) return "Pagamento confirmado. Continue o acompanhamento com o lead no WhatsApp.";
  if (order.fulfillmentStatus === "pending") return "Pedido pronto para separacao, entrega ou execucao.";
  if (order.fulfillmentStatus === "fulfilled") return "Pedido finalizado.";
  return "Pedido em andamento.";
}

function operationToneLabel(tone: SalesCatalogTone) {
  if (tone === "green") return "ok";
  if (tone === "cyan") return "andamento";
  if (tone === "amber") return "acao";
  if (tone === "rose") return "atencao";
  if (tone === "violet") return "ajustado";
  return "pendente";
}

function buildSalesCatalogCheckoutRecords(
  orders: ClientSalesCatalogOrder[],
  paymentSessions: ClientSalesCatalogPaymentSession[],
  abandonedMinutes: number,
): SalesCatalogCheckoutRecord[] {
  const sessionsByOrder = new Map<string, ClientSalesCatalogPaymentSession[]>();

  for (const session of paymentSessions) {
    const current = sessionsByOrder.get(session.orderId) ?? [];
    current.push(session);
    sessionsByOrder.set(session.orderId, current);
  }

  return orders
    .map((order) => {
      const sessions = (sessionsByOrder.get(order.id) ?? [])
        .sort((a, b) => toComparableTimestamp(b.updatedAt ?? b.createdAt) - toComparableTimestamp(a.updatedAt ?? a.createdAt));
      const paymentSession = order.latestPaymentSessionId
        ? sessions.find((session) => session.id === order.latestPaymentSessionId) ?? sessions[0] ?? null
        : sessions[0] ?? null;
      const status = resolveSalesCatalogCheckoutStatus({
        order,
        paymentSession,
        abandonedAfterMinutes: abandonedMinutes,
      });
      const latestAt = pickLatestDate([
        paymentSession?.paidAt,
        paymentSession?.updatedAt,
        paymentSession?.createdAt,
        order.updatedAt,
        order.createdAt,
      ]);
      const amount = parseCurrency(order.total) || parseCurrency(paymentSession?.amount);

      return {
        abandonedMinutes,
        amount,
        customerLabel: order.customerName ?? order.customerPhone ?? "Lead sem nome",
        customerPhone: order.customerPhone,
        latestAt,
        order,
        paymentSession,
        status,
      };
    })
    .sort((a, b) => toComparableTimestamp(b.latestAt) - toComparableTimestamp(a.latestAt));
}

function buildCheckoutStageSummary(records: SalesCatalogCheckoutRecord[]) {
  const summary: Record<SalesCatalogCheckoutStage, { count: number; amount: number }> = {
    abandoned: { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    refunded: { count: 0, amount: 0 },
  };

  for (const record of records) {
    summary[record.status.stage].count += 1;
    summary[record.status.stage].amount += record.amount;
  }

  return summary;
}

function buildCommerceSummary(
  orders: ClientSalesCatalogOrder[],
  paymentSessions: ClientSalesCatalogPaymentSession[],
): CommerceSummary {
  const flows = createEmptyCommerceFlowSummaries();
  const flowMap = new Map(flows.map((flow) => [flow.flow, flow]));
  const summary: CommerceSummary = {
    orderCount: orders.length,
    orderAmount: 0,
    approvedPayments: 0,
    approvedAmount: 0,
    pendingPayments: 0,
    pendingAmount: 0,
    failedPayments: 0,
    clientApprovedAmount: 0,
    connectyHubApprovedAmount: 0,
    splitApprovedAmount: 0,
    externalApprovedAmount: 0,
    commissionOrders: 0,
    commissionApprovedAmount: 0,
    flows,
  };

  for (const order of orders) {
    const orderAmount = parseCurrency(order.total);
    const flow = flowMap.get(order.commercialFlowType);

    summary.orderAmount += orderAmount;

    if (order.commissionEligible) {
      summary.commissionOrders += 1;
    }

    if (flow) {
      flow.orders += 1;
      flow.orderAmount += orderAmount;

      if (order.commissionEligible) {
        flow.commissionOrders += 1;
      }

      flow.paymentOwnerType = resolveDominantRevenueOwner(flow.paymentOwnerType, order.revenueOwnerType);
    }
  }

  for (const session of paymentSessions) {
    const amount = parseCurrency(session.amount);
    const flow = flowMap.get(session.commercialFlowType);

    if (isApprovedPaymentSession(session.status)) {
      summary.approvedPayments += 1;
      summary.approvedAmount += amount;

      if (session.paymentOwnerType === "client") {
        summary.clientApprovedAmount += amount;
      } else if (session.paymentOwnerType === "connectyhub") {
        summary.connectyHubApprovedAmount += amount;
      } else if (session.paymentOwnerType === "split") {
        summary.splitApprovedAmount += amount;
      } else {
        summary.externalApprovedAmount += amount;
      }

      if (session.commissionEligible) {
        summary.commissionApprovedAmount += amount;
      }

      if (flow) {
        flow.approvedPayments += 1;
        flow.approvedAmount += amount;

        if (session.commissionEligible) {
          flow.commissionApprovedAmount += amount;
        }
      }
    }

    if (isPendingPaymentSession(session.status)) {
      summary.pendingPayments += 1;
      summary.pendingAmount += amount;

      if (flow) {
        flow.pendingPayments += 1;
        flow.pendingAmount += amount;
      }
    }

    if (isFailedPaymentSession(session.status)) {
      summary.failedPayments += 1;

      if (flow) {
        flow.failedPayments += 1;
      }
    }

    if (flow) {
      flow.paymentOwnerType = resolveDominantRevenueOwner(flow.paymentOwnerType, session.paymentOwnerType);
    }
  }

  return summary;
}

function createEmptyCommerceFlowSummaries(): CommerceFlowSummary[] {
  return (["client_direct", "connectyhub_resale", "connectyhub_direct", "external_marketplace"] as SalesCatalogCommercialFlowType[]).map((flow) => ({
    flow,
    orders: 0,
    orderAmount: 0,
    approvedPayments: 0,
    approvedAmount: 0,
    pendingPayments: 0,
    pendingAmount: 0,
    failedPayments: 0,
    commissionOrders: 0,
    commissionApprovedAmount: 0,
    paymentOwnerType: getDefaultPaymentOwner(flow),
  }));
}

function getDefaultPaymentOwner(flow: SalesCatalogCommercialFlowType): SalesCatalogRevenueOwnerType {
  if (flow === "client_direct") return "client";
  if (flow === "external_marketplace") return "external_provider";
  return "connectyhub";
}

function resolveDominantRevenueOwner(
  current: SalesCatalogRevenueOwnerType,
  next: SalesCatalogRevenueOwnerType,
): SalesCatalogRevenueOwnerType {
  if (current === next) return current;
  if (current === "split" || next === "split") return "split";
  if (current === "connectyhub" || next === "connectyhub") return "connectyhub";
  if (current === "external_provider" || next === "external_provider") return "external_provider";
  return next;
}

function parseCurrency(value: string | null | undefined) {
  if (!value) return 0;

  const stripped = value.replace(/[^\d,.-]/g, "").trim();
  if (!stripped) return 0;

  const hasComma = stripped.includes(",");
  const hasDot = stripped.includes(".");
  const lastComma = stripped.lastIndexOf(",");
  const lastDot = stripped.lastIndexOf(".");
  let normalized = stripped;

  if (hasComma && hasDot) {
    normalized = lastComma > lastDot
      ? stripped.replace(/\./g, "").replace(",", ".")
      : stripped.replace(/,/g, "");
  } else if (hasComma) {
    normalized = stripped.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatestDate(values: Array<string | null | undefined>) {
  const latest = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => toComparableTimestamp(b) - toComparableTimestamp(a))[0];

  return latest ?? null;
}

function toComparableTimestamp(value: string | null | undefined) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function isApprovedPaymentSession(status: ClientSalesCatalogPaymentSession["status"]) {
  return status === "approved";
}

function isPendingPaymentSession(status: ClientSalesCatalogPaymentSession["status"]) {
  return status === "created" || status === "pending";
}

function isFailedPaymentSession(status: ClientSalesCatalogPaymentSession["status"]) {
  return status === "rejected" || status === "cancelled" || status === "expired" || status === "error";
}

function formatCommercialFlowLabel(flow: SalesCatalogCommercialFlowType) {
  if (flow === "connectyhub_resale") return "Revenda CH";
  if (flow === "connectyhub_direct") return "Venda direta CH";
  if (flow === "external_marketplace") return "Marketplace externo";
  return "Venda propria";
}

function formatCommercialFlowDescription(flow: SalesCatalogCommercialFlowType) {
  if (flow === "connectyhub_resale") return "Produto ConnectyHub vendido pelo cliente";
  if (flow === "connectyhub_direct") return "Produto ConnectyHub vendido sem afiliado";
  if (flow === "external_marketplace") return "Produto de parceiro externo";
  return "Produto proprio do cliente";
}

function commercialFlowTone(flow: SalesCatalogCommercialFlowType): SalesCatalogTone {
  if (flow === "connectyhub_resale") return "cyan";
  if (flow === "connectyhub_direct") return "violet";
  if (flow === "external_marketplace") return "amber";
  return "green";
}

function formatRevenueOwnerLabel(owner: SalesCatalogRevenueOwnerType) {
  if (owner === "connectyhub") return "Recebe CH";
  if (owner === "split") return "Repasse dividido";
  if (owner === "external_provider") return "Recebe parceiro";
  return "Recebe cliente";
}

function revenueOwnerTone(owner: SalesCatalogRevenueOwnerType): SalesCatalogTone {
  if (owner === "connectyhub") return "cyan";
  if (owner === "split") return "amber";
  if (owner === "external_provider") return "violet";
  return "green";
}

function checkoutStageTone(stage: SalesCatalogCheckoutStage): SalesCatalogTone {
  if (stage === "paid") return "green";
  if (stage === "pending") return "cyan";
  if (stage === "abandoned") return "amber";
  if (stage === "failed") return "rose";
  if (stage === "refunded") return "violet";
  return "zinc";
}

function orderStatusTone(status: SalesCatalogOrderStatus): SalesCatalogTone {
  if (status === "paid" || status === "delivered") return "green";
  if (status === "pending_payment" || status === "in_preparation" || status === "shipped") return "cyan";
  if (status === "needs_human" || status === "draft") return "amber";
  if (status === "cancelled") return "rose";
  return "zinc";
}

function paymentStatusTone(status: SalesCatalogPaymentStatus): SalesCatalogTone {
  if (status === "confirmed") return "green";
  if (status === "proof_sent") return "cyan";
  if (status === "failed" || status === "refunded") return "rose";
  return "amber";
}

function fulfillmentStatusTone(status: SalesCatalogFulfillmentStatus): SalesCatalogTone {
  if (status === "fulfilled") return "green";
  if (status === "scheduled" || status === "in_progress") return "cyan";
  if (status === "cancelled") return "rose";
  return "amber";
}

function paymentSessionTone(status: SalesCatalogPaymentSessionStatus): SalesCatalogTone {
  if (status === "approved") return "green";
  if (status === "pending" || status === "created") return "cyan";
  if (status === "rejected" || status === "cancelled" || status === "expired" || status === "error") return "rose";
  if (status === "refunded") return "violet";
  return "amber";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDimensions(item: ClientSalesCatalogItem) {
  const dimensions = [
    item.shipping.dimensions.lengthCm ? `${item.shipping.dimensions.lengthCm}C` : "",
    item.shipping.dimensions.widthCm ? `${item.shipping.dimensions.widthCm}L` : "",
    item.shipping.dimensions.heightCm ? `${item.shipping.dimensions.heightCm}A` : "",
  ].filter(Boolean);

  return dimensions.length > 0 ? `${dimensions.join(" x ")} cm` : null;
}
