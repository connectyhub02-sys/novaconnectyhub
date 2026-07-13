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
  formatSalesCatalogFulfillmentStatus,
  formatSalesCatalogFulfillmentMode,
  formatSalesCatalogOrderStatus,
  formatSalesCatalogPaymentStatus,
  formatSalesCatalogPaymentSessionStatus,
  formatSalesCatalogStockStatus,
  formatSalesCatalogWeight,
  salesCatalogLeadDataFields,
  salesCatalogBusinessTemplates,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogOrder,
  type ClientSalesCatalogPaymentIntegration,
  type ClientSalesCatalogPaymentSession,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogShippingSettings,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
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
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
  type SalesCatalogShippingQuote,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogStockStatus,
  type SalesCatalogWhatsAppMessageTemplates,
} from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type SalesCatalogConsoleProps = {
  initialCompanies: ClientCompany[];
  initialItems: ClientSalesCatalogItem[];
  initialOrders: ClientSalesCatalogOrder[];
  initialPaymentIntegrations: ClientSalesCatalogPaymentIntegration[];
  initialPaymentSessions: ClientSalesCatalogPaymentSession[];
  initialSettings: ClientSalesCatalogSettings[];
  initialShippingSettings: ClientSalesCatalogShippingSettings[];
  initialCompanyId: string | null;
};

type CatalogTab = "setup" | "shipping" | "products" | "orders" | "payments" | "whatsapp";
type CommercialFlowFilter = "all" | SalesCatalogCommercialFlowType;

type SettingsDraft = {
  businessType: SalesCatalogBusinessType;
  categoriesText: string;
  attributes: SalesCatalogAttribute[];
  trackInventory: boolean;
  variationMedia: boolean;
  paymentMethods: SalesCatalogPaymentMethod[];
  orderPolicy: SalesCatalogOrderPolicy;
  leadDataPolicy: ClientSalesCatalogSettings["leadDataPolicy"];
  messageTemplates: SalesCatalogWhatsAppMessageTemplates;
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
  "Telefone ou JID opcional": "Informe um contato quando quiser vincular o pedido a um lead especifico do WhatsApp.",
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
  "Fotos, videos ou arquivos": "Envie midias e materiais que o agente pode apresentar ao lead.",
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
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialSelectedCompanyId);
  const [activeTab, setActiveTab] = useState<CatalogTab>(initialSelectedSettings?.configured ? "products" : "setup");
  const [orderFlowFilter, setOrderFlowFilter] = useState<CommercialFlowFilter>("all");
  const [paymentFlowFilter, setPaymentFlowFilter] = useState<CommercialFlowFilter>("all");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => buildSettingsDraft(initialSelectedSettings));
  const [shippingDraft, setShippingDraft] = useState<ShippingDraft>(() => buildShippingDraft(initialSelectedShippingSettings));
  const [selectedShippingUf, setSelectedShippingUf] = useState(() => initialSelectedShippingSettings?.rules.find((rule) => rule.active)?.uf ?? "SP");
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
  const [quoteItemId, setQuoteItemId] = useState("");
  const [quoteCep, setQuoteCep] = useState("");
  const [quoteResult, setQuoteResult] = useState<ShippingQuoteResult | null>(null);
  const [calculatingQuote, setCalculatingQuote] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
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
  const [catalogJid, setCatalogJid] = useState("");
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [visibilityId, setVisibilityId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => !selectedCompanyId || item.companyId === selectedCompanyId),
    [items, selectedCompanyId],
  );
  const visibleOrders = useMemo(
    () => orders.filter((order) => !selectedCompanyId || order.companyId === selectedCompanyId),
    [orders, selectedCompanyId],
  );
  const visiblePaymentSessions = useMemo(
    () => paymentSessions.filter((session) => !selectedCompanyId || session.companyId === selectedCompanyId),
    [paymentSessions, selectedCompanyId],
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
  const canCreate = Boolean(selectedCompanyId && title.trim() && description.trim() && !creating);
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

  function changeCompany(companyId: string) {
    const nextSettings = settings.find((entry) => entry.companyId === companyId) ?? null;
    const nextShippingSettings = shippingSettings.find((entry) => entry.companyId === companyId) ?? null;
    setSelectedCompanyId(companyId);
    setSettingsDraft(buildSettingsDraft(nextSettings));
    setShippingDraft(buildShippingDraft(nextShippingSettings));
    setSelectedShippingUf(nextShippingSettings?.rules.find((rule) => rule.active)?.uf ?? "SP");
    setSelectedAttributes({});
    setSkuDrafts([]);
    setEditingItemId(null);
    setQuoteItemId("");
    setQuoteCep("");
    setQuoteResult(null);
    setOrderItemId("");
    setOrderSkuId("");
    setOrderTotal("");
    if (!nextSettings?.configured) {
      setActiveTab("setup");
    }
  }

  function applyBusinessTemplate(value: SalesCatalogBusinessType) {
    setSettingsDraft((current) => ({
      ...current,
      businessType: value,
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

  function updateMessageTemplate(key: keyof SalesCatalogWhatsAppMessageTemplates, value: string) {
    setSettingsDraft((current) => ({
      ...current,
      messageTemplates: {
        ...current.messageTemplates,
        [key]: value.slice(0, 360),
      },
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
        }),
      });
      const data = await response.json().catch(() => null) as { settings?: ClientSalesCatalogSettings; error?: string } | null;

      if (!response.ok || !data?.settings) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao.");
      }

      setSettings((current) => [data.settings!, ...current.filter((entry) => entry.companyId !== data.settings!.companyId)]);
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
      formData.set("price", price);
      formData.set("currency", "BRL");
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
      const data = await response.json().catch(() => null) as { item?: ClientSalesCatalogItem; error?: string } | null;

      if (!response.ok || !data?.item) {
        throw new Error(data?.error ?? (isEditing ? "Nao foi possivel atualizar o item." : "Nao foi possivel cadastrar o item."));
      }

      setItems((current) => [data.item!, ...current.filter((item) => item.id !== data.item!.id)]);
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

  async function importWhatsappCatalog() {
    if (!selectedCompanyId || importing) return;

    setImporting(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_whatsapp_catalog",
          companyId: selectedCompanyId,
          catalogJid: catalogJid.trim() || undefined,
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
      setConfirmDeleteId(null);
      setNotice({ tone: "success", message: "Item removido do catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir item." });
    } finally {
      setDeletingId(null);
    }
  }

  async function copyTag(item: ClientSalesCatalogItem) {
    try {
      await navigator.clipboard.writeText(item.tag);
      setNotice({ tone: "success", message: `Tag copiada: ${item.tag}` });
    } catch {
      setNotice({ tone: "warning", message: item.tag });
    }
  }

  function editItem(item: ClientSalesCatalogItem) {
    if (item.companyId && item.companyId !== selectedCompanyId) {
      changeCompany(item.companyId);
    }

    setEditingItemId(item.id);
    setActiveTab("products");
    setTitle(item.title);
    setCategory(item.category ?? "");
    setPrice(item.price ?? "");
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
    setNotice({ tone: "warning", message: `Editando item: ${item.title}` });
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).slice(0, 8));
    event.target.value = "";
  }

  function resetForm() {
    setEditingItemId(null);
    setEditingMedia([]);
    setTitle("");
    setCategory("");
    setPrice("");
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

      <div id="sales-catalog-tour-tabs" className="mb-4 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        <TabButton active={activeTab === "setup"} icon={Settings2} label="Configuracao" mobileLabel="Config." onClick={() => setActiveTab("setup")} />
        <TabButton active={activeTab === "shipping"} icon={Truck} label="Entrega e Frete" mobileLabel="Frete" onClick={() => setActiveTab("shipping")} />
        <TabButton active={activeTab === "products"} disabled={!hasConfiguredSettings} icon={PackagePlus} label="Produtos" onClick={() => setActiveTab("products")} />
        <TabButton active={activeTab === "orders"} icon={ClipboardList} label="Pedidos WhatsApp" mobileLabel="Pedidos" onClick={() => setActiveTab("orders")} />
        <TabButton active={activeTab === "payments"} icon={CreditCard} label="Pagamentos" mobileLabel="Pagto." onClick={() => setActiveTab("payments")} />
        <TabButton active={activeTab === "whatsapp"} icon={CloudDownload} label="WhatsApp" onClick={() => setActiveTab("whatsapp")} />
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

              <AccordionSection icon={MessageSquareText} title="Mensagens automaticas" tone="cyan">
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="block">
                    <FieldLabel>Resumo do pedido</FieldLabel>
                    <textarea
                      value={settingsDraft.messageTemplates.orderSummary}
                      onChange={(event) => updateMessageTemplate("orderSummary", event.target.value)}
                      className="min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Pedido de pagamento</FieldLabel>
                    <textarea
                      value={settingsDraft.messageTemplates.paymentRequest}
                      onChange={(event) => updateMessageTemplate("paymentRequest", event.target.value)}
                      className="min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Pagamento confirmado</FieldLabel>
                    <textarea
                      value={settingsDraft.messageTemplates.paymentConfirmed}
                      onChange={(event) => updateMessageTemplate("paymentConfirmed", event.target.value)}
                      className="min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Item indisponivel</FieldLabel>
                    <textarea
                      value={settingsDraft.messageTemplates.unavailableItem}
                      onChange={(event) => updateMessageTemplate("unavailableItem", event.target.value)}
                      className="min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <FieldLabel>Transferencia humana</FieldLabel>
                    <textarea
                      value={settingsDraft.messageTemplates.humanHandoff}
                      onChange={(event) => updateMessageTemplate("humanHandoff", event.target.value)}
                      className="min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    />
                  </label>
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
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {activeTab === "products" ? (
          <Panel id="sales-catalog-tour-products" title={editingItemId ? "Editar item" : "Novo item"} eyebrow={selectedCompany?.name ?? "empresa"} tone="cyan" compact>
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

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="block">
                <FieldLabel>Fotos, videos ou arquivos</FieldLabel>
                <label
                  className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-center text-[12px] text-slate-400 transition hover:border-cyan-300/60 hover:text-cyan-200"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <Upload className="h-4 w-4" />
                  {files.length > 0 ? `${files.length} arquivo(s)` : "Selecionar arquivos"}
                  <input
                    multiple
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,application/json"
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
                {editingMedia.map((media) => (
                  <div key={media.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="flex min-w-0 items-center gap-2 text-slate-300">
                      <MediaIcon media={media} />
                      <span className="truncate">{media.fileName}</span>
                    </span>
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
                ))}
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
          ) : (
          <Panel title="Catalogo WhatsApp" eyebrow={selectedCompany?.name ?? "sincronizacao"} tone="violet" compact>
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
                <FieldLabel>Telefone ou JID opcional</FieldLabel>
                <input
                  value={catalogJid}
                  onChange={(event) => setCatalogJid(event.target.value.slice(0, 80))}
                  className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                  placeholder="5511999999999 ou 5511999999999@s.whatsapp.net"
                  style={{ borderColor: "var(--ch-border)" }}
                />
              </label>
              <button
                type="button"
                disabled={!selectedCompanyId || importing}
                onClick={importWhatsappCatalog}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-[12px] font-bold text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--ch-border)" }}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Importar / sincronizar
              </button>
            </div>
          </Panel>
          )}
        </div>

        <Panel title="Itens cadastrados" eyebrow={selectedCompany?.name ?? "catalogo"} tone="green" compact>
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
            <NeonBadge tone={item.source === "whatsapp_catalog" ? "green" : "cyan"}>{sourceLabel}</NeonBadge>
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
            title={item.tag}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{item.tag}</span>
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
    trackInventory: settings?.trackInventory ?? false,
    variationMedia: settings?.variationMedia ?? false,
    paymentMethods: clonePaymentMethods(settings?.paymentMethods.length ? settings.paymentMethods : commerceDefaults.paymentMethods),
    orderPolicy: { ...(settings?.orderPolicy ?? commerceDefaults.orderPolicy) },
    leadDataPolicy: {
      ...(settings?.leadDataPolicy ?? commerceDefaults.leadDataPolicy),
      requiredFields: [...(settings?.leadDataPolicy.requiredFields ?? commerceDefaults.leadDataPolicy.requiredFields)],
    },
    messageTemplates: { ...(settings?.messageTemplates ?? commerceDefaults.messageTemplates) },
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
