"use client";

import { useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  PackagePlus,
  ShoppingBag,
  Tags,
  Truck,
  Upload,
} from "lucide-react";
import type { ClientCompany } from "@/lib/client-os/companies";
import type {
  PlatformProduct,
  PlatformProductCatalog,
  PlatformProductCommission,
  PlatformProductCommissionStatus,
  PlatformProductImport,
} from "@/lib/platform-products";
import { formatSalesCatalogFulfillmentMode, formatSalesCatalogWeight } from "@/lib/sales-catalog/shared";
import { NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";

type Notice = {
  tone: "success" | "error";
  message: string;
};

export function ClientProductsMarketplace({
  catalog,
  companies,
  initialCompanyId,
}: {
  catalog: PlatformProductCatalog;
  companies: ClientCompany[];
  initialCompanyId: string | null;
}) {
  const [imports, setImports] = useState(catalog.imports);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? "");
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const importsForCompany = imports.filter((item) => item.organizationId === selectedCompanyId && item.status === "active");
  const commissionsForCompany = catalog.commissions.filter((item) => item.organizationId === selectedCompanyId);
  const importedProductIds = new Set(importsForCompany.map((item) => item.platformProductId));
  const featuredProducts = catalog.products.filter((product) => product.marketplaceStatus === "featured");
  const metrics = useMemo(() => {
    const commissionable = catalog.products.filter((product) => product.commissionPolicyType !== "none" && product.commissionPercentage > 0);

    return {
      available: catalog.products.length,
      featured: featuredProducts.length,
      imported: importsForCompany.length,
      commissionable: commissionable.length,
      payableCommission: commissionsForCompany
        .filter((commission) => commission.status === "pending" || commission.status === "available")
        .reduce((total, commission) => total + commission.commissionAmount, 0),
      pendingCommission: commissionsForCompany
        .filter((commission) => commission.status === "pending")
        .reduce((total, commission) => total + commission.commissionAmount, 0),
      availableCommission: commissionsForCompany
        .filter((commission) => commission.status === "available")
        .reduce((total, commission) => total + commission.commissionAmount, 0),
      paidCommission: commissionsForCompany
        .filter((commission) => commission.status === "paid")
        .reduce((total, commission) => total + commission.commissionAmount, 0),
      blockedCommission: commissionsForCompany
        .filter((commission) => commission.status === "blocked" || commission.status === "cancelled" || commission.status === "refunded")
        .reduce((total, commission) => total + commission.commissionAmount, 0),
      pendingCount: commissionsForCompany.filter((commission) => commission.status === "pending").length,
      availableCount: commissionsForCompany.filter((commission) => commission.status === "available").length,
      paidCount: commissionsForCompany.filter((commission) => commission.status === "paid").length,
      blockedCount: commissionsForCompany.filter((commission) => commission.status === "blocked" || commission.status === "cancelled" || commission.status === "refunded").length,
      averageCommission: commissionable.length > 0
        ? (commissionable.reduce((total, product) => total + product.commissionPercentage, 0) / commissionable.length).toFixed(1)
        : "0",
    };
  }, [catalog.products, featuredProducts.length, importsForCompany.length, commissionsForCompany]);

  async function importProduct(product: PlatformProduct) {
    if (!selectedCompanyId) {
      setNotice({ tone: "error", message: "Escolha a empresa onde este produto sera vendido." });
      return;
    }

    setLoadingProductId(product.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_platform_product",
          productId: product.id,
          companyId: selectedCompanyId,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        importRecord?: PlatformProductImport;
        catalogItemId?: string;
        agentTag?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.importRecord) {
        throw new Error(data?.error ?? "Nao foi possivel importar o produto.");
      }

      setImports((current) => [
        data.importRecord!,
        ...current.filter((item) => item.id !== data.importRecord!.id),
      ]);
      setNotice({
        tone: "success",
        message: `Produto importado para ${selectedCompany?.name ?? "a empresa"}. Tag liberada no Catalogo de Vendas: ${data.agentTag ?? product.agentTag}`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao importar produto." });
    } finally {
      setLoadingProductId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Client OS / Produtos ConnectyHub"
        title="Produtos"
        description="Importe produtos da ConnectyHub para vender por comissao no WhatsApp. Produtos proprios continuam no Catalogo de Vendas."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={catalog.schemaReady ? "green" : "amber"}>{catalog.schemaReady ? "Vitrine ativa" : "Aguardando SQL"}</NeonBadge>
            <NeonBadge tone="cyan">{metrics.available} disponiveis</NeonBadge>
            <NeonBadge tone="amber">{metrics.imported} importados</NeonBadge>
          </div>
        }
      />

      {!catalog.schemaReady ? (
        <Panel title="Vitrine indisponivel" eyebrow="connectyhub">
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] leading-6 text-amber-100">
            A area de produtos ConnectyHub ainda depende da migration de marketplace no Supabase.
          </div>
        </Panel>
      ) : (
        <div className="space-y-5">
          {notice ? (
            <div
              className="rounded-2xl px-4 py-3 text-[13px] font-medium"
              style={{
                background: notice.tone === "success" ? "rgba(16,185,129,0.10)" : "rgba(244,63,94,0.08)",
                border: notice.tone === "success" ? "1px solid rgba(16,185,129,0.24)" : "1px solid rgba(244,63,94,0.22)",
                color: notice.tone === "success" ? "#86efac" : "#fda4af",
              }}
            >
              {notice.message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <Metric icon={ShoppingBag} label="Disponiveis" value={String(metrics.available)} detail="produtos ConnectyHub" />
            <Metric icon={CheckCircle2} label="Importados" value={String(metrics.imported)} detail={selectedCompany?.name ?? "empresa selecionada"} />
            <Metric icon={BadgePercent} label="Comissao media" value={`${metrics.averageCommission}%`} detail={`${metrics.commissionable} comissao ativa`} />
            <Metric icon={BadgePercent} label="A receber" value={formatMoney(metrics.payableCommission)} detail="pendente/liberado" />
          </div>

          <Panel
            title="Empresa de venda"
            eyebrow="separacao por agente/operacao"
            action={
              <Link href="/dashboard/links" className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100" style={{ borderColor: "var(--ch-border)" }}>
                <ExternalLink className="h-3.5 w-3.5" />
                Catalogo de Vendas
              </Link>
            }
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(260px,420px)_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Empresa</span>
                <select
                  value={selectedCompanyId}
                  onChange={(event) => setSelectedCompanyId(event.target.value)}
                  className="h-11 w-full rounded-xl px-3 text-[13px] outline-none"
                  style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border px-4 py-3 text-[12px] leading-5 text-slate-400" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                Ao importar, o produto entra no Catalogo de Vendas desta empresa com a tag pronta para o agente. A venda do produto ConnectyHub continua recebendo na conta da ConnectyHub, e a sua comissao fica registrada para repasse.
              </div>
            </div>
            {companies.length === 0 ? (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100">
                Crie uma empresa antes de importar produtos ConnectyHub.
              </div>
            ) : null}
          </Panel>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Panel title="Vitrine ConnectyHub" eyebrow="produtos para revenda">
              <div className="grid gap-3">
                {catalog.products.length > 0 ? catalog.products.map((product) => (
                  <MarketplaceProductCard
                    key={product.id}
                    disabled={!selectedCompanyId}
                    imported={importedProductIds.has(product.id)}
                    loading={loadingProductId === product.id}
                    product={product}
                    onCopy={() => copyText(product.agentTag)}
                    onImport={() => importProduct(product)}
                  />
                )) : (
                  <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                    Nenhum produto ConnectyHub disponivel para importacao.
                  </div>
                )}
              </div>
            </Panel>

            <div className="space-y-5">
              <Panel title="Importados nesta empresa" eyebrow={selectedCompany?.name ?? "empresa"}>
                <div className="grid gap-3">
                  {importsForCompany.length > 0 ? importsForCompany.map((importRecord) => {
                    const product = catalog.products.find((item) => item.id === importRecord.platformProductId);
                    return (
                      <div key={importRecord.id} className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-slate-100">{product?.name ?? importRecord.localTitle ?? "Produto ConnectyHub"}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{importRecord.localCatalogItemId ? `Catalogo ${importRecord.localCatalogItemId.slice(0, 8)}` : "Aguardando catalogo"}</p>
                          </div>
                          <StatusBadge status="online" label="importado" />
                        </div>
                        {product ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <MiniTag icon={BadgePercent}>{product.commissionPercentage}%</MiniTag>
                            <MiniTag icon={Tags}>{product.agentTag}</MiniTag>
                          </div>
                        ) : null}
                      </div>
                    );
                  }) : (
                    <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                      Nenhum produto importado para esta empresa.
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title="Comissoes" eyebrow="repasse ConnectyHub">
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <CommissionSummaryTile label="Pendente" value={formatMoney(metrics.pendingCommission)} detail={`${metrics.pendingCount} aguardando prazo`} />
                  <CommissionSummaryTile label="Liberada" value={formatMoney(metrics.availableCommission)} detail={`${metrics.availableCount} pronta para repasse`} />
                  <CommissionSummaryTile label="Paga" value={formatMoney(metrics.paidCommission)} detail={`${metrics.paidCount} repasse(s)`} />
                  <CommissionSummaryTile label="Bloq/estorno" value={formatMoney(metrics.blockedCommission)} detail={`${metrics.blockedCount} ocorrencia(s)`} />
                </div>
                <div className="grid gap-3">
                  {commissionsForCompany.length > 0 ? commissionsForCompany.map((commission) => (
                    <CommissionRow
                      key={commission.id}
                      commission={commission}
                      product={catalog.products.find((item) => item.id === commission.platformProductId) ?? null}
                    />
                  )) : (
                    <div className="rounded-xl border border-dashed px-4 py-10 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                      Nenhuma comissao registrada para esta empresa.
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketplaceProductCard({
  product,
  imported,
  loading,
  disabled,
  onImport,
  onCopy,
}: {
  product: PlatformProduct;
  imported: boolean;
  loading: boolean;
  disabled: boolean;
  onImport: () => void;
  onCopy: () => void;
}) {
  const cover = product.media.find((media) => media.kind === "image");

  return (
    <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-[104px_minmax(0,1fr)]" style={{ background: "var(--ch-surface-2)", borderColor: product.marketplaceStatus === "featured" ? "rgba(251,191,36,0.42)" : "var(--ch-border)" }}>
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg border" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
        {cover ? <Image alt={product.name} className="object-cover" fill sizes="104px" src={cover.storageUrl} unoptimized /> : <PackagePlus className="h-9 w-9 text-slate-600" />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-slate-100">{product.name}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {product.category ? <span>{product.category}</span> : null}
              {product.offer.salePrice ? <span>Oferta {product.offer.salePrice}</span> : product.price ? <span>{product.price}</span> : null}
              <span>{formatSalesCatalogFulfillmentMode(product.fulfillment.mode)}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {product.marketplaceStatus === "featured" ? <NeonBadge tone="amber">destaque</NeonBadge> : null}
            {imported ? <StatusBadge status="online" label="importado" /> : null}
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{product.shortDescription || product.commercialDescription}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <MiniTag icon={ShoppingBag}>{formatSalesChannel(product.salesChannelType)}</MiniTag>
          <MiniTag icon={BadgePercent}>{product.commissionPercentage}% comissao</MiniTag>
          <MiniTag icon={CheckCircle2}>repasse D+{product.commissionReleaseDays}</MiniTag>
          <MiniTag icon={Tags}>{product.skus.length || 1} SKU</MiniTag>
          {product.shipping.weightGrams ? <MiniTag icon={Truck}>{formatSalesCatalogWeight(product.shipping.weightGrams)}</MiniTag> : null}
          {product.media.length > 0 ? <MiniTag icon={Upload}>{product.media.length} arq.</MiniTag> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || disabled}
            onClick={onImport}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
            {imported ? "Atualizar importacao" : "Importar"}
          </button>
          <button type="button" onClick={onCopy} className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100" style={{ borderColor: "var(--ch-border)" }}>
            <Copy className="h-3.5 w-3.5" />
            Tag
          </button>
        </div>
      </div>
    </div>
  );
}

function CommissionRow({ commission, product }: { commission: PlatformProductCommission; product: PlatformProduct | null }) {
  const title = readString(commission.metadata.product_name) ?? product?.name ?? "Produto ConnectyHub";
  const payoutReference = readString(commission.metadata.payout_reference)
    ?? readString(readMetadataRecord(commission.metadata.last_status_update).payout_reference);

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Venda {formatMoney(commission.saleAmount)} - libera {formatDate(commission.releaseAt)}
          </p>
        </div>
        <NeonBadge tone={commissionStatusTone(commission.status)}>{formatCommissionStatus(commission.status)}</NeonBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <MiniTag icon={BadgePercent}>{formatMoney(commission.commissionAmount)}</MiniTag>
        <MiniTag icon={CheckCircle2}>{commission.commissionPercentage}%</MiniTag>
        {commission.paidAt ? <MiniTag icon={CheckCircle2}>pago {formatDate(commission.paidAt)}</MiniTag> : null}
        {payoutReference ? <MiniTag icon={Tags}>{payoutReference}</MiniTag> : null}
      </div>
    </div>
  );
}

function CommissionSummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 truncate font-mono text-[17px] font-bold text-cyan-100">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(6,182,212,0.14)", color: "#22d3ee" }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 font-mono text-[26px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>{value}</p>
      <p className="mt-3 text-[12px] text-slate-500">{detail}</p>
    </div>
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

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "sem data";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "sem data";
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

function formatSalesChannel(value: PlatformProduct["salesChannelType"]) {
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
