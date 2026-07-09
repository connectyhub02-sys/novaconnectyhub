"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  Box,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Loader2,
  PackagePlus,
  Plus,
  Save,
  ShoppingBag,
  SlidersHorizontal,
  Tags,
  Trash2,
  Truck,
  Upload,
  Video,
  X,
} from "lucide-react";
import type {
  PlatformProduct,
  PlatformProductCatalog,
  PlatformProductCommission,
  PlatformProductCommissionPolicyType,
  PlatformProductCommissionStatus,
  PlatformProductMarketplaceStatus,
  PlatformProductOwnerType,
  PlatformProductPayoutTargetType,
  PlatformProductRevenueOwnerType,
  PlatformProductSalesChannelType,
  PlatformProductSettings,
  PlatformProductStatus,
} from "@/lib/platform-products";
import {
  salesCatalogBusinessTemplates,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogItemAttribute,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogMedia,
  type SalesCatalogShippingProfile,
  type SalesCatalogSkuStatus,
  type SalesCatalogStockStatus,
} from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";
import { ConnectyShell } from "./connecty-shell";
import { GuidedTour, HelpHint, type GuidedTourStep } from "./guided-help";
import { NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";

type ProductDraft = {
  productId: string;
  name: string;
  productCode: string;
  slug: string;
  shortDescription: string;
  commercialDescription: string;
  category: string;
  price: string;
  currency: string;
  status: PlatformProductStatus;
  marketplaceStatus: PlatformProductMarketplaceStatus;
  ownerType: PlatformProductOwnerType;
  salesChannelType: PlatformProductSalesChannelType;
  revenueOwnerType: PlatformProductRevenueOwnerType;
  commissionPolicyType: PlatformProductCommissionPolicyType;
  payoutTargetType: PlatformProductPayoutTargetType;
  commissionPercentage: string;
  commissionBase: "gross" | "net";
  commissionReleaseDays: string;
  recurringCommissionMonths: string;
  refundWindowDays: string;
  salePrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
  couponCode: string;
  couponDescription: string;
  callToAction: string;
  offerNotes: string;
  inventoryStatus: SalesCatalogStockStatus;
  stockQuantity: string;
  lowStockThreshold: string;
  allowBackorder: boolean;
  inventoryNotes: string;
  fulfillmentMode: SalesCatalogFulfillmentMode;
  schedulingRequired: boolean;
  serviceDuration: string;
  deliveryInstructions: string;
  accessInstructions: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  shippingProfile: SalesCatalogShippingProfile;
  shippingNotes: string;
  agentTag: string;
  agentPrompt: string;
  salesNotes: string;
};

type AttributeDraft = {
  id: string;
  name: string;
  valuesText: string;
};

type SettingsDraft = {
  businessType: SalesCatalogBusinessType;
  categoriesText: string;
  attributes: SalesCatalogAttribute[];
  trackInventory: boolean;
  variationMedia: boolean;
};

type SkuDraft = {
  skuCode: string;
  title: string;
  attributesText: string;
  price: string;
  salePrice: string;
  stockStatus: SalesCatalogStockStatus;
  stockQuantity: string;
  lowStockThreshold: string;
  weightGrams: string;
  status: SalesCatalogSkuStatus;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type PlatformProductAdminTab = "setup" | "products" | "commissions";
type PlatformUiTone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

const platformUiToneStyles: Record<PlatformUiTone, { rgb: string; fill: string; text: string; label: string }> = {
  green: { rgb: "52,211,153", fill: "#34d399", text: "text-emerald-200", label: "text-emerald-300" },
  cyan: { rgb: "34,211,238", fill: "#22d3ee", text: "text-cyan-200", label: "text-cyan-300" },
  amber: { rgb: "251,191,36", fill: "#fbbf24", text: "text-amber-200", label: "text-amber-300" },
  rose: { rgb: "251,113,133", fill: "#fb7185", text: "text-rose-200", label: "text-rose-300" },
  violet: { rgb: "167,139,250", fill: "#a78bfa", text: "text-violet-200", label: "text-violet-300" },
  zinc: { rgb: "148,163,184", fill: "#94a3b8", text: "text-slate-200", label: "text-slate-300" },
};

const emptyDraft: ProductDraft = {
  productId: "",
  name: "",
  productCode: "",
  slug: "",
  shortDescription: "",
  commercialDescription: "",
  category: "",
  price: "",
  currency: "BRL",
  status: "active",
  marketplaceStatus: "visible",
  ownerType: "connectyhub",
  salesChannelType: "resale",
  revenueOwnerType: "connectyhub",
  commissionPolicyType: "percentage",
  payoutTargetType: "connectyhub",
  commissionPercentage: "0",
  commissionBase: "gross",
  commissionReleaseDays: "15",
  recurringCommissionMonths: "0",
  refundWindowDays: "7",
  salePrice: "",
  saleStartsAt: "",
  saleEndsAt: "",
  couponCode: "",
  couponDescription: "",
  callToAction: "",
  offerNotes: "",
  inventoryStatus: "in_stock",
  stockQuantity: "",
  lowStockThreshold: "",
  allowBackorder: false,
  inventoryNotes: "",
  fulfillmentMode: "physical",
  schedulingRequired: false,
  serviceDuration: "",
  deliveryInstructions: "",
  accessInstructions: "",
  weightGrams: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  shippingProfile: "default",
  shippingNotes: "",
  agentTag: "",
  agentPrompt: "",
  salesNotes: "",
};

const inputStyle = {
  background: "var(--ch-surface)",
  border: "1px solid var(--ch-border)",
  color: "var(--ch-text)",
};

const platformProductTourSteps: GuidedTourStep[] = [
  {
    id: "setup",
    targetId: "platform-products-tour-setup",
    title: "Configure a base do admin",
    body: "Comece com tipo de venda, categorias e variacoes globais. O admin tambem deve nascer zerado e ser controlado por voce.",
  },
  {
    id: "categories",
    targetId: "platform-products-tour-categories",
    title: "Crie categorias proprias",
    body: "As categorias ConnectyHub devem ser criadas manualmente pelo admin, sem depender de lista pronta.",
  },
  {
    id: "product",
    targetId: "platform-products-tour-product-form",
    title: "Cadastre o produto",
    body: "No cadastro, informe nome, preco, descricao, midias, estoque, entrega e regras comerciais seguindo o modelo de e-commerce.",
  },
  {
    id: "visibility",
    targetId: "platform-products-tour-visibility",
    title: "Decida se aparece para usuarios",
    body: "Aqui voce escolhe se o produto entra na vitrine do painel do usuario para importacao ou se fica oculto no admin.",
  },
  {
    id: "marketplace",
    targetId: "platform-products-tour-marketplace",
    title: "Controle marketplace e status",
    body: "Defina codigo, slug, status e vitrine para separar rascunho, produto ativo, destaque e item oculto.",
  },
  {
    id: "revenue",
    targetId: "platform-products-tour-revenue",
    title: "Separe origem e recebimento",
    body: "Marque se e produto ConnectyHub, venda direta, revenda com comissao ou marketplace para o financeiro ficar rastreavel.",
  },
  {
    id: "commission",
    targetId: "platform-products-tour-commission",
    title: "Configure comissao e repasse",
    body: "Defina percentual, base, prazo de liberacao, recorrencia e garantia para calcular o que deve ser pago ao cliente.",
  },
  {
    id: "payouts",
    targetId: "platform-products-tour-payouts",
    title: "Acompanhe repasses",
    body: "Use esta aba para revisar comissoes pendentes, liberadas e pagas antes de fechar o financeiro.",
  },
];

const platformProductHelpText: Record<string, string> = {
  "Tipo de venda": "Define o modelo principal do catalogo ConnectyHub e ajuda a orientar os defaults de cadastro.",
  "Base do catalogo ConnectyHub": "Configuracao global do admin: tipo de venda, estoque por variacao, midia por variacao, categorias e atributos.",
  Categorias: "Crie manualmente as categorias que vao organizar os produtos ConnectyHub.",
  "Variacoes do catalogo": "Cadastre atributos globais como tamanho, cor, material, publico ou qualquer variavel do produto.",
  "Visibilidade no painel do usuario": "Escolha se o produto aparece para clientes importarem ou fica oculto apenas no admin.",
  Nome: "Nome publico do produto que sera visto no admin, vitrine e importacao.",
  Valor: "Preco principal usado para venda, repasse e apresentacao ao usuario.",
  Categoria: "Selecione ou crie a categoria que melhor organiza esse produto.",
  "Descricao curta para vitrine": "Resumo rapido para cards, listas e importacao do usuario.",
  "Descricao comercial": "Texto completo para venda no WhatsApp: beneficios, condicoes, entrega, garantia e objeccoes.",
  "Oferta e fechamento": "Configure preco promocional, cupom, periodo da oferta e chamada comercial.",
  Promocional: "Preco promocional exibido quando houver campanha ativa.",
  Cupom: "Codigo que o agente ou cliente pode usar na venda.",
  Inicio: "Data em que a oferta passa a valer.",
  Fim: "Data final da oferta.",
  "Variacoes deste item": "Escolha quais atributos e opcoes existem nesse produto especifico.",
  "Estoque deste item": "Controle disponibilidade, quantidade, alerta de estoque e encomenda.",
  Disponibilidade: "Status de estoque apresentado para venda ou importacao.",
  Quantidade: "Quantidade disponivel quando o estoque e controlado.",
  "Alerta baixo": "Ponto em que o sistema deve sinalizar estoque baixo.",
  "SKUs e variacoes vendaveis": "Cadastre combinacoes vendaveis com preco, estoque e peso proprios.",
  "Fotos, videos ou arquivos": "Envie midias e arquivos para R2 e vincule ao produto.",
  "Agente e venda": "Defina tag, prompt e notas internas usadas pelo agente no atendimento.",
  Tag: "Identificador curto para o agente reconhecer ou acionar o produto.",
  "Prompt do agente": "Orientacoes especificas que o agente deve seguir ao vender esse item.",
  "Notas internas de venda": "Informacoes para o time, nao necessariamente exibidas ao cliente.",
  "Entrega deste item": "Configure tipo de produto, frete, dimensoes e instrucoes de acesso ou entrega.",
  Tipo: "Escolha se o item e fisico, digital, servico ou assinatura.",
  "Prazo/duracao": "Prazo de entrega, execucao, acesso ou duracao do servico.",
  "Peso g": "Peso em gramas usado para calculo de frete.",
  Frete: "Escolha a regra de envio aplicada ao produto.",
  "Comprimento cm": "Dimensao usada em cotacoes de entrega quando necessario.",
  "Largura cm": "Dimensao usada em cotacoes de entrega quando necessario.",
  "Altura cm": "Dimensao usada em cotacoes de entrega quando necessario.",
  "Produto no marketplace": "Controle identificacao, status e se o item aparece ou nao na vitrine do usuario.",
  Codigo: "Codigo interno do produto. Se ficar vazio, o sistema gera automaticamente.",
  Slug: "Endereco amigavel usado em links e futuras paginas de produto.",
  Status: "Define se o produto esta ativo, pausado, arquivado ou em rascunho.",
  "Vitrine usuario": "Define se o produto fica oculto, visivel ou em destaque para usuarios importarem.",
  "Origem e recebimento": "Separa produto ConnectyHub, fornecedor, venda direta, revenda, receita e destino do repasse.",
  "Dono do produto": "Indica quem controla a origem do produto.",
  Receita: "Define quem deve receber a receita principal da venda.",
  Comissao: "Escolha se havera comissao, percentual, valor fixo futuro ou regra personalizada.",
  "Repasse para": "Define para onde o repasse financeiro deve ir.",
  "Regra de comissao": "Configure percentual, base de calculo, prazo de liberacao, recorrencia e garantia.",
  "% comissao": "Percentual pago ao cliente quando ele vender produto ConnectyHub por comissao.",
  Base: "Define se o calculo da comissao usa valor bruto ou liquido.",
  "Repasse dias": "Quantidade de dias apos a venda para liberar a comissao.",
  "Recorrencia meses": "Quantidade de meses em que a comissao continua em vendas recorrentes.",
  "Garantia dias": "Prazo de seguranca para estorno ou bloqueio antes de liberar comissao.",
  "Referencia do repasse": "Identificador interno do pagamento em lote, como PIX ou data.",
  "Observacao interna": "Nota administrativa sobre o pagamento de repasse.",
};

export function PlatformProductsConsole({
  catalog,
  userLabel = "CEO_HUMAN_ADM",
}: {
  catalog: PlatformProductCatalog;
  userLabel?: string;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(catalog.products);
  const [settings, setSettings] = useState(catalog.settings);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => buildSettingsDraft(catalog.settings));
  const [draft, setDraft] = useState<ProductDraft>(() => createDraft(null));
  const [attributes, setAttributes] = useState<AttributeDraft[]>([]);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string[]>>({});
  const [skus, setSkus] = useState<SkuDraft[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [editingMedia, setEditingMedia] = useState<SalesCatalogMedia[]>([]);
  const [commissions, setCommissions] = useState(catalog.commissions);
  const [saving, setSaving] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishingProductId, setPublishingProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [commissionLoadingId, setCommissionLoadingId] = useState<string | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformProductAdminTab>("products");
  const metrics = useMemo(() => buildMetrics(products, catalog.imports.length, commissions), [products, catalog.imports.length, commissions]);
  const commissionSummary = useMemo(() => buildCommissionSummary(commissions), [commissions]);
  const availableCommissionIds = useMemo(() => (
    commissions.filter((commission) => commission.status === "available").map((commission) => commission.id)
  ), [commissions]);
  const categoryRows = useMemo(() => getCategoryRows(settingsDraft.categoriesText), [settingsDraft.categoriesText]);
  const productAttributes = useMemo(
    () => (settings.configured ? settings.attributes : settingsDraft.attributes).filter((attribute) => attribute.values.length > 0),
    [settings, settingsDraft.attributes],
  );
  const categories = useMemo(() => Array.from(new Set([
    ...(settings.configured ? settings.categories : parseLines(settingsDraft.categoriesText)),
    ...products.map((product) => product.category).filter((item): item is string => Boolean(item)),
  ])).sort((left, right) => left.localeCompare(right)), [products, settings, settingsDraft.categoriesText]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const formData = buildFormData();
      const response = await fetch("/api/admin/platform-products", {
        method: draft.productId ? "PATCH" : "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as { product?: PlatformProduct; error?: string } | null;

      if (!response.ok || !data?.product) {
        throw new Error(data?.error ?? "Nao foi possivel salvar o produto ConnectyHub.");
      }

      setProducts((current) => upsertProduct(current, data.product!));
      resetForm();
      setConfirmDeleteProductId(null);
      setNotice({ tone: "success", message: "Produto ConnectyHub salvo e pronto para aparecer na vitrine conforme a visibilidade." });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Falha ao salvar produto." });
    } finally {
      setSaving(false);
    }
  }

  function buildFormData() {
    return buildProductFormData({
      attributes: getCurrentItemAttributes(),
      draft,
      files,
      keepMediaIds: editingMedia.map((media) => media.id),
      skus,
    });
  }

  function getCurrentItemAttributes() {
    const configuredAttributes = buildSelectedItemAttributes(productAttributes, selectedAttributes);

    if (productAttributes.length > 0) {
      return configuredAttributes;
    }

    return attributesToPayload(attributes);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setNotice(null);

    try {
      const categoriesPayload = parseLines(settingsDraft.categoriesText);
      const response = await fetch("/api/admin/platform-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_catalog_settings",
          businessType: settingsDraft.businessType,
          categories: categoriesPayload,
          attributes: settingsDraft.attributes.map((attribute) => ({
            id: attribute.id,
            name: attribute.name,
            values: attribute.values,
            required: attribute.required,
          })),
          trackInventory: settingsDraft.trackInventory,
          variationMedia: settingsDraft.variationMedia,
        }),
      });
      const data = (await response.json().catch(() => null)) as { settings?: PlatformProductSettings; error?: string } | null;

      if (!response.ok || !data?.settings) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao do catalogo ConnectyHub.");
      }

      setSettings(data.settings);
      setSettingsDraft(buildSettingsDraft(data.settings));
      setNotice({ tone: "success", message: "Configuracao global do catalogo salva. Novos produtos passam a usar essas categorias e variacoes." });
      setActiveTab("products");
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Falha ao salvar configuracao." });
    } finally {
      setSavingSettings(false);
    }
  }

  function editProduct(product: PlatformProduct) {
    setDraft(createDraft(product));
    setAttributes(productAttributesToDrafts(product));
    setSelectedAttributes(Object.fromEntries(product.attributes.map((attribute) => [attribute.id, attribute.values])));
    setSkus(productSkusToDrafts(product));
    setEditingMedia(product.media);
    setFiles([]);
    setConfirmDeleteProductId(null);
    setNotice(null);
    setActiveTab("products");
  }

  async function publishProduct(product: PlatformProduct) {
    setPublishingProductId(product.id);
    setNotice(null);

    try {
      const formData = buildProductFormData({
        attributes: product.attributes,
        draft: {
          ...createDraft(product),
          status: "active",
          marketplaceStatus: product.marketplaceStatus === "featured" ? "featured" : "visible",
        },
        keepMediaIds: product.media.map((media) => media.id),
        skus: productSkusToDrafts(product),
      });
      const response = await fetch("/api/admin/platform-products", {
        method: "PATCH",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as { product?: PlatformProduct; error?: string } | null;

      if (!response.ok || !data?.product) {
        throw new Error(data?.error ?? "Nao foi possivel publicar o produto.");
      }

      setProducts((current) => upsertProduct(current, data.product!));
      setConfirmDeleteProductId(null);
      setNotice({ tone: "success", message: "Produto publicado. Ele ja pode aparecer em Produtos no painel do usuario apos atualizar a pagina." });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Falha ao publicar produto." });
    } finally {
      setPublishingProductId(null);
    }
  }

  function resetForm() {
    setDraft(createDraft(null));
    setAttributes([]);
    setSelectedAttributes({});
    setSkus([]);
    setFiles([]);
    setEditingMedia([]);
    setConfirmDeleteProductId(null);
    setActiveTab("products");
  }

  async function deleteProduct(product: PlatformProduct) {
    setNotice(null);

    if (confirmDeleteProductId !== product.id) {
      setConfirmDeleteProductId(product.id);
      setNotice({ tone: "warning", message: `Clique em Confirmar excluir para apagar "${product.name}" do catalogo ConnectyHub.` });
      return;
    }

    setDeletingProductId(product.id);

    try {
      const response = await fetch("/api/admin/platform-products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await response.json().catch(() => null)) as {
        deletedProductId?: string;
        deletedImports?: number;
        deletedCommissions?: number;
        error?: string;
      } | null;

      if (!response.ok || data?.deletedProductId !== product.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o produto ConnectyHub.");
      }

      setProducts((current) => current.filter((item) => item.id !== product.id));
      setCommissions((current) => current.filter((commission) => commission.platformProductId !== product.id));
      setConfirmDeleteProductId(null);

      if (draft.productId === product.id) {
        resetForm();
      }

      setNotice({
        tone: "success",
        message: `Produto excluido. Vinculos removidos: ${data.deletedImports ?? 0} importacao(oes), ${data.deletedCommissions ?? 0} comissao(oes).`,
      });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir produto." });
    } finally {
      setDeletingProductId(null);
    }
  }

  function applyBusinessTemplate(templateValue: SalesCatalogBusinessType) {
    setSettingsDraft((current) => ({
      ...current,
      businessType: templateValue,
    }));
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).slice(0, 12));
    event.target.value = "";
  }

  function setUserPanelVisibility(visible: boolean) {
    setDraft((current) => ({
      ...current,
      status: visible ? "active" : current.status === "archived" ? "archived" : "active",
      marketplaceStatus: visible && current.salesChannelType !== "direct"
        ? current.marketplaceStatus === "featured" ? "featured" : "visible"
        : "hidden",
    }));
  }

  async function updateCommissionStatus(commission: PlatformProductCommission, status: PlatformProductCommissionStatus) {
    setCommissionLoadingId(commission.id);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/platform-product-commissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionId: commission.id,
          status,
          payoutReference: status === "paid" ? payoutReference : undefined,
          payoutNote: status === "paid" ? payoutNote : undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as { commission?: PlatformProductCommission; commissions?: PlatformProductCommission[]; error?: string } | null;
      const updatedCommissions = data?.commissions?.length ? data.commissions : data?.commission ? [data.commission] : [];

      if (!response.ok || updatedCommissions.length === 0) {
        throw new Error(data?.error ?? "Nao foi possivel atualizar a comissao.");
      }

      setCommissions((current) => mergeCommissions(current, updatedCommissions));
      setNotice({ tone: "success", message: `Comissao atualizada para ${formatCommissionStatus(updatedCommissions[0].status)}.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Falha ao atualizar comissao." });
    } finally {
      setCommissionLoadingId(null);
    }
  }

  async function payAvailableCommissions() {
    if (availableCommissionIds.length === 0 || batchPaying) return;

    setBatchPaying(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/platform-product-commissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionIds: availableCommissionIds,
          status: "paid",
          payoutReference,
          payoutNote,
        }),
      });
      const data = (await response.json().catch(() => null)) as { commissions?: PlatformProductCommission[]; error?: string } | null;

      if (!response.ok || !data?.commissions?.length) {
        throw new Error(data?.error ?? "Nao foi possivel marcar o lote como pago.");
      }

      setCommissions((current) => mergeCommissions(current, data.commissions!));
      setPayoutReference("");
      setPayoutNote("");
      setNotice({ tone: "success", message: `${data.commissions.length} comissao(oes) marcadas como pagas.` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Falha ao pagar lote de comissoes." });
    } finally {
      setBatchPaying(false);
    }
  }

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel} activeHref="/admin/produtos-connectyhub">
      <PageHeader
        eyebrow="Admin OS / Marketplace"
        title="Produtos ConnectyHub"
        description="Cadastre os produtos globais que podem aparecer no painel do usuario para importacao e venda por comissao."
        actions={
          <div className="flex flex-wrap gap-2">
            <GuidedTour
              storageKey="connectyhub.platform-products-tour.v1"
              steps={platformProductTourSteps}
              launcherLabel="Tour guiado"
              onStepChange={(step) => {
                if (["setup", "categories"].includes(step.id)) setActiveTab("setup");
                if (["product", "visibility", "marketplace", "revenue", "commission"].includes(step.id)) setActiveTab("products");
                if (step.id === "payouts") setActiveTab("commissions");
              }}
            />
            <NeonBadge tone={catalog.schemaReady ? "green" : "amber"}>{catalog.schemaReady ? "Schema pronto" : "Aguardando SQL"}</NeonBadge>
            <NeonBadge tone="cyan">{metrics.available} na vitrine</NeonBadge>
            <NeonBadge tone="amber">{metrics.resale} revenda</NeonBadge>
            <NeonBadge tone="zinc">{metrics.direct} venda direta</NeonBadge>
            <NeonBadge tone="amber">{metrics.imports} importacoes</NeonBadge>
            <NeonBadge tone="green">{formatMoney(metrics.payableCommission)} repasse</NeonBadge>
          </div>
        }
      />

      {!catalog.schemaReady ? (
        <Panel title="Migration pendente" eyebrow="supabase">
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] leading-6 text-amber-100">
            Aplique a migration de marketplace de produtos no Supabase para liberar cadastro, vitrine e importacao.
          </div>
        </Panel>
      ) : (
        <div className="space-y-5">
          {notice ? (
            <div
              className="rounded-2xl px-4 py-3 text-[13px] font-medium"
              style={{
                background: notice.tone === "success"
                  ? "rgba(16,185,129,0.10)"
                  : notice.tone === "warning"
                    ? "rgba(245,158,11,0.10)"
                    : "rgba(244,63,94,0.08)",
                border: notice.tone === "success"
                  ? "1px solid rgba(16,185,129,0.24)"
                  : notice.tone === "warning"
                    ? "1px solid rgba(245,158,11,0.28)"
                    : "1px solid rgba(244,63,94,0.22)",
                color: notice.tone === "success" ? "#86efac" : notice.tone === "warning" ? "#fde68a" : "#fda4af",
              }}
            >
              {notice.message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Metric icon={Box} label="Produtos" value={String(products.length)} detail={`${metrics.active} ativos`} tone="cyan" />
            <Metric icon={PackagePlus} label="Revenda" value={String(metrics.resale)} detail={`${metrics.featured} em destaque`} tone="green" />
            <Metric icon={ShoppingBag} label="Venda direta" value={String(metrics.direct)} detail="sem repasse afiliado" tone="violet" />
            <Metric icon={BadgePercent} label="Comissao media" value={`${metrics.averageCommission}%`} detail={`${metrics.commissionable} comissao ativa`} tone="amber" />
            <Metric icon={Tags} label="Importacoes" value={String(metrics.imports)} detail="empresas de clientes" tone="rose" />
            <Metric icon={CheckCircle2} label="Repasses" value={formatMoney(metrics.payableCommission)} detail={`${metrics.pendingCommissions} pendentes`} tone="green" />
          </div>

          <div className="flex flex-wrap gap-2">
            <CatalogTabButton active={activeTab === "setup"} icon={SlidersHorizontal} label="Configuracao" onClick={() => setActiveTab("setup")} />
            <CatalogTabButton active={activeTab === "products"} icon={PackagePlus} label="Produtos" onClick={() => setActiveTab("products")} />
            <CatalogTabButton active={activeTab === "commissions"} icon={CheckCircle2} label="Repasses" onClick={() => setActiveTab("commissions")} />
          </div>

          {activeTab === "commissions" ? (
            <div className="space-y-5">
              <Panel id="platform-products-tour-payouts" title="Resumo de repasses" eyebrow="financeiro marketplace" tone="green" compact>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <SettlementMetric label="Gerada" value={formatMoney(commissionSummary.totalAmount)} detail={`${commissionSummary.totalCount} registro(s)`} tone="cyan" />
                  <SettlementMetric label="Pendente" value={formatMoney(commissionSummary.pendingAmount)} detail={`${commissionSummary.pendingCount} aguardando`} tone="amber" />
                  <SettlementMetric label="Liberada" value={formatMoney(commissionSummary.availableAmount)} detail={`${commissionSummary.availableCount} pronta(s)`} tone="green" />
                  <SettlementMetric label="Paga" value={formatMoney(commissionSummary.paidAmount)} detail={`${commissionSummary.paidCount} finalizada(s)`} tone="green" />
                  <SettlementMetric label="Bloq/estorno" value={formatMoney(commissionSummary.blockedAmount)} detail={`${commissionSummary.blockedCount} ocorrencia(s)`} tone="rose" />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)_auto]">
                  <Field label="Referencia do repasse">
                    <input
                      value={payoutReference}
                      onChange={(event) => setPayoutReference(event.target.value)}
                      placeholder="ex: PIX 09/07"
                      className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Observacao interna">
                    <input
                      value={payoutNote}
                      onChange={(event) => setPayoutNote(event.target.value)}
                      placeholder="opcional"
                      className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={batchPaying || availableCommissionIds.length === 0}
                    onClick={payAvailableCommissions}
                    className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    {batchPaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Pagar liberadas
                  </button>
                </div>
              </Panel>

              <Panel title="Comissoes e repasses" eyebrow="vendas marketplace" tone="amber" compact>
                <div className="grid gap-3 lg:grid-cols-2">
                  {commissions.length > 0 ? commissions.map((commission) => (
                    <CommissionCard
                      key={commission.id}
                      commission={commission}
                      loading={commissionLoadingId === commission.id}
                      product={products.find((item) => item.id === commission.platformProductId) ?? null}
                      onStatus={(status) => updateCommissionStatus(commission, status)}
                    />
                  )) : (
                    <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                      Nenhuma comissao registrada ainda.
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(380px,0.82fr)_minmax(0,1fr)]">
              <Panel
                id={activeTab === "setup" ? "platform-products-tour-setup" : "platform-products-tour-product-form"}
                title={activeTab === "setup" ? "Configuracao do Catalogo" : draft.productId ? "Editar item" : "Novo item"}
                eyebrow={activeTab === "setup" ? "base do catalogo" : "catalogo de produtos"}
                tone={activeTab === "setup" ? "cyan" : "green"}
                compact
              >
                <form className="space-y-4" onSubmit={activeTab === "products" ? saveProduct : (event) => event.preventDefault()}>
                  {activeTab === "setup" ? (
                    <>
                      <Block icon={SlidersHorizontal} title="Base do catalogo ConnectyHub" tone="cyan" defaultOpen>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                          <Field label="Tipo de venda">
                            <select value={settingsDraft.businessType} onChange={(event) => applyBusinessTemplate(event.target.value as SalesCatalogBusinessType)} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              {salesCatalogBusinessTemplates.map((template) => (
                                <option key={template.value} value={template.value}>{template.label}</option>
                              ))}
                            </select>
                          </Field>
                          <label className="mt-[18px] flex h-10 items-center justify-between rounded-xl px-3 text-[12px]" style={inputStyle}>
                            <span className="flex items-center gap-1.5">
                              Estoque por variacao
                              <HelpHint title="Estoque por variacao">Ative quando cada SKU, tamanho ou cor precisar ter estoque proprio.</HelpHint>
                            </span>
                            <input checked={settingsDraft.trackInventory} type="checkbox" onChange={(event) => setSettingsDraft((current) => ({ ...current, trackInventory: event.target.checked }))} />
                          </label>
                          <label className="mt-[18px] flex h-10 items-center justify-between rounded-xl px-3 text-[12px]" style={inputStyle}>
                            <span className="flex items-center gap-1.5">
                              Midia por variacao
                              <HelpHint title="Midia por variacao">Ative quando cada variacao precisar de foto, video ou arquivo proprio.</HelpHint>
                            </span>
                            <input checked={settingsDraft.variationMedia} type="checkbox" onChange={(event) => setSettingsDraft((current) => ({ ...current, variationMedia: event.target.checked }))} />
                          </label>
                        </div>
                      </Block>

                      <Block id="platform-products-tour-categories" icon={Tags} title="Categorias" tone="green" defaultOpen>
                        <div className="mb-3 flex justify-end">
                          <button type="button" onClick={() => addCategoryRow()} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100" style={{ borderColor: "var(--ch-border)" }}>
                            <Plus className="h-3.5 w-3.5" />
                            Nova categoria
                          </button>
                        </div>
                        <div className="grid gap-2">
                          {categoryRows.map((categoryName, index) => (
                            <div key={index} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2">
                              <input value={categoryName} onChange={(event) => updateCategoryRow(index, event.target.value)} className="h-10 min-w-0 rounded-xl px-3 text-[13px] outline-none" placeholder="Nome da categoria" style={inputStyle} />
                              <button type="button" onClick={() => removeCategoryRow(index)} className="grid h-10 place-items-center rounded-xl border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100" style={{ borderColor: "var(--ch-border)" }}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </Block>

                      <Block icon={SlidersHorizontal} title="Variacoes do catalogo" tone="violet">
                        <div className="mb-3 flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={addSettingsAttribute} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100" style={{ borderColor: "var(--ch-border)" }}>
                            <Plus className="h-3.5 w-3.5" />
                            Manual
                          </button>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {settingsDraft.attributes.map((attribute) => (
                            <div key={attribute.id} className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                              <div className="flex items-start gap-2">
                                <input value={attribute.name} onChange={(event) => updateSettingsAttribute(attribute.id, { name: event.target.value.slice(0, 50) })} className="h-10 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none" placeholder="Nome da variacao" style={inputStyle} />
                                <button type="button" onClick={() => removeSettingsAttribute(attribute.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100" style={{ borderColor: "var(--ch-border)" }}>
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              <textarea value={attribute.values.join("\n")} onChange={(event) => updateSettingsAttribute(attribute.id, { values: parseLines(event.target.value).slice(0, 40) })} className="mt-2 min-h-24 w-full resize-y rounded-xl px-3 py-2 text-[13px] leading-5 outline-none" placeholder="Uma opcao por linha" style={inputStyle} />
                              <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                                <input checked={attribute.required} type="checkbox" onChange={(event) => updateSettingsAttribute(attribute.id, { required: event.target.checked })} />
                                Obrigatoria no atendimento/importacao
                              </label>
                            </div>
                          ))}
                        </div>
                      </Block>
                    </>
                  ) : null}

                  {activeTab === "products" ? (
                    <>
                      <Block id="platform-products-tour-visibility" icon={draft.marketplaceStatus !== "hidden" && draft.status === "active" ? Eye : EyeOff} title="Visibilidade no painel do usuario" tone="cyan" defaultOpen>
                        {draft.salesChannelType === "direct" ? (
                          <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
                            Venda direta ConnectyHub fica fora da importacao dos usuarios e sera vendida por checkout/campanha propria.
                          </div>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={draft.salesChannelType === "direct"}
                            onClick={() => setUserPanelVisibility(true)}
                            className="flex min-h-20 items-start gap-3 rounded-xl border px-3 py-3 text-left transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            style={{
                              borderColor: draft.status === "active" && draft.marketplaceStatus !== "hidden" ? "rgba(34,211,238,0.52)" : "var(--ch-border)",
                              background: draft.status === "active" && draft.marketplaceStatus !== "hidden" ? "rgba(6,182,212,0.12)" : "var(--ch-surface-2)",
                            }}
                          >
                            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                            <span>
                              <span className="block text-[12px] font-semibold text-slate-100">Aparecer para usuarios</span>
                              <span className="mt-1 block text-[11px] leading-5 text-slate-500">O cliente ve em Produtos e pode importar para revender.</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserPanelVisibility(false)}
                            className="flex min-h-20 items-start gap-3 rounded-xl border px-3 py-3 text-left transition hover:bg-slate-400/10"
                            style={{
                              borderColor: draft.marketplaceStatus === "hidden" ? "rgba(148,163,184,0.52)" : "var(--ch-border)",
                              background: draft.marketplaceStatus === "hidden" ? "rgba(148,163,184,0.10)" : "var(--ch-surface-2)",
                            }}
                          >
                            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                            <span>
                              <span className="block text-[12px] font-semibold text-slate-100">Manter oculto</span>
                              <span className="mt-1 block text-[11px] leading-5 text-slate-500">Fica cadastrado no admin, mas nao aparece para clientes.</span>
                            </span>
                          </button>
                        </div>
                      </Block>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
                        <Field label="Nome">
                          <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value.slice(0, 120) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Ex.: Mentoria, camiseta preta, pacote digital" style={inputStyle} />
                        </Field>
                        <Field label="Valor">
                          <input value={draft.price} onChange={(event) => patchDraft({ price: event.target.value.slice(0, 60) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="R$ 197,00" style={inputStyle} />
                        </Field>
                      </div>

                      <Field label="Categoria">
                        {categories.length > 0 ? (
                          <select value={draft.category} onChange={(event) => patchDraft({ category: event.target.value })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                            <option value="">Selecionar categoria</option>
                            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        ) : (
                          <input value={draft.category} onChange={(event) => patchDraft({ category: event.target.value.slice(0, 80) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Produto, servico, curso, roupa" style={inputStyle} />
                        )}
                      </Field>

                      <Field label="Descricao curta para vitrine">
                        <input value={draft.shortDescription} onChange={(event) => patchDraft({ shortDescription: event.target.value.slice(0, 220) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle} />
                      </Field>

                      <Field label="Descricao comercial">
                        <textarea value={draft.commercialDescription} onChange={(event) => patchDraft({ commercialDescription: event.target.value.slice(0, 2200) })} className="min-h-28 w-full resize-y rounded-xl px-3 py-3 text-[13px] leading-5 outline-none" placeholder="O que e, para quem serve, beneficios, entrega, garantias e condicoes." style={inputStyle} />
                      </Field>

                      <Block icon={BadgePercent} title="Oferta e fechamento" tone="amber">
                        <div className="grid gap-3 md:grid-cols-4">
                          <Field label="Promocional"><input value={draft.salePrice} onChange={(event) => patchDraft({ salePrice: event.target.value.slice(0, 60) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle} /></Field>
                          <Field label="Cupom"><input value={draft.couponCode} onChange={(event) => patchDraft({ couponCode: cleanCode(event.target.value) })} className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none" style={inputStyle} /></Field>
                          <Field label="Inicio"><input type="date" value={draft.saleStartsAt} onChange={(event) => patchDraft({ saleStartsAt: event.target.value })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle} /></Field>
                          <Field label="Fim"><input type="date" value={draft.saleEndsAt} onChange={(event) => patchDraft({ saleEndsAt: event.target.value })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle} /></Field>
                        </div>
                        <div className="mt-3 grid gap-3">
                          <input value={draft.couponDescription} onChange={(event) => patchDraft({ couponDescription: event.target.value.slice(0, 160) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Descricao do cupom" style={inputStyle} />
                          <input value={draft.callToAction} onChange={(event) => patchDraft({ callToAction: event.target.value.slice(0, 180) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Chamada que o agente pode usar" style={inputStyle} />
                          <input value={draft.offerNotes} onChange={(event) => patchDraft({ offerNotes: event.target.value.slice(0, 240) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Condicoes comerciais" style={inputStyle} />
                        </div>
                      </Block>

                      <Block icon={SlidersHorizontal} title="Variacoes deste item" tone="violet">
                        {productAttributes.length > 0 ? (
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
                                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition hover:bg-cyan-400/10 hover:text-cyan-100"
                                        style={{
                                          borderColor: checked ? "rgba(34,211,238,0.60)" : "var(--ch-border)",
                                          background: checked ? "rgba(34,211,238,0.15)" : "transparent",
                                          color: checked ? "#cffafe" : "#94a3b8",
                                        }}
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
                        ) : (
                          <>
                            <div className="mb-3 flex flex-wrap gap-2">
                              <button type="button" onClick={addAttribute} className="rounded-lg border px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10" style={{ borderColor: "var(--ch-border)" }}>
                                + variacao
                              </button>
                            </div>
                            <div className="grid gap-3">
                              {attributes.map((attribute, index) => (
                                <div key={`${attribute.id}-${index}`} className="grid gap-2 md:grid-cols-[150px_180px_minmax(0,1fr)_40px]">
                                  <input value={attribute.id} onChange={(event) => updateAttribute(index, { id: slugInput(event.target.value) })} className="h-10 rounded-xl px-3 font-mono text-[12px] outline-none" placeholder="id" style={inputStyle} />
                                  <input value={attribute.name} onChange={(event) => updateAttribute(index, { name: event.target.value.slice(0, 80) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Nome" style={inputStyle} />
                                  <textarea value={attribute.valuesText} onChange={(event) => updateAttribute(index, { valuesText: event.target.value.slice(0, 700) })} className="min-h-10 rounded-xl px-3 py-2 text-[13px] outline-none" placeholder="Um valor por linha" style={inputStyle} />
                                  <button type="button" onClick={() => removeAttribute(index)} className="grid h-10 place-items-center rounded-xl border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100" style={{ borderColor: "var(--ch-border)" }}>
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </Block>

                      <Block icon={PackagePlus} title="Estoque deste item" tone="green">
                        <div className="grid gap-3 md:grid-cols-4">
                          <Field label="Disponibilidade">
                            <select value={draft.inventoryStatus} onChange={(event) => patchDraft({ inventoryStatus: event.target.value as SalesCatalogStockStatus })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="in_stock">Disponivel</option>
                              <option value="out_of_stock">Esgotado</option>
                              <option value="on_backorder">Sob encomenda</option>
                            </select>
                          </Field>
                          <NumberField label="Quantidade" value={draft.stockQuantity} onChange={(value) => patchDraft({ stockQuantity: value })} step="1" allowBlank />
                          <NumberField label="Alerta baixo" value={draft.lowStockThreshold} onChange={(value) => patchDraft({ lowStockThreshold: value })} step="1" allowBlank />
                          <label className="mt-[18px] flex h-10 items-center justify-between rounded-xl px-3 text-[12px]" style={inputStyle}>
                            <span className="flex items-center gap-1.5">
                              Aceita encomenda
                              <HelpHint title="Aceita encomenda">Permite vender mesmo sem estoque imediato, combinando prazo com o cliente.</HelpHint>
                            </span>
                            <input checked={draft.allowBackorder} type="checkbox" onChange={(event) => patchDraft({ allowBackorder: event.target.checked })} />
                          </label>
                        </div>
                        <input value={draft.inventoryNotes} onChange={(event) => patchDraft({ inventoryNotes: event.target.value.slice(0, 240) })} className="mt-3 h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Observacoes de estoque" style={inputStyle} />
                      </Block>

                      <Block icon={Tags} title="SKUs e variacoes vendaveis" tone="violet">
                        <div className="mb-3 flex justify-end">
                          <button type="button" onClick={addSku} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100" style={{ borderColor: "var(--ch-border)" }}>
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar SKU
                          </button>
                        </div>
                        <div className="grid gap-3">
                          {skus.length > 0 ? skus.map((sku, index) => (
                            <div key={`${sku.skuCode}-${index}`} className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
                              <div className="grid gap-2 lg:grid-cols-[150px_minmax(140px,1fr)_minmax(180px,1.2fr)_40px]">
                                <input value={sku.skuCode} onChange={(event) => updateSku(index, { skuCode: cleanCode(event.target.value) })} className="h-10 rounded-xl px-3 font-mono text-[12px] outline-none" placeholder="SKU" style={inputStyle} />
                                <input value={sku.title} onChange={(event) => updateSku(index, { title: event.target.value.slice(0, 120) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Nome interno" style={inputStyle} />
                                <input value={sku.attributesText} onChange={(event) => updateSku(index, { attributesText: event.target.value.slice(0, 220) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Atributo: opcao; atributo: opcao" style={inputStyle} />
                                <button type="button" onClick={() => removeSku(index)} className="grid h-10 place-items-center rounded-xl border text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-100" style={{ borderColor: "var(--ch-border)" }}>
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="mt-2 grid gap-2 md:grid-cols-6">
                                <input value={sku.price} onChange={(event) => updateSku(index, { price: event.target.value.slice(0, 60) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Preco" style={inputStyle} />
                                <input value={sku.salePrice} onChange={(event) => updateSku(index, { salePrice: event.target.value.slice(0, 60) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Oferta" style={inputStyle} />
                                <select value={sku.stockStatus} onChange={(event) => updateSku(index, { stockStatus: event.target.value as SalesCatalogStockStatus })} className="h-10 rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                                  <option value="in_stock">Disponivel</option>
                                  <option value="out_of_stock">Esgotado</option>
                                  <option value="on_backorder">Encomenda</option>
                                </select>
                                <input value={sku.stockQuantity} onChange={(event) => updateSku(index, { stockQuantity: digitsOnly(event.target.value) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Qtd." style={inputStyle} />
                                <input value={sku.weightGrams} onChange={(event) => updateSku(index, { weightGrams: digitsOnly(event.target.value) })} className="h-10 rounded-xl px-3 text-[13px] outline-none" placeholder="Peso g" style={inputStyle} />
                                <select value={sku.status} onChange={(event) => updateSku(index, { status: event.target.value as SalesCatalogSkuStatus })} className="h-10 rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                                  <option value="active">Ativo</option>
                                  <option value="draft">Rascunho</option>
                                </select>
                              </div>
                            </div>
                          )) : (
                            <p className="rounded-xl border border-dashed px-3 py-4 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                              Sem SKUs manuais. Na importacao, o sistema cria um SKU principal automaticamente.
                            </p>
                          )}
                        </div>
                      </Block>

                      <Block icon={Upload} title="Fotos, videos ou arquivos" tone="cyan">
                        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-center text-[12px] text-slate-400 transition hover:border-cyan-300/60 hover:text-cyan-200" style={{ borderColor: "var(--ch-border)" }}>
                          <Upload className="h-4 w-4" />
                          {files.length > 0 ? `${files.length} arquivo(s)` : "Selecionar arquivos"}
                          <input multiple accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,application/json" className="sr-only" type="file" onChange={handleFiles} />
                        </label>
                        {files.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {files.map((file, index) => (
                              <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                                <span className="flex min-w-0 items-center gap-2 text-slate-300">
                                  <FileIcon contentType={file.type} fileName={file.name} />
                                  <span className="truncate">{file.name}</span>
                                </span>
                                <span className="ml-auto shrink-0 font-mono text-slate-500">{formatBytes(file.size)}</span>
                                <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border text-slate-400 hover:bg-rose-400/10 hover:text-rose-100" style={{ borderColor: "var(--ch-border)" }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {editingMedia.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {editingMedia.map((media) => (
                              <div key={media.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                                <span className="flex min-w-0 items-center gap-2 text-slate-300"><MediaIcon media={media} /><span className="truncate">{media.fileName}</span></span>
                                <button type="button" onClick={() => setEditingMedia((current) => current.filter((entry) => entry.id !== media.id))} className="grid h-7 w-7 place-items-center rounded-md border text-slate-400 hover:bg-rose-400/10 hover:text-rose-100" style={{ borderColor: "var(--ch-border)" }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </Block>

                      <Block icon={CheckCircle2} title="Agente e venda" tone="cyan">
                        <Field label="Tag">
                          <input value={draft.agentTag} onChange={(event) => patchDraft({ agentTag: event.target.value.slice(0, 120) })} className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none" placeholder="Automatico se vazio" style={inputStyle} />
                        </Field>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <Field label="Prompt do agente">
                            <textarea value={draft.agentPrompt} onChange={(event) => patchDraft({ agentPrompt: event.target.value.slice(0, 1200) })} className="min-h-24 w-full resize-y rounded-xl px-3 py-3 text-[13px] leading-5 outline-none" style={inputStyle} />
                          </Field>
                          <Field label="Notas internas de venda">
                            <textarea value={draft.salesNotes} onChange={(event) => patchDraft({ salesNotes: event.target.value.slice(0, 1200) })} className="min-h-24 w-full resize-y rounded-xl px-3 py-3 text-[13px] leading-5 outline-none" style={inputStyle} />
                          </Field>
                        </div>
                      </Block>
                    </>
                  ) : null}

                  {activeTab === "products" ? (
                    <Block icon={Truck} title="Entrega deste item" tone="green">
                      <div className="grid gap-3 md:grid-cols-4">
                        <Field label="Tipo">
                          <select value={draft.fulfillmentMode} onChange={(event) => patchDraft({ fulfillmentMode: event.target.value as SalesCatalogFulfillmentMode })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                            <option value="physical">Produto fisico</option>
                            <option value="digital">Digital no WhatsApp</option>
                            <option value="service">Servico</option>
                            <option value="subscription">Assinatura</option>
                          </select>
                        </Field>
                        <Field label="Prazo/duracao"><input value={draft.serviceDuration} onChange={(event) => patchDraft({ serviceDuration: event.target.value.slice(0, 80) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle} /></Field>
                        <NumberField label="Peso g" value={draft.weightGrams} onChange={(value) => patchDraft({ weightGrams: value })} step="1" allowBlank />
                        <Field label="Frete">
                          <select value={draft.shippingProfile} onChange={(event) => patchDraft({ shippingProfile: event.target.value as SalesCatalogShippingProfile })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                            <option value="default">Tabela por estado</option>
                            <option value="free">Frete gratis</option>
                            <option value="custom">Combinar</option>
                          </select>
                        </Field>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <NumberField label="Comprimento cm" value={draft.lengthCm} onChange={(value) => patchDraft({ lengthCm: value })} step="0.01" allowBlank />
                        <NumberField label="Largura cm" value={draft.widthCm} onChange={(value) => patchDraft({ widthCm: value })} step="0.01" allowBlank />
                        <NumberField label="Altura cm" value={draft.heightCm} onChange={(value) => patchDraft({ heightCm: value })} step="0.01" allowBlank />
                      </div>
                      <div className="mt-3 grid gap-3">
                        <label className="flex h-10 items-center justify-between rounded-xl px-3 text-[12px]" style={inputStyle}>
                          <span className="flex items-center gap-1.5">
                            Precisa agendar
                            <HelpHint title="Precisa agendar">Ative para servicos ou entregas que exigem confirmacao de data e horario.</HelpHint>
                          </span>
                          <input checked={draft.schedulingRequired} type="checkbox" onChange={(event) => patchDraft({ schedulingRequired: event.target.checked })} />
                        </label>
                        <input value={draft.accessInstructions} onChange={(event) => patchDraft({ accessInstructions: event.target.value.slice(0, 240) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Acesso/execucao" style={inputStyle} />
                        <input value={draft.deliveryInstructions} onChange={(event) => patchDraft({ deliveryInstructions: event.target.value.slice(0, 240) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Instrucao de entrega" style={inputStyle} />
                        <input value={draft.shippingNotes} onChange={(event) => patchDraft({ shippingNotes: event.target.value.slice(0, 240) })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" placeholder="Observacao de frete" style={inputStyle} />
                      </div>
                    </Block>
                  ) : null}

                  {activeTab === "products" ? (
                    <>
                      <Block id="platform-products-tour-marketplace" icon={PackagePlus} title="Produto no marketplace" tone="cyan">
                        <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_170px]">
                          <Field label="Codigo">
                            <input value={draft.productCode} onChange={(event) => patchDraft({ productCode: cleanCode(event.target.value) })} className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none" placeholder="Automatico se vazio" style={inputStyle} />
                          </Field>
                          <Field label="Slug">
                            <input value={draft.slug} onChange={(event) => patchDraft({ slug: slugInput(event.target.value) })} className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none" placeholder="Automatico se vazio" style={inputStyle} />
                          </Field>
                          <Field label="Status">
                            <select value={draft.status} onChange={(event) => patchDraft({ status: event.target.value as PlatformProductStatus })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="draft">Rascunho</option>
                              <option value="active">Ativo</option>
                              <option value="paused">Pausado</option>
                              <option value="archived">Arquivado</option>
                            </select>
                          </Field>
                          <Field label="Vitrine usuario">
                            <select value={draft.marketplaceStatus} onChange={(event) => patchDraft({ marketplaceStatus: event.target.value as PlatformProductMarketplaceStatus })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="hidden">Oculto</option>
                              <option value="visible">Visivel</option>
                              <option value="featured">Destaque</option>
                            </select>
                          </Field>
                        </div>
                      </Block>

                      <Block id="platform-products-tour-revenue" icon={ShoppingBag} title="Origem e recebimento" tone="amber">
                        <div className="grid gap-3 md:grid-cols-5">
                          <Field label="Dono do produto">
                            <select value={draft.ownerType} onChange={(event) => patchDraft({ ownerType: event.target.value as PlatformProductOwnerType })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="connectyhub">ConnectyHub</option>
                              <option value="external_provider">Fornecedor externo</option>
                            </select>
                          </Field>
                          <Field label="Tipo de venda">
                            <select
                              value={draft.salesChannelType}
                              onChange={(event) => {
                                const value = event.target.value as PlatformProductSalesChannelType;
                                patchDraft(value === "direct"
                                  ? {
                                      salesChannelType: value,
                                      revenueOwnerType: "connectyhub",
                                      commissionPolicyType: "none",
                                      payoutTargetType: "connectyhub",
                                      commissionPercentage: "0",
                                      marketplaceStatus: "hidden",
                                    }
                                  : {
                                      salesChannelType: value,
                                      revenueOwnerType: "connectyhub",
                                      commissionPolicyType: draft.commissionPolicyType === "none" ? "percentage" : draft.commissionPolicyType,
                                      payoutTargetType: "connectyhub",
                                    });
                              }}
                              className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                              style={inputStyle}
                            >
                              <option value="resale">Revenda com comissao</option>
                              <option value="direct">Venda direta ConnectyHub</option>
                              <option value="affiliate">Afiliado</option>
                              <option value="marketplace">Marketplace</option>
                            </select>
                          </Field>
                          <Field label="Receita">
                            <select value={draft.revenueOwnerType} onChange={(event) => patchDraft({ revenueOwnerType: event.target.value as PlatformProductRevenueOwnerType })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="connectyhub">ConnectyHub</option>
                              <option value="split">Split futuro</option>
                              <option value="external_provider">Fornecedor</option>
                            </select>
                          </Field>
                          <Field label="Comissao">
                            <select value={draft.commissionPolicyType} onChange={(event) => patchDraft({ commissionPolicyType: event.target.value as PlatformProductCommissionPolicyType })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="percentage">Percentual</option>
                              <option value="none">Sem comissao</option>
                              <option value="fixed">Valor fixo futuro</option>
                              <option value="custom">Personalizada</option>
                            </select>
                          </Field>
                          <Field label="Repasse para">
                            <select value={draft.payoutTargetType} onChange={(event) => patchDraft({ payoutTargetType: event.target.value as PlatformProductPayoutTargetType })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="connectyhub">ConnectyHub</option>
                              <option value="split">Split futuro</option>
                              <option value="external_provider">Fornecedor</option>
                            </select>
                          </Field>
                        </div>
                        <p className="mt-3 text-[11px] leading-5 text-slate-500">
                          Revenda aparece para importacao no painel do usuario. Venda direta e produto nosso vendido sem repasse de afiliado.
                        </p>
                      </Block>

                      <Block id="platform-products-tour-commission" icon={BadgePercent} title="Regra de comissao" tone="violet">
                        <div className="grid gap-3 md:grid-cols-5">
                          <NumberField label="% comissao" value={draft.commissionPercentage} onChange={(value) => patchDraft({ commissionPercentage: value })} step="0.01" />
                          <Field label="Base">
                            <select value={draft.commissionBase} onChange={(event) => patchDraft({ commissionBase: event.target.value as "gross" | "net" })} className="h-10 w-full rounded-xl px-3 text-[13px] outline-none" style={inputStyle}>
                              <option value="gross">Bruto</option>
                              <option value="net">Liquido</option>
                            </select>
                          </Field>
                          <NumberField label="Repasse dias" value={draft.commissionReleaseDays} onChange={(value) => patchDraft({ commissionReleaseDays: value })} step="1" />
                          <NumberField label="Recorrencia meses" value={draft.recurringCommissionMonths} onChange={(value) => patchDraft({ recurringCommissionMonths: value })} step="1" />
                          <NumberField label="Garantia dias" value={draft.refundWindowDays} onChange={(value) => patchDraft({ refundWindowDays: value })} step="1" />
                        </div>
                      </Block>
                    </>
                  ) : null}

                  {activeTab === "setup" ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <button disabled={savingSettings} type="button" onClick={saveSettings} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[12px] font-bold transition disabled:opacity-50" style={{ background: "var(--ch-accent)", color: "#061015" }}>
                        {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingSettings ? "Salvando" : "Salvar configuracao"}
                      </button>
                    </div>
                  ) : null}

                  {activeTab === "products" ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <button disabled={saving || !draft.name.trim()} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[12px] font-bold transition disabled:opacity-50" style={{ background: "var(--ch-accent)", color: "#061015" }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? "Salvando" : "Salvar produto"}
                      </button>
                      <button type="button" onClick={resetForm} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold transition hover:opacity-90" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}>
                        <Plus className="h-4 w-4" />
                        Novo
                      </button>
                    </div>
                  ) : null}
                </form>
              </Panel>

              <div className="space-y-5">
                <Panel title="Produtos cadastrados" eyebrow="vitrine / importacao" tone="green" compact>
                  <div className="grid gap-3">
                    {products.length > 0 ? products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        imports={catalog.imports.filter((item) => item.platformProductId === product.id).length}
                        confirmDelete={confirmDeleteProductId === product.id}
                        deleting={deletingProductId === product.id}
                        publishing={publishingProductId === product.id}
                        onCopy={() => copyText(product.agentTag)}
                        onDelete={() => deleteProduct(product)}
                        onEdit={() => editProduct(product)}
                        onPublish={() => publishProduct(product)}
                      />
                    )) : (
                      <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                        Nenhum produto ConnectyHub cadastrado ainda.
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </div>
      )}
    </ConnectyShell>
  );

  function patchDraft(patch: Partial<ProductDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateSettingsAttribute(attributeId: string, patch: Partial<SalesCatalogAttribute>) {
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

  function addSettingsAttribute() {
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

  function removeSettingsAttribute(attributeId: string) {
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

  function toggleSelectedAttribute(attribute: SalesCatalogAttribute, value: string) {
    setSelectedAttributes((current) => {
      const currentValues = current[attribute.id] ?? [];
      const exists = currentValues.includes(value);
      const nextValues = exists
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...current,
        [attribute.id]: nextValues,
      };
    });
  }

  function addAttribute() {
    setAttributes((current) => [...current, { id: "", name: "", valuesText: "" }]);
  }

  function updateAttribute(index: number, patch: Partial<AttributeDraft>) {
    setAttributes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function removeAttribute(index: number) {
    setAttributes((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addSku() {
    setSkus((current) => [...current, {
      skuCode: "",
      title: "",
      attributesText: formatItemAttributes(getCurrentItemAttributes()),
      price: "",
      salePrice: "",
      stockStatus: "in_stock",
      stockQuantity: "",
      lowStockThreshold: "",
      weightGrams: "",
      status: "active",
    }]);
  }

  function updateSku(index: number, patch: Partial<SkuDraft>) {
    setSkus((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function removeSku(index: number) {
    setSkus((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }
}

function ProductCard({
  product,
  imports,
  confirmDelete,
  deleting,
  publishing,
  onCopy,
  onDelete,
  onEdit,
  onPublish,
}: {
  product: PlatformProduct;
  imports: number;
  confirmDelete: boolean;
  deleting: boolean;
  publishing: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onPublish: () => void;
}) {
  const cover = product.media.find((media) => media.kind === "image");
  const isVisibleToClients = product.status === "active" && product.marketplaceStatus !== "hidden" && product.salesChannelType !== "direct";

  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[96px_minmax(0,1fr)]" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg border" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
        {cover ? <Image alt={product.name} className="object-cover" fill sizes="96px" src={cover.storageUrl} unoptimized /> : <PackagePlus className="h-8 w-8 text-slate-600" />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-slate-100">{product.name}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>{product.productCode}</span>
              {product.category ? <span>{product.category}</span> : null}
              {product.offer.salePrice ? <span>Oferta {product.offer.salePrice}</span> : product.price ? <span>{product.price}</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <StatusBadge status={product.status === "active" ? "online" : product.status === "draft" ? "warning" : "idle"} label={product.status} />
            <NeonBadge tone={product.marketplaceStatus === "featured" ? "amber" : product.marketplaceStatus === "visible" ? "cyan" : "zinc"}>{product.marketplaceStatus}</NeonBadge>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{product.shortDescription || product.commercialDescription}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <MiniTag icon={ShoppingBag}>{formatSalesChannel(product.salesChannelType)}</MiniTag>
          <MiniTag icon={BadgePercent}>{product.commissionPolicyType === "none" ? "sem comissao" : `${product.commissionPercentage}%`}</MiniTag>
          <MiniTag icon={Truck}>{product.shipping.profile === "free" ? "frete gratis" : product.shipping.profile === "custom" ? "frete combinado" : "tabela por estado"}</MiniTag>
          <MiniTag icon={Tags}>{product.skus.length || 1} SKU</MiniTag>
          <MiniTag icon={PackagePlus}>{imports} import.</MiniTag>
          {product.media.length > 0 ? <MiniTag icon={Upload}>{product.media.length} arq.</MiniTag> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!isVisibleToClients && product.salesChannelType !== "direct" ? (
            <button type="button" disabled={publishing} onClick={onPublish} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10 disabled:opacity-50" style={{ borderColor: "var(--ch-border)" }}>
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Publicar
            </button>
          ) : null}
          <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10" style={{ borderColor: "var(--ch-border)" }}>
            <Save className="h-3.5 w-3.5" />
            Editar
          </button>
          <button type="button" onClick={onCopy} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100" style={{ borderColor: "var(--ch-border)" }}>
            <Copy className="h-3.5 w-3.5" />
            Copiar tag
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60",
              confirmDelete
                ? "border-rose-400/45 bg-rose-400/15 text-rose-100"
                : "border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15",
            )}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {confirmDelete ? "Confirmar excluir" : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommissionCard({
  commission,
  product,
  loading,
  onStatus,
}: {
  commission: PlatformProductCommission;
  product: PlatformProduct | null;
  loading: boolean;
  onStatus: (status: PlatformProductCommissionStatus) => void;
}) {
  const title = readString(commission.metadata.product_name) ?? product?.name ?? "Produto ConnectyHub";
  const payoutReference = readString(commission.metadata.payout_reference)
    ?? readString(readMetadataRecord(commission.metadata.last_status_update).payout_reference);
  const payoutNote = readString(commission.metadata.payout_note)
    ?? readString(readMetadataRecord(commission.metadata.last_status_update).payout_note);

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {commission.organizationId.slice(0, 8)} - {commission.saleQuantity} un. - venda {formatMoney(commission.saleAmount)}
          </p>
        </div>
        <NeonBadge tone={commissionStatusTone(commission.status)}>{formatCommissionStatus(commission.status)}</NeonBadge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniValue label="Comissao" value={formatMoney(commission.commissionAmount)} />
        <MiniValue label="Percentual" value={`${commission.commissionPercentage}%`} />
        <MiniValue label="Libera em" value={formatDate(commission.releaseAt)} />
      </div>

      {commission.paidAt || payoutReference || payoutNote ? (
        <div className="mt-3 rounded-lg border px-3 py-2 text-[11px] leading-5 text-slate-400" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
          {commission.paidAt ? <p>Pago em {formatDate(commission.paidAt)}</p> : null}
          {payoutReference ? <p>Referencia: {payoutReference}</p> : null}
          {payoutNote ? <p>Obs.: {payoutNote}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {commission.status === "pending" ? (
          <button type="button" disabled={loading} onClick={() => onStatus("available")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10 disabled:opacity-50" style={{ borderColor: "var(--ch-border)" }}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Liberar
          </button>
        ) : null}
        {commission.status === "pending" || commission.status === "available" ? (
          <button type="button" disabled={loading} onClick={() => onStatus("paid")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10 disabled:opacity-50" style={{ borderColor: "var(--ch-border)" }}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Pago
          </button>
        ) : null}
        {commission.status === "pending" || commission.status === "available" ? (
          <button type="button" disabled={loading} onClick={() => onStatus("blocked")} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-100 transition hover:bg-amber-400/10 disabled:opacity-50" style={{ borderColor: "var(--ch-border)" }}>
            Bloquear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SettlementMetric({ label, value, detail, tone = "cyan" }: { label: string; value: string; detail: string; tone?: PlatformUiTone }) {
  const toneStyle = platformUiToneStyles[tone];

  return (
    <div
      className="rounded-xl border px-3 py-3"
      style={{
        borderColor: `rgba(${toneStyle.rgb},0.34)`,
        background: `linear-gradient(135deg, rgba(${toneStyle.rgb},0.11), rgba(255,255,255,0.020)), var(--ch-panel)`,
      }}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cn("mt-2 truncate font-mono text-[18px] font-bold", toneStyle.text)}>{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone = "cyan" }: { icon: LucideIcon; label: string; value: string; detail: string; tone?: PlatformUiTone }) {
  const toneStyle = platformUiToneStyles[tone];

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: `linear-gradient(135deg, rgba(${toneStyle.rgb},0.13), rgba(255,255,255,0.025)), var(--ch-surface)`,
        border: `1px solid rgba(${toneStyle.rgb},0.34)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.055), 0 12px 28px rgba(${toneStyle.rgb},0.045)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `rgba(${toneStyle.rgb},0.14)`, color: toneStyle.fill }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={cn("mt-4 font-mono text-[26px] font-bold leading-none", toneStyle.text)}>{value}</p>
      <p className="mt-3 text-[12px] text-slate-500">{detail}</p>
    </div>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[12px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  const helpText = help ?? platformProductHelpText[label];

  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
        {label}
        {helpText ? <HelpHint title={label}>{helpText}</HelpHint> : null}
      </span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange, step, allowBlank = false, help }: { label: string; value: string; onChange: (value: string) => void; step: string; allowBlank?: boolean; help?: string }) {
  return (
    <Field label={label} help={help}>
      <input type="number" min="0" step={step} value={value} onChange={(event) => onChange(allowBlank && event.target.value === "" ? "" : event.target.value)} className="h-10 w-full rounded-xl px-3 font-mono text-[13px] outline-none" style={inputStyle} />
    </Field>
  );
}

function Block({
  icon: Icon,
  title,
  children,
  id,
  help,
  defaultOpen = false,
  tone = "cyan",
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  id?: string;
  help?: string;
  defaultOpen?: boolean;
  tone?: PlatformUiTone;
}) {
  const helpText = help ?? platformProductHelpText[title];
  const [open, setOpen] = useState(defaultOpen);
  const toneStyle = platformUiToneStyles[tone];

  return (
    <section
      id={id}
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: `rgba(${toneStyle.rgb},0.34)`,
        background: `linear-gradient(180deg, rgba(${toneStyle.rgb},0.070), rgba(255,255,255,0.020)), var(--ch-surface-2)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.050), 0 14px 34px rgba(${toneStyle.rgb},0.045)`,
      }}
    >
      <div className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
            style={{ borderColor: `rgba(${toneStyle.rgb},0.30)`, background: `rgba(${toneStyle.rgb},0.12)`, color: toneStyle.fill }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
            <span className="truncate">{title}</span>
            {helpText ? <HelpHint title={title}>{helpText}</HelpHint> : null}
          </span>
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition hover:bg-white/[0.035]"
          style={{ borderColor: `rgba(${toneStyle.rgb},0.30)`, background: `rgba(${toneStyle.rgb},0.08)` }}
        >
          <ChevronDown className={cn("h-4 w-4 transition", open ? "rotate-180" : "", toneStyle.label)} />
        </button>
      </div>
      {open ? (
        <div className="border-t p-3" style={{ borderColor: `rgba(${toneStyle.rgb},0.22)` }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function CatalogTabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-[12px] font-bold transition hover:bg-cyan-400/10"
      style={{
        background: active ? "rgba(34,211,238,0.14)" : "rgba(15,23,42,0.36)",
        borderColor: active ? "rgba(34,211,238,0.75)" : "var(--ch-border)",
        color: active ? "#cffafe" : "var(--ch-text)",
      }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MiniTag({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{children}</span>
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

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function buildSettingsDraft(settings: PlatformProductSettings): SettingsDraft {
  return {
    businessType: settings.businessType ?? "simple",
    categoriesText: settings.categories.join("\n"),
    attributes: cloneAttributes(settings.attributes),
    trackInventory: settings.trackInventory ?? false,
    variationMedia: settings.variationMedia ?? false,
  };
}

function cloneAttributes(attributes: SalesCatalogAttribute[]) {
  return attributes.map((attribute) => ({
    ...attribute,
    values: [...attribute.values],
  }));
}

function getCategoryRows(value: string) {
  const rows = value.split("\n").map((row) => row.replace(/\s+/g, " ").trim());
  return rows.length > 0 ? rows : [""];
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

function formatItemAttributes(attributes: SalesCatalogItemAttribute[]) {
  return attributes
    .filter((attribute) => attribute.values.length > 0)
    .map((attribute) => `${attribute.name}: ${attribute.values.join(", ")}`)
    .join("; ");
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

function createDraft(product: PlatformProduct | null): ProductDraft {
  if (!product) return { ...emptyDraft };

  return {
    productId: product.id,
    name: product.name,
    productCode: product.productCode,
    slug: product.slug,
    shortDescription: product.shortDescription ?? "",
    commercialDescription: product.commercialDescription,
    category: product.category ?? "",
    price: product.price ?? "",
    currency: product.currency,
    status: product.status,
    marketplaceStatus: product.marketplaceStatus,
    ownerType: product.ownerType,
    salesChannelType: product.salesChannelType,
    revenueOwnerType: product.revenueOwnerType,
    commissionPolicyType: product.commissionPolicyType,
    payoutTargetType: product.payoutTargetType,
    commissionPercentage: String(product.commissionPercentage),
    commissionBase: product.commissionBase,
    commissionReleaseDays: String(product.commissionReleaseDays),
    recurringCommissionMonths: String(product.recurringCommissionMonths),
    refundWindowDays: String(product.refundWindowDays),
    salePrice: product.offer.salePrice ?? "",
    saleStartsAt: product.offer.saleStartsAt ?? "",
    saleEndsAt: product.offer.saleEndsAt ?? "",
    couponCode: product.offer.couponCode ?? "",
    couponDescription: product.offer.couponDescription ?? "",
    callToAction: product.offer.callToAction ?? "",
    offerNotes: product.offer.notes ?? "",
    inventoryStatus: product.inventory.status,
    stockQuantity: product.inventory.quantity !== null ? String(product.inventory.quantity) : "",
    lowStockThreshold: product.inventory.lowStockThreshold !== null ? String(product.inventory.lowStockThreshold) : "",
    allowBackorder: product.inventory.allowBackorder,
    inventoryNotes: product.inventory.notes ?? "",
    fulfillmentMode: product.fulfillment.mode,
    schedulingRequired: product.fulfillment.schedulingRequired,
    serviceDuration: product.fulfillment.serviceDuration ?? "",
    deliveryInstructions: product.fulfillment.deliveryInstructions ?? "",
    accessInstructions: product.fulfillment.accessInstructions ?? "",
    weightGrams: product.shipping.weightGrams !== null ? String(product.shipping.weightGrams) : "",
    lengthCm: product.shipping.dimensions.lengthCm !== null ? String(product.shipping.dimensions.lengthCm) : "",
    widthCm: product.shipping.dimensions.widthCm !== null ? String(product.shipping.dimensions.widthCm) : "",
    heightCm: product.shipping.dimensions.heightCm !== null ? String(product.shipping.dimensions.heightCm) : "",
    shippingProfile: product.shipping.profile,
    shippingNotes: product.shipping.notes ?? "",
    agentTag: product.agentTag,
    agentPrompt: product.agentPrompt ?? "",
    salesNotes: product.salesNotes ?? "",
  };
}

function productAttributesToDrafts(product: PlatformProduct): AttributeDraft[] {
  return product.attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    valuesText: attribute.values.join("\n"),
  }));
}

function productSkusToDrafts(product: PlatformProduct): SkuDraft[] {
  return product.skus.map((sku) => ({
    skuCode: sku.skuCode,
    title: sku.title ?? "",
    attributesText: sku.attributes.map((attribute) => `${attribute.name}: ${attribute.values.join(", ")}`).join("; "),
    price: sku.price ?? "",
    salePrice: sku.salePrice ?? "",
    stockStatus: sku.stockStatus,
    stockQuantity: sku.stockQuantity !== null ? String(sku.stockQuantity) : "",
    lowStockThreshold: sku.lowStockThreshold !== null ? String(sku.lowStockThreshold) : "",
    weightGrams: sku.weightGrams !== null ? String(sku.weightGrams) : "",
    status: sku.status,
  }));
}

function buildProductFormData({
  attributes,
  draft,
  files = [],
  keepMediaIds,
  skus,
}: {
  attributes: SalesCatalogItemAttribute[];
  draft: ProductDraft;
  files?: File[];
  keepMediaIds: string[];
  skus: SkuDraft[];
}) {
  const formData = new FormData();
  const attributesPayload = attributes;
  const skusPayload = skusToPayload(skus, draft, attributesPayload);

  for (const [key, value] of Object.entries(draft)) {
    formData.set(key, typeof value === "boolean" ? String(value) : value);
  }

  formData.set("attributes", JSON.stringify(attributesPayload));
  formData.set("skus", JSON.stringify(skusPayload));
  formData.set("keepMediaIds", JSON.stringify(keepMediaIds));

  for (const file of files) {
    formData.append("files", file);
  }

  return formData;
}

function attributesToPayload(attributes: AttributeDraft[]): SalesCatalogItemAttribute[] {
  return attributes
    .map((attribute) => ({
      id: slugInput(attribute.id || attribute.name),
      name: attribute.name.trim(),
      values: attribute.valuesText.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
    }))
    .filter((attribute) => attribute.id && attribute.name && attribute.values.length > 0);
}

function skusToPayload(skus: SkuDraft[], draft: ProductDraft, attributes: SalesCatalogItemAttribute[]) {
  return skus
    .map((sku) => ({
      skuCode: cleanCode(sku.skuCode),
      title: sku.title.trim(),
      attributes: parseSkuAttributes(sku.attributesText, attributes),
      price: sku.price || draft.price,
      salePrice: sku.salePrice || draft.salePrice,
      currency: draft.currency,
      stockStatus: sku.stockStatus,
      stockQuantity: numberOrNull(sku.stockQuantity),
      lowStockThreshold: numberOrNull(sku.lowStockThreshold),
      weightGrams: numberOrNull(sku.weightGrams) ?? numberOrNull(draft.weightGrams),
      dimensions: {
        lengthCm: numberOrNull(draft.lengthCm),
        widthCm: numberOrNull(draft.widthCm),
        heightCm: numberOrNull(draft.heightCm),
      },
      mediaIds: [],
      status: sku.status,
    }))
    .filter((sku) => sku.skuCode);
}

function parseSkuAttributes(value: string, fallback: SalesCatalogItemAttribute[]) {
  if (!value.trim()) return fallback;

  return value
    .split(";")
    .map((part) => {
      const [name, values] = part.split(":");
      if (!name || !values) return null;
      return {
        id: slugInput(name),
        name: name.trim(),
        values: values.split(",").map((item) => item.trim()).filter(Boolean),
      };
    })
    .filter((item): item is { id: string; name: string; values: string[] } => Boolean(item && item.id && item.name && item.values.length > 0));
}

function buildMetrics(products: PlatformProduct[], imports: number, commissions: PlatformProductCommission[]) {
  const active = products.filter((product) => product.status === "active");
  const available = active.filter((product) => product.marketplaceStatus !== "hidden").length;
  const resale = active.filter((product) => product.salesChannelType !== "direct" && product.marketplaceStatus !== "hidden").length;
  const direct = active.filter((product) => product.salesChannelType === "direct").length;
  const featured = active.filter((product) => product.marketplaceStatus === "featured").length;
  const commissionable = active.filter((product) => product.commissionPolicyType !== "none" && product.commissionPercentage > 0);
  const averageCommission = commissionable.length > 0
    ? (commissionable.reduce((total, product) => total + product.commissionPercentage, 0) / commissionable.length).toFixed(1)
    : "0";
  const pendingCommissions = commissions.filter((commission) => commission.status === "pending").length;
  const payableCommission = commissions
    .filter((commission) => commission.status === "pending" || commission.status === "available")
    .reduce((total, commission) => total + commission.commissionAmount, 0);

  return { active: active.length, available, resale, direct, featured, imports, commissionable: commissionable.length, averageCommission, pendingCommissions, payableCommission };
}

function buildCommissionSummary(commissions: PlatformProductCommission[]) {
  const summary = {
    totalCount: commissions.length,
    totalAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    availableCount: 0,
    availableAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    blockedCount: 0,
    blockedAmount: 0,
  };

  for (const commission of commissions) {
    summary.totalAmount += commission.commissionAmount;

    if (commission.status === "pending") {
      summary.pendingCount += 1;
      summary.pendingAmount += commission.commissionAmount;
    }

    if (commission.status === "available") {
      summary.availableCount += 1;
      summary.availableAmount += commission.commissionAmount;
    }

    if (commission.status === "paid") {
      summary.paidCount += 1;
      summary.paidAmount += commission.commissionAmount;
    }

    if (commission.status === "blocked" || commission.status === "cancelled" || commission.status === "refunded") {
      summary.blockedCount += 1;
      summary.blockedAmount += commission.commissionAmount;
    }
  }

  return summary;
}

function mergeCommissions(current: PlatformProductCommission[], updated: PlatformProductCommission[]) {
  const updatedById = new Map(updated.map((commission) => [commission.id, commission]));
  const merged = current.map((commission) => updatedById.get(commission.id) ?? commission);
  const existingIds = new Set(merged.map((commission) => commission.id));

  for (const commission of updated) {
    if (!existingIds.has(commission.id)) {
      merged.unshift(commission);
    }
  }

  return merged.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function upsertProduct(products: PlatformProduct[], product: PlatformProduct) {
  const exists = products.some((item) => item.id === product.id);
  const next = exists ? products.map((item) => item.id === product.id ? product : item) : [product, ...products];
  return next.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function slugInput(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "").slice(0, 8);
}

function numberOrNull(value: string) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(time));
}

function formatCommissionStatus(status: PlatformProductCommissionStatus) {
  const labels: Record<PlatformProductCommissionStatus, string> = {
    pending: "pendente",
    available: "liberada",
    paid: "paga",
    cancelled: "cancelada",
    blocked: "bloqueada",
    refunded: "estornada",
  };

  return labels[status];
}

function formatSalesChannel(value: PlatformProductSalesChannelType) {
  if (value === "direct") return "venda direta";
  if (value === "affiliate") return "afiliado";
  if (value === "marketplace") return "marketplace";
  return "revenda";
}

function commissionStatusTone(status: PlatformProductCommissionStatus): "cyan" | "green" | "amber" | "rose" | "zinc" {
  if (status === "available") return "green";
  if (status === "paid") return "cyan";
  if (status === "pending") return "amber";
  if (status === "cancelled" || status === "refunded") return "rose";
  return "zinc";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
