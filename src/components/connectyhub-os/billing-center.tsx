import {
  Banknote,
  BrainCircuit,
  Coins,
  DatabaseZap,
  Mic2,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { BillingCommercialCatalog } from "@/lib/billing/admin-catalog";
import type { BillingAdminSummary } from "@/lib/billing/summary";
import { BillingCommercialConfig } from "./billing-commercial-config";
import { ConnectyShell } from "./connecty-shell";
import {
  NeonBadge,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
} from "./panel-primitives";

export function BillingCenter({
  summary,
  commercialCatalog,
  userLabel = "CEO_HUMAN_ADM",
}: {
  summary: BillingAdminSummary;
  commercialCatalog: BillingCommercialCatalog;
  userLabel?: string;
}) {
  const marginPercent = getMarginPercent(summary.totals.providerCost, summary.totals.connectyRevenue);

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel} activeHref="/admin/financeiro">
      <PageHeader
        eyebrow="Admin OS / Centro de custo"
        title="Financeiro da IA"
        description="Controle de creditos, consumo de provedores, margem e revenda de tokens da ConnectyHub."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={summary.schemaReady ? "green" : "amber"}>
              {summary.schemaReady ? "Schema pronto" : "Aguardando SQL"}
            </NeonBadge>
            <NeonBadge tone="cyan">{summary.periodLabel}</NeonBadge>
          </div>
        }
      />

      {summary.warnings.length > 0 && (
        <Panel className="mb-5" title="Aviso do centro de custo" eyebrow="schema / banco">
          <div
            className="rounded-xl p-4 text-[13px] leading-6 text-slate-600"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}
          >
            <p className="font-semibold text-amber-700">
              O painel financeiro ja existe, mas o Supabase ainda precisa receber a migration de billing.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {summary.warnings.slice(0, 3).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BillingMetric
          icon={DatabaseZap}
          label="Eventos de uso"
          value={formatNumber(summary.totals.usageEvents)}
          detail="Chamadas registradas pelos agentes"
          tone="cyan"
        />
        <BillingMetric
          icon={Banknote}
          label="Custo provedor"
          value={formatMoney(summary.totals.providerCost)}
          detail="Gemini, ElevenLabs e futuros provedores"
          tone="violet"
        />
        <BillingMetric
          icon={TrendingUp}
          label="Receita estimada"
          value={formatMoney(summary.totals.connectyRevenue)}
          detail={`${marginPercent}% de margem bruta`}
          tone="green"
        />
        <BillingMetric
          icon={WalletCards}
          label="Creditos em carteira"
          value={formatCredits(summary.totals.walletBalanceCredits)}
          detail="Saldo total dos clientes"
          tone="amber"
        />
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title="Provedores faturaveis" eyebrow="custo real / cobranca connectyhub">
          <div className="space-y-3">
            {summary.providers.length > 0 ? (
              summary.providers.map((provider) => {
                const providerMargin = getMarginPercent(provider.providerCost, provider.connectyRevenue);

                return (
                  <div
                    key={provider.provider}
                    className="rounded-xl p-4"
                    style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                          {provider.label}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          {formatNumber(provider.events)} eventos / {formatCredits(provider.chargeCredits)} creditos cobrados
                        </p>
                      </div>
                      <StatusBadge status={providerMargin >= 60 ? "online" : providerMargin > 0 ? "warning" : "idle"} />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <ProviderValue label="Custo" value={formatMoney(provider.providerCost)} />
                      <ProviderValue label="Receita" value={formatMoney(provider.connectyRevenue)} />
                      <ProviderValue label="Margem" value={`${providerMargin}%`} />
                    </div>

                    <div className="mt-4">
                      <ProgressBar value={Math.min(providerMargin, 100)} tone={providerMargin >= 60 ? "green" : "amber"} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                className="rounded-xl p-5 text-[13px] leading-6 text-slate-500"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                Ainda nao existem eventos de uso. Quando um agente consumir Gemini ou ElevenLabs, o custo e a cobranca vao aparecer aqui por provedor.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Regras do centro de custo" eyebrow="como vamos cobrar">
          <div className="space-y-3">
            <RuleCard
              icon={BrainCircuit}
              title="Gemini"
              text="Tokens de entrada e saida serao registrados por agente, cliente, conversa e modelo usado."
            />
            <RuleCard
              icon={Mic2}
              title="ElevenLabs"
              text="Voz, clonagem autorizada e respostas por audio serao cobradas por caracteres, requests ou credito configurado."
            />
            <RuleCard
              icon={Coins}
              title="Planos + creditos"
              text="O cliente paga assinatura e pode comprar creditos extras. O painel calcula custo real, receita e margem."
            />
            <RuleCard
              icon={ReceiptText}
              title="Auditoria"
              text="Cada consumo vira evento de uso e pode gerar debito na carteira da empresa do cliente."
            />
          </div>
        </Panel>
      </div>

      <BillingCommercialConfig catalog={commercialCatalog} />
    </ConnectyShell>
  );
}

function BillingMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof DatabaseZap;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "cyan" | "amber" | "violet";
}) {
  const color = tone === "green" ? "#10b981" : tone === "cyan" ? "#06b6d4" : tone === "amber" ? "#f59e0b" : "#8b5cf6";

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 font-mono text-[28px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <p className="mt-3 text-[12px] text-slate-500">{detail}</p>
    </div>
  );
}

function ProviderValue({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function RuleCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof BrainCircuit;
  title: string;
  text: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-500" />
        <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      </div>
      <p className="text-[12px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function getMarginPercent(providerCost: number, revenue: number) {
  if (revenue <= 0) {
    return 0;
  }

  return Math.round(((revenue - providerCost) / revenue) * 10000) / 100;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}
