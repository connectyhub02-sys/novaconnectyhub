"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  CloudDownload,
  Copy,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Tags,
  Trash2,
  Truck,
  Upload,
  Video,
  X,
} from "lucide-react";
import { NeonBadge, PageHeader, Panel } from "./panel-primitives";
import type { ClientCompany } from "@/lib/client-os/companies";
import {
  brazilianStates,
  defaultSalesCatalogShippingRules,
  formatSalesCatalogWeight,
  salesCatalogBusinessTemplates,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogShippingSettings,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogItemAttribute,
  type SalesCatalogItemStatus,
  type SalesCatalogMedia,
  type SalesCatalogShippingQuote,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
} from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type SalesCatalogConsoleProps = {
  initialCompanies: ClientCompany[];
  initialItems: ClientSalesCatalogItem[];
  initialSettings: ClientSalesCatalogSettings[];
  initialShippingSettings: ClientSalesCatalogShippingSettings[];
  initialCompanyId: string | null;
};

type CatalogTab = "setup" | "shipping" | "products" | "whatsapp";

type SettingsDraft = {
  businessType: SalesCatalogBusinessType;
  categoriesText: string;
  attributes: SalesCatalogAttribute[];
  trackInventory: boolean;
  variationMedia: boolean;
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

const statusOptions: Array<{ value: SalesCatalogItemStatus; label: string }> = [
  { value: "active", label: "Ativo" },
  { value: "draft", label: "Rascunho" },
];

export function SalesCatalogConsole({
  initialCompanies,
  initialItems,
  initialSettings,
  initialShippingSettings,
  initialCompanyId,
}: SalesCatalogConsoleProps) {
  const initialSelectedCompanyId = initialCompanyId ?? initialCompanies[0]?.id ?? "";
  const initialSelectedSettings = initialSettings.find((settings) => settings.companyId === initialSelectedCompanyId) ?? null;
  const initialSelectedShippingSettings = initialShippingSettings.find((settings) => settings.companyId === initialSelectedCompanyId) ?? null;
  const [companies] = useState(initialCompanies);
  const [items, setItems] = useState(initialItems);
  const [settings, setSettings] = useState(initialSettings);
  const [shippingSettings, setShippingSettings] = useState(initialShippingSettings);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialSelectedCompanyId);
  const [activeTab, setActiveTab] = useState<CatalogTab>(initialSelectedSettings?.configured ? "products" : "setup");
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
  const [status, setStatus] = useState<SalesCatalogItemStatus>("active");
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string[]>>({});
  const [weightGrams, setWeightGrams] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [shippingProfile, setShippingProfile] = useState<SalesCatalogShippingProfile>("default");
  const [shippingNotes, setShippingNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [catalogJid, setCatalogJid] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [visibilityId, setVisibilityId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => !selectedCompanyId || item.companyId === selectedCompanyId),
    [items, selectedCompanyId],
  );
  const stats = useMemo(() => {
    const active = visibleItems.filter((item) => item.status === "active").length;
    const ready = visibleItems.filter((item) => item.readiness === "ready").length;
    const media = visibleItems.reduce((total, item) => total + item.media.length, 0);
    const whatsapp = visibleItems.filter((item) => item.source === "whatsapp_catalog").length;

    return { active, ready, media, whatsapp };
  }, [visibleItems]);
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
  const currentBusinessTemplate = salesCatalogBusinessTemplates.find((template) => template.value === settingsDraft.businessType) ?? salesCatalogBusinessTemplates[0];
  const categoryPresetOptions = currentBusinessTemplate.categories.filter((categoryName) => (
    !parseLines(settingsDraft.categoriesText).some((current) => current.toLowerCase() === categoryName.toLowerCase())
  ));
  const attributePresetOptions = buildAttributePresetOptions(settingsDraft.attributes);
  const categoryOptions = selectedSettings?.configured ? selectedSettings.categories : parseLines(settingsDraft.categoriesText);
  const selectedShippingRule = shippingDraft.rules.find((rule) => rule.uf === selectedShippingUf) ?? shippingDraft.rules[0] ?? null;
  const canCreate = Boolean(selectedCompanyId && title.trim() && description.trim() && !creating);
  const canCalculateQuote = Boolean(selectedCompanyId && quoteItemId && cleanCep(quoteCep) && !calculatingQuote);

  function changeCompany(companyId: string) {
    const nextSettings = settings.find((entry) => entry.companyId === companyId) ?? null;
    const nextShippingSettings = shippingSettings.find((entry) => entry.companyId === companyId) ?? null;
    setSelectedCompanyId(companyId);
    setSettingsDraft(buildSettingsDraft(nextSettings));
    setShippingDraft(buildShippingDraft(nextShippingSettings));
    setSelectedShippingUf(nextShippingSettings?.rules.find((rule) => rule.active)?.uf ?? "SP");
    setSelectedAttributes({});
    setQuoteItemId("");
    setQuoteCep("");
    setQuoteResult(null);
    if (!nextSettings?.configured) {
      setActiveTab("setup");
    }
  }

  function applyBusinessTemplate(value: SalesCatalogBusinessType) {
    const template = salesCatalogBusinessTemplates.find((item) => item.value === value) ?? salesCatalogBusinessTemplates[salesCatalogBusinessTemplates.length - 1];
    setSettingsDraft({
      businessType: template.value,
      categoriesText: template.categories.join("\n"),
      attributes: cloneAttributes(template.attributes),
      trackInventory: template.trackInventory,
      variationMedia: template.variationMedia,
    });
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

  function addAttributePreset(attribute: SalesCatalogAttribute) {
    setSettingsDraft((current) => ({
      ...current,
      attributes: [
        ...current.attributes,
        {
          ...attribute,
          id: createUniqueAttributeId(attribute.name, current.attributes),
          values: [...attribute.values],
        },
      ],
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

    setCreating(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("companyId", selectedCompanyId);
      formData.set("title", title);
      formData.set("description", description);
      formData.set("category", category);
      formData.set("price", price);
      formData.set("currency", "BRL");
      formData.set("status", status);
      formData.set("attributes", JSON.stringify(buildSelectedItemAttributes(productAttributes, selectedAttributes)));
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
        throw new Error(data?.error ?? "Nao foi possivel cadastrar o item.");
      }

      setItems((current) => [data.item!, ...current.filter((item) => item.id !== data.item!.id)]);
      resetForm();
      setNotice({ tone: "success", message: "Item cadastrado no catalogo." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao cadastrar item." });
    } finally {
      setCreating(false);
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

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).slice(0, 8));
  }

  function resetForm() {
    setTitle("");
    setCategory("");
    setPrice("");
    setDescription("");
    setStatus("active");
    setSelectedAttributes({});
    setWeightGrams("");
    setLengthCm("");
    setWidthCm("");
    setHeightCm("");
    setShippingProfile("default");
    setShippingNotes("");
    setFiles([]);
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
        actions={<NeonBadge tone="cyan">{visibleItems.length} itens</NeonBadge>}
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

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <StatTile icon={PackagePlus} label="Ativos" value={String(stats.active)} />
        <StatTile icon={CheckCircle2} label="Prontos" value={String(stats.ready)} />
        <StatTile icon={Upload} label="Arquivos" value={String(stats.media)} />
        <StatTile icon={CloudDownload} label="WhatsApp" value={String(stats.whatsapp)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton active={activeTab === "setup"} icon={Settings2} label="Configuracao" onClick={() => setActiveTab("setup")} />
        <TabButton active={activeTab === "shipping"} icon={Truck} label="Entrega e Frete" onClick={() => setActiveTab("shipping")} />
        <TabButton active={activeTab === "products"} disabled={!hasConfiguredSettings} icon={PackagePlus} label="Produtos" onClick={() => setActiveTab("products")} />
        <TabButton active={activeTab === "whatsapp"} icon={CloudDownload} label="WhatsApp" onClick={() => setActiveTab("whatsapp")} />
      </div>

      {activeTab === "setup" ? (
        <Panel title="Configuracao do Catalogo" eyebrow={selectedCompany?.name ?? "empresa"}>
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

              <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
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

                {categoryPresetOptions.length > 0 ? (
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) addCategoryRow(event.target.value);
                    }}
                    className="mt-3 h-10 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <option value="">Adicionar categoria pronta</option>
                    {categoryPresetOptions.map((categoryName) => (
                      <option key={categoryName} value={categoryName}>{categoryName}</option>
                    ))}
                  </select>
                ) : null}
              </div>

              <div className="grid gap-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                  <span className="text-slate-300">Estoque por variacao</span>
                  <input
                    checked={settingsDraft.trackInventory}
                    type="checkbox"
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, trackInventory: event.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                  <span className="text-slate-300">Fotos por variacao</span>
                  <input
                    checked={settingsDraft.variationMedia}
                    type="checkbox"
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, variationMedia: event.target.checked }))}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>Variacoes</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {attributePresetOptions.length > 0 ? (
                    <select
                      value=""
                      onChange={(event) => {
                        const preset = attributePresetOptions.find((attribute) => attribute.id === event.target.value);
                        if (preset) addAttributePreset(preset);
                      }}
                      className="h-8 rounded-lg border bg-transparent px-3 text-[11px] outline-none"
                      style={{ borderColor: "var(--ch-border)" }}
                    >
                      <option value="">Adicionar variacao pronta</option>
                      {attributePresetOptions.map((attribute) => (
                        <option key={attribute.id} value={attribute.id}>{attribute.name}</option>
                      ))}
                    </select>
                  ) : null}
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
        <Panel title="Entrega e Frete" eyebrow={selectedCompany?.name ?? "empresa"}>
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
                <span className="text-slate-300">Retirada local</span>
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
              <div className="overflow-x-auto">
                <div className="min-w-[1120px]">
                  <div className="grid grid-cols-[72px_minmax(150px,1fr)_112px_112px_110px_100px_100px_130px_88px] gap-2 border-b px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-slate-500" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
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
                        className="grid grid-cols-[72px_minmax(150px,1fr)_112px_112px_110px_100px_100px_130px_88px] items-center gap-2 border-b px-3 py-2 last:border-b-0"
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
                          className="h-10 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="00000-000"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.cepEnd ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { cepEnd: cepInput(event.target.value) })}
                          className="h-10 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="99999-999"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.price ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { price: event.target.value.slice(0, 40) })}
                          className="h-10 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          placeholder="R$ 29,90"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.minDays ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { minDays: parseOptionalNumber(event.target.value) })}
                          className="h-10 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="2"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.maxDays ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { maxDays: parseOptionalNumber(event.target.value) })}
                          className="h-10 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          inputMode="numeric"
                          placeholder="5"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <input
                          value={rule.freeShippingThreshold ?? ""}
                          onChange={(event) => updateShippingRule(rule.uf, { freeShippingThreshold: event.target.value.slice(0, 40) })}
                          className="h-10 rounded-lg border bg-transparent px-2 text-[12px] outline-none"
                          placeholder="R$ 300,00"
                          style={{ borderColor: "var(--ch-border)" }}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedShippingUf(rule.uf)}
                          className={cn(
                            "h-10 rounded-lg border px-2 font-mono text-[10px] font-semibold uppercase tracking-wide transition",
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
              <div className="rounded-xl border p-3 xl:col-span-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
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

                      <div className="mt-3 overflow-x-auto">
                        <div className="grid min-w-[520px] gap-2">
                          <div className="grid grid-cols-[22px_minmax(120px,1.4fr)_92px_106px_58px_58px_34px] gap-2 px-1 font-mono text-[8px] uppercase tracking-widest text-slate-500">
                            <span></span>
                            <span>Faixa</span>
                            <span>Peso</span>
                            <span>Valor</span>
                            <span>Min</span>
                            <span>Max</span>
                            <span></span>
                          </div>
                          {service.tiers.map((tier) => (
                            <div key={tier.id} className="grid grid-cols-[22px_minmax(120px,1.4fr)_92px_106px_58px_58px_34px] items-center gap-2">
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
              </div>
            ) : null}

            <div className="rounded-xl border p-3 xl:col-span-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-cyan-300" />
                <FieldLabel>Calculo por CEP</FieldLabel>
              </div>
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
            </div>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {activeTab === "products" ? (
          <Panel title="Novo item" eyebrow={selectedCompany?.name ?? "empresa"}>
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
                <Truck className="h-4 w-4 text-cyan-300" />
                <FieldLabel>Entrega deste item</FieldLabel>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv"
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

            {files.length > 0 ? (
              <div className="grid gap-2">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--ch-border)" }}>
                    <span className="min-w-0 truncate text-slate-300">{file.name}</span>
                    <span className="shrink-0 font-mono text-slate-500">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canCreate}
              onClick={createItem}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Cadastrar no catalogo
              </button>
            </div>
          </Panel>
          ) : (
          <Panel title="Catalogo WhatsApp" eyebrow={selectedCompany?.name ?? "sincronizacao"}>
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

        <Panel title="Itens cadastrados" eyebrow={selectedCompany?.name ?? "catalogo"}>
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

function CatalogItemCard({
  item,
  confirmDelete,
  deleting,
  visibilityLoading,
  onCopy,
  onDelete,
  onWhatsappVisibility,
}: {
  item: ClientSalesCatalogItem;
  confirmDelete: boolean;
  deleting: boolean;
  visibilityLoading: boolean;
  onCopy: () => void;
  onDelete: () => void;
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
              {item.price ? <span>{item.price} {item.currency}</span> : null}
              <span>{formatStatus(item.status)}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <NeonBadge tone={item.source === "whatsapp_catalog" ? "green" : "cyan"}>{sourceLabel}</NeonBadge>
            <NeonBadge tone={item.readiness === "ready" ? "green" : "amber"}>{formatReadiness(item.readiness)}</NeonBadge>
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{item.description || "Sem descricao cadastrada."}</p>

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

function StatTile({ icon: Icon, label, value }: { icon: typeof PackagePlus; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-3 font-mono text-[24px] font-bold text-cyan-200">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof PackagePlus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        active ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100",
      )}
      style={{ borderColor: active ? undefined : "var(--ch-border)" }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">{children}</span>;
}

function MediaIcon({ media }: { media: SalesCatalogMedia }) {
  if (media.kind === "image") return <ImageIcon className="h-3 w-3" />;
  if (media.kind === "video") return <Video className="h-3 w-3" />;
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

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function buildSettingsDraft(settings: ClientSalesCatalogSettings | null): SettingsDraft {
  const template = settings
    ? salesCatalogBusinessTemplates.find((item) => item.value === settings.businessType)
    : salesCatalogBusinessTemplates.find((item) => item.value === "fashion");
  const fallback = template ?? salesCatalogBusinessTemplates[0];

  return {
    businessType: settings?.businessType ?? fallback.value,
    categoriesText: (settings?.categories.length ? settings.categories : fallback.categories).join("\n"),
    attributes: cloneAttributes(settings?.attributes.length ? settings.attributes : fallback.attributes),
    trackInventory: settings?.trackInventory ?? fallback.trackInventory,
    variationMedia: settings?.variationMedia ?? fallback.variationMedia,
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

function buildAttributePresetOptions(currentAttributes: SalesCatalogAttribute[]) {
  const usedNames = new Set(currentAttributes.map((attribute) => attribute.name.trim().toLowerCase()));
  const seen = new Set<string>();
  const output: SalesCatalogAttribute[] = [];

  for (const template of salesCatalogBusinessTemplates) {
    for (const attribute of template.attributes) {
      const key = attribute.name.trim().toLowerCase();
      if (usedNames.has(key) || seen.has(key)) continue;

      seen.add(key);
      output.push({
        ...attribute,
        id: `${template.value}_${attribute.id}`,
        values: [...attribute.values],
      });
    }
  }

  return output;
}

function cloneAttributes(attributes: SalesCatalogAttribute[]) {
  return attributes.map((attribute) => ({
    ...attribute,
    values: [...attribute.values],
  }));
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

function createUniqueAttributeId(value: string, attributes: SalesCatalogAttribute[]) {
  const base = createAttributeId(value);
  const existing = new Set(attributes.map((attribute) => attribute.id));

  if (!existing.has(base)) return base;

  let index = 2;
  while (existing.has(`${base}_${index}`)) {
    index += 1;
  }

  return `${base}_${index}`;
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

function formatDimensions(item: ClientSalesCatalogItem) {
  const dimensions = [
    item.shipping.dimensions.lengthCm ? `${item.shipping.dimensions.lengthCm}C` : "",
    item.shipping.dimensions.widthCm ? `${item.shipping.dimensions.widthCm}L` : "",
    item.shipping.dimensions.heightCm ? `${item.shipping.dimensions.heightCm}A` : "",
  ].filter(Boolean);

  return dimensions.length > 0 ? `${dimensions.join(" x ")} cm` : null;
}
