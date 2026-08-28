"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  MessageSquareText,
  PackagePlus,
  Save,
  Smartphone,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { ClientWhatsappAutomationStudio, type ClientAutomationAgent } from "./client-whatsapp-automation-studio";
import { NeonBadge, PageHeader, Panel } from "./panel-primitives";
import type { ClientCompany } from "@/lib/client-os/companies";
import {
  createDefaultSalesCatalogCommerceSettings,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogWhatsappInstance,
  type SalesCatalogAutomationSettings,
  type SalesCatalogOrderBumpSettings,
  type SalesCatalogWhatsAppMessageTemplates,
} from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

type Notice = {
  tone: "success" | "error";
  message: string;
};

type AutomationsDraft = {
  messageTemplates: SalesCatalogWhatsAppMessageTemplates;
  automationSettings: SalesCatalogAutomationSettings;
  orderBumps: SalesCatalogOrderBumpSettings;
};

type ClientAutomationsCenterProps = {
  agents: ClientAutomationAgent[];
  companies: ClientCompany[];
  initialSettings: ClientSalesCatalogSettings[];
  products: ClientSalesCatalogItem[];
  whatsappInstances: ClientSalesCatalogWhatsappInstance[];
  initialCompanyId: string | null;
};

const messageTemplateFields: Array<{
  key: keyof SalesCatalogWhatsAppMessageTemplates;
  title: string;
  event: string;
  maxLength: number;
}> = [
  { key: "orderSummary", title: "Resumo do pedido", event: "Pedido criado", maxLength: 360 },
  { key: "paymentRequest", title: "Pedido de pagamento", event: "Checkout gerado", maxLength: 360 },
  { key: "paymentConfirmed", title: "Pagamento confirmado", event: "Pagamento aprovado", maxLength: 240 },
  { key: "paymentRejected", title: "Pagamento recusado", event: "Pagamento negado", maxLength: 300 },
  { key: "paymentRefunded", title: "Pagamento estornado", event: "Estorno confirmado", maxLength: 300 },
  { key: "unavailableItem", title: "Item indisponivel", event: "Estoque indisponivel", maxLength: 240 },
  { key: "humanHandoff", title: "Transferencia humana", event: "Atendimento humano", maxLength: 240 },
];

const variableChips = ["{cliente}", "{pedido}", "{itens}", "{valor}", "{metodo_pagamento}"];

export function ClientAutomationsCenter({
  agents,
  companies,
  initialSettings,
  products,
  whatsappInstances,
  initialCompanyId,
}: ClientAutomationsCenterProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? "");
  const [settings, setSettings] = useState(initialSettings);
  const [draft, setDraft] = useState(() => buildDraft(findSettings(initialSettings, initialCompanyId ?? companies[0]?.id ?? null)));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedSettings = findSettings(settings, selectedCompanyId);
  const companyProducts = products.filter((product) => product.companyId === selectedCompanyId && product.status === "active");
  const orderBumpProducts = companyProducts.filter((product) => (
    product.salesDestination === "connectyhub_checkout" && Boolean(product.price)
  ));
  const companyWhatsappInstances = whatsappInstances.filter((instance) => instance.companyId === selectedCompanyId);
  const selectedWhatsapp = companyWhatsappInstances.find((instance) => instance.id === draft.automationSettings.defaultWhatsappInstanceId) ?? null;
  const enabledOrderBumps = draft.orderBumps.items.filter((item) => item.active).length;
  const activeAutomations = [
    draft.automationSettings.paymentStatusNotifications,
    draft.orderBumps.enabled && enabledOrderBumps > 0,
    Boolean(draft.automationSettings.defaultWhatsappInstanceId),
  ].filter(Boolean).length;

  function selectCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    setDraft(buildDraft(findSettings(settings, companyId)));
    setNotice(null);
  }

  function updateMessageTemplate(key: keyof SalesCatalogWhatsAppMessageTemplates, value: string, maxLength: number) {
    setDraft((current) => ({
      ...current,
      messageTemplates: {
        ...current.messageTemplates,
        [key]: value.slice(0, maxLength),
      },
    }));
  }

  function updateAutomationSettings(patch: Partial<SalesCatalogAutomationSettings>) {
    setDraft((current) => ({
      ...current,
      automationSettings: {
        ...current.automationSettings,
        ...patch,
      },
    }));
  }

  function toggleOrderBumpProduct(product: ClientSalesCatalogItem) {
    setDraft((current) => {
      const exists = current.orderBumps.items.find((item) => item.productId === product.id);
      const items = exists
        ? current.orderBumps.items.filter((item) => item.productId !== product.id)
        : [
            ...current.orderBumps.items,
            {
              productId: product.id,
              active: true,
              badge: product.highlightLabel ?? "Oferta extra",
              title: product.title,
              description: product.description.slice(0, 180),
            },
          ].slice(0, 12);

      return {
        ...current,
        orderBumps: {
          ...current.orderBumps,
          items,
        },
      };
    });
  }

  function updateOrderBumpItem(
    productId: string,
    patch: Partial<SalesCatalogOrderBumpSettings["items"][number]>,
  ) {
    setDraft((current) => ({
      ...current,
      orderBumps: {
        ...current.orderBumps,
        items: current.orderBumps.items.map((item) => (
          item.productId === productId ? { ...item, ...patch } : item
        )),
      },
    }));
  }

  async function saveAutomations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCompanyId || saving) return;

    setSaving(true);
    setNotice(null);

    try {
      const defaults = createDefaultSalesCatalogCommerceSettings();
      const source = selectedSettings;
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_catalog_settings",
          companyId: selectedCompanyId,
          businessType: source?.businessType ?? "simple",
          categories: source?.categories ?? [],
          attributes: source?.attributes ?? [],
          trackInventory: source?.trackInventory ?? false,
          variationMedia: source?.variationMedia ?? false,
          paymentMethods: source?.paymentMethods ?? defaults.paymentMethods,
          orderPolicy: source?.orderPolicy ?? defaults.orderPolicy,
          leadDataPolicy: source?.leadDataPolicy ?? defaults.leadDataPolicy,
          messageTemplates: draft.messageTemplates,
          automationSettings: draft.automationSettings,
          orderBumps: draft.orderBumps,
        }),
      });
      const data = await response.json().catch(() => null) as { settings?: ClientSalesCatalogSettings; error?: string } | null;

      if (!response.ok || !data?.settings) {
        throw new Error(data?.error ?? "Nao foi possivel salvar as automacoes.");
      }

      setSettings((current) => [data.settings!, ...current.filter((item) => item.companyId !== data.settings!.companyId)]);
      setDraft(buildDraft(data.settings));
      setNotice({ tone: "success", message: "Automacoes salvas." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar automacoes." });
    } finally {
      setSaving(false);
    }
  }

  const messagePreview = useMemo(() => {
    const template = draft.messageTemplates.paymentConfirmed;
    return renderPreview(template, {
      cliente: "Mariana",
      pedido: "A1B2C3D4",
      itens: "1x Produto principal",
      valor: "R$ 97,00",
      metodo_pagamento: "Pix Mercado Pago",
    });
  }, [draft.messageTemplates.paymentConfirmed]);

  if (!companies.length) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader
          eyebrow="Workspace / automacoes"
          title="Automacoes"
          description="Cadastre sua empresa antes de configurar mensagens automaticas."
        />
      </div>
    );
  }

  return (
    <form onSubmit={saveAutomations} className="space-y-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Workspace / automacoes"
        title="Automacoes"
        description="Configure mensagens, agente WhatsApp e ofertas extras usadas pelo checkout e pelo agente de vendas."
        actions={
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-4 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando" : "Salvar"}
          </button>
        }
      />

      {notice ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            notice.tone === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
              : "border-rose-400/30 bg-rose-400/10 text-rose-100",
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Empresa" value={selectedCompany?.name ?? "Workspace"} detail="configuracao ativa" icon={Bot} />
        <Metric label="Automacoes" value={String(activeAutomations)} detail="fluxos prontos" icon={MessageSquareText} />
        <Metric label="WhatsApp" value={selectedWhatsapp?.status === "connected" ? "online" : selectedWhatsapp ? "configurado" : "pendente"} detail={selectedWhatsapp?.label ?? "sem padrao"} icon={Smartphone} />
      </div>

      <Panel
        title="Base das automacoes"
        eyebrow="empresa / agente / whatsapp"
        tone="cyan"
        action={<NeonBadge tone={draft.automationSettings.paymentStatusNotifications ? "green" : "amber"}>{draft.automationSettings.paymentStatusNotifications ? "ativo" : "pausado"}</NeonBadge>}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <label className="block">
            <FieldLabel>Empresa</FieldLabel>
            <select
              value={selectedCompanyId}
              onChange={(event) => selectCompany(event.target.value)}
              className="h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
              style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <FieldLabel>Agente e WhatsApp das automacoes</FieldLabel>
            <select
              value={draft.automationSettings.defaultWhatsappInstanceId ?? ""}
              onChange={(event) => {
                const instance = companyWhatsappInstances.find((item) => item.id === event.target.value);
                updateAutomationSettings({
                  defaultWhatsappInstanceId: instance?.id ?? null,
                  defaultAgentId: instance?.agentId ?? null,
                });
              }}
              className="h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
              style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
            >
              <option value="">Usar somente o WhatsApp da conversa</option>
              {companyWhatsappInstances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.label}
                </option>
              ))}
            </select>
          </label>

          <ToggleRow
            checked={draft.automationSettings.paymentStatusNotifications}
            title="Enviar atualizacoes de pagamento"
            description="Quando o pagamento do pedido for aprovado, o agente envia a confirmacao para o cliente."
            onClick={() => updateAutomationSettings({ paymentStatusNotifications: !draft.automationSettings.paymentStatusNotifications })}
          />
          <ToggleRow
            checked={draft.automationSettings.useConversationWhatsappFirst}
            title="Priorizar WhatsApp da conversa"
            description="Pedidos feitos dentro de uma conversa respondem pelo mesmo agente que atendeu o lead."
            onClick={() => updateAutomationSettings({ useConversationWhatsappFirst: !draft.automationSettings.useConversationWhatsappFirst })}
          />
        </div>
      </Panel>

      <ClientWhatsappAutomationStudio
        agents={agents}
        companyId={selectedCompanyId}
        companyName={selectedCompany?.name ?? "Workspace"}
        products={companyProducts}
        selectedAutomationAgentId={draft.automationSettings.defaultAgentId ?? selectedWhatsapp?.agentId ?? null}
        selectedAutomationWhatsappLabel={selectedWhatsapp?.label ?? null}
      />

      <Panel
        title="Mensagens automaticas"
        eyebrow="checkout / whatsapp"
        tone="violet"
        action={<NeonBadge tone="violet">{messageTemplateFields.length} templates</NeonBadge>}
        collapsible
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {variableChips.map((variable) => (
            <span key={variable} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-[10px] font-semibold text-blue-700">
              {variable}
            </span>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {messageTemplateFields.map((field) => (
            <label key={field.key} className="block rounded-xl border border-blue-100 bg-white p-3 shadow-sm shadow-slate-950/5">
              <span className="flex items-center justify-between gap-2">
                <span>
                  <FieldLabel>{field.title}</FieldLabel>
                  <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{field.event}</span>
                </span>
                <span className="font-mono text-[10px] font-semibold text-slate-500">
                  {draft.messageTemplates[field.key].length}/{field.maxLength}
                </span>
              </span>
              <textarea
                value={draft.messageTemplates[field.key]}
                onChange={(event) => updateMessageTemplate(field.key, event.target.value, field.maxLength)}
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-700">Preview pagamento aprovado</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">{messagePreview}</p>
        </div>
      </Panel>

      <Panel
        title="Order bump"
        eyebrow="checkout / ofertas extras"
        tone="amber"
        action={<NeonBadge tone={draft.orderBumps.enabled ? "amber" : "zinc"}>{enabledOrderBumps} ofertas</NeonBadge>}
      >
        <ToggleRow
          checked={draft.orderBumps.enabled}
          title="Mostrar ofertas extras no checkout"
          description="Produtos marcados podem aparecer como oferta complementar antes do pagamento."
          onClick={() => setDraft((current) => ({ ...current, orderBumps: { ...current.orderBumps, enabled: !current.orderBumps.enabled } }))}
        />
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {orderBumpProducts.length ? orderBumpProducts.slice(0, 18).map((product) => {
            const selected = draft.orderBumps.items.some((item) => item.productId === product.id);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggleOrderBumpProduct(product)}
                className={cn(
                  "min-h-20 rounded-xl border p-3 text-left transition",
                  selected ? "border-amber-300/50 bg-amber-300/12" : "border-slate-700/70 bg-slate-950/20 hover:border-amber-300/30",
                )}
              >
                <span className="flex items-start gap-2">
                  <PackagePlus className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-amber-200" : "text-slate-500")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{product.title}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">{product.price ? `R$ ${product.price}` : "sem preco"}</span>
                  </span>
                </span>
              </button>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              Cadastre produtos ativos com preco para usar order bump.
            </div>
          )}
        </div>
        {draft.orderBumps.items.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {draft.orderBumps.items.map((item) => {
              const product = companyProducts.find((entry) => entry.id === item.productId);

              return (
                <div
                  key={item.productId}
                  className="rounded-xl border border-amber-300/25 bg-amber-300/8 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">{product?.title ?? item.title ?? "Produto selecionado"}</p>
                    <NeonBadge tone={item.active ? "amber" : "zinc"}>{item.active ? "ativo" : "pausado"}</NeonBadge>
                  </div>
                  <div className="grid gap-2">
                    <input
                      value={item.badge ?? ""}
                      onChange={(event) => updateOrderBumpItem(item.productId, { badge: event.target.value.slice(0, 32) })}
                      className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder="Badge: Oferta especial"
                      style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
                    />
                    <input
                      value={item.title ?? ""}
                      onChange={(event) => updateOrderBumpItem(item.productId, { title: event.target.value.slice(0, 80) })}
                      className="h-10 rounded-lg border bg-transparent px-3 text-[12px] outline-none"
                      placeholder="Titulo no checkout"
                      style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
                    />
                    <textarea
                      value={item.description ?? ""}
                      onChange={(event) => updateOrderBumpItem(item.productId, { description: event.target.value.slice(0, 180) })}
                      className="min-h-16 resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
                      placeholder="Descricao curta da oferta"
                      style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Panel>
    </form>
  );
}

function Metric({ detail, icon: Icon, label, value }: { detail: string; icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  onClick,
  title,
}: {
  checked: boolean;
  description: string;
  onClick: () => void;
  title: string;
}) {
  const Icon = checked ? ToggleRight : ToggleLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-20 items-start gap-3 rounded-xl border p-3 text-left transition",
        checked ? "border-emerald-300/35 bg-emerald-300/10" : "border-slate-700/80 bg-slate-950/20",
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", checked ? "text-emerald-300" : "text-slate-500")} />
      <span>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-1 block text-[12px] leading-5 text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{children}</span>;
}

function buildDraft(settings: ClientSalesCatalogSettings | null): AutomationsDraft {
  const defaults = createDefaultSalesCatalogCommerceSettings();

  return {
    messageTemplates: { ...(settings?.messageTemplates ?? defaults.messageTemplates) },
    automationSettings: { ...(settings?.automationSettings ?? defaults.automationSettings) },
    orderBumps: {
      enabled: settings?.orderBumps.enabled ?? false,
      items: (settings?.orderBumps.items ?? []).map((item) => ({ ...item })),
    },
  };
}

function findSettings(settings: ClientSalesCatalogSettings[], companyId: string | null | undefined) {
  return settings.find((item) => item.companyId === companyId) ?? null;
}

function renderPreview(template: string, variables: Record<string, string>) {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => variables[key.toLowerCase()] ?? match);
}
