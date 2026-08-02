import {
  BadgePercent,
  Banknote,
  BrainCircuit,
  Calculator,
  Coins,
  DatabaseZap,
  Gauge,
  HandCoins,
  Mic2,
  PackageCheck,
  ReceiptText,
  ServerCog,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { BillingCommercialCatalog } from "@/lib/billing/admin-catalog";
import type { PlatformBillingOperationsCatalog } from "@/lib/billing/platform-billing-admin";
import type { BillingAdminSummary } from "@/lib/billing/summary";
import { BillingCommercialConfig } from "./billing-commercial-config";
import { BillingRealtimeRefresh } from "./billing-realtime-refresh";
import { ConnectyShell } from "./connecty-shell";
import {
  NeonBadge,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
  DataTable,
} from "./panel-primitives";
import { PlatformBillingOperations } from "./platform-billing-operations";

export function BillingCenter({
  summary,
  commercialCatalog,
  platformBillingCatalog,
  userLabel = "CEO_HUMAN_ADM",
}: {
  summary: BillingAdminSummary;
  commercialCatalog: BillingCommercialCatalog;
  platformBillingCatalog: PlatformBillingOperationsCatalog;
  userLabel?: string;
}) {
  const marginPercent = getMarginPercent(summary.totals.providerCost, summary.totals.connectyRevenue);
  const billableCredits = summary.totals.customerBillableCredits + summary.totals.trialBillableCredits;
  const absorbedCredits = summary.totals.platformAbsorbedCredits + summary.totals.freeCredits;

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
            <BillingRealtimeRefresh updatedAt={summary.generatedAt} />
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

      <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <BillingMetric
          icon={DatabaseZap}
          label="Eventos de uso"
          value={formatNumber(summary.totals.usageEvents)}
          detail={`${formatNumber(summary.totals.todayUsageEvents)} hoje / chamadas registradas`}
          tone="cyan"
        />
        <BillingMetric
          icon={Banknote}
          label="Custo provedor"
          value={formatMoney(summary.totals.providerCost)}
          detail={`${formatMoney(summary.totals.todayProviderCost)} hoje`}
          tone="violet"
        />
        <BillingMetric
          icon={TrendingUp}
          label="Receita estimada"
          value={formatMoney(summary.totals.connectyRevenue)}
          detail={`${formatMoney(summary.totals.todayConnectyRevenue)} hoje / ${marginPercent}% margem`}
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

      <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <BillingMetric
          icon={HandCoins}
          label="Debitado clientes"
          value={formatCredits(billableCredits)}
          detail={`${formatCredits(summary.totals.todayChargeCredits)} hoje / ${formatCredits(summary.totals.trialBillableCredits)} trial`}
          tone="green"
        />
        <BillingMetric
          icon={BrainCircuit}
          label="Uso interno CH"
          value={formatCredits(summary.totals.internalShadowCredits)}
          detail="Credito equivalente sem debitar cliente"
          tone="violet"
        />
        <BillingMetric
          icon={ReceiptText}
          label="Absorvido/isento"
          value={formatCredits(absorbedCredits)}
          detail="Plataforma absorvida ou gratis"
          tone="amber"
        />
        <BillingMetric
          icon={UserRound}
          label="Escopos ativos"
          value={formatNumber(summary.agentScopes.length)}
          detail="Clientes, admin e interno separados"
          tone="cyan"
        />
      </div>

      <CurrentCostCenterPanel summary={summary} />
      <SupplierTariffsPanel catalog={commercialCatalog} summary={summary} />

      <PlatformBillingOperations catalog={platformBillingCatalog} />

      <CommercialSalesPanel summary={summary} />

      {summary.billingModes.length > 0 && (
        <Panel className="mb-4" title="Consumo por modo" eyebrow="clientes / trial / interno" compact collapsible>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {summary.billingModes.map((mode) => (
                <ProviderValue
                  key={mode.mode}
                  label={`${mode.label} / ${formatNumber(mode.events)} eventos`}
                  value={`${formatCredits(mode.chargeCredits)} creditos`}
                />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {summary.agentScopes.map((scope) => (
                <ProviderValue
                  key={scope.scope}
                  label={`${scope.label} / ${formatNumber(scope.events)} eventos`}
                  value={`${formatCredits(scope.chargeCredits)} creditos`}
                />
              ))}
            </div>
          </div>
        </Panel>
      )}

      <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_360px]">
        <Panel title="Provedores faturaveis" eyebrow="custo real / cobranca connectyhub" compact collapsible>
          <div className="space-y-3">
            {summary.providers.length > 0 ? (
              summary.providers.map((provider) => {
                const providerMargin = getMarginPercent(provider.providerCost, provider.connectyRevenue);

                return (
                  <div
                    key={provider.provider}
                    className="rounded-xl p-3"
                    style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                          {provider.label}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          {formatNumber(provider.events)} eventos / {formatCredits(provider.chargeCredits)} creditos apurados
                        </p>
                      </div>
                      <StatusBadge status={providerMargin >= 60 ? "online" : providerMargin > 0 ? "warning" : "idle"} />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <ProviderValue label="Custo" value={formatMoney(provider.providerCost)} />
                      <ProviderValue label="Receita" value={formatMoney(provider.connectyRevenue)} />
                      <ProviderValue label="Margem" value={`${providerMargin}%`} />
                    </div>

                    <div className="mt-3">
                      <ProgressBar value={Math.max(0, Math.min(providerMargin, 100))} tone={providerMargin >= 60 ? "green" : "amber"} />
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

        <Panel title="Regras do centro de custo" eyebrow="como vamos cobrar" compact collapsible>
          <div className="space-y-2">
            <RuleCard
              icon={BrainCircuit}
              title="Gemini"
              text="Hoje entra como custo variavel de IA: texto, voz, transcricao e qualquer evento Gemini medido no uso dos agentes."
            />
            <RuleCard
              icon={Mic2}
              title="ElevenLabs"
              text="Hoje entra como custo variavel de voz: caracteres, requests e eventos de audio que forem registrados no consumo."
            />
            <RuleCard
              icon={ServerCog}
              title="Uazapi"
              text="Hoje entra como custo fixo: R$ 138 por mes para ate 100 dispositivos, rateado pelas instancias WhatsApp conectadas."
            />
            <RuleCard
              icon={Coins}
              title="Planos + creditos"
              text="A leitura compara pagamentos aprovados, creditos comprados, creditos consumidos, custo real e margem bruta."
            />
            <RuleCard
              icon={ReceiptText}
              title="Custos futuros"
              text="Vercel, Supabase, Cloudflare, storage, hospedagem e aquisicao ficam fora desta fase ate virarem custo real da operacao."
            />
          </div>
        </Panel>
      </div>

      <BillingCommercialConfig catalog={commercialCatalog} />
    </ConnectyShell>
  );
}

function CommercialSalesPanel({ summary }: { summary: BillingAdminSummary }) {
  const commerce = summary.commerce;

  return (
    <Panel
      className="mb-4"
      title="Vendas por origem"
      eyebrow="checkout / produtos / comissao"
      compact
      action={
        <div className="flex flex-wrap gap-2">
          <NeonBadge tone={commerce.schemaReady ? "green" : "amber"}>
            {commerce.schemaReady ? "Fluxo comercial pronto" : "Aguardando SQL comercial"}
          </NeonBadge>
          <NeonBadge tone="cyan">{formatNumber(commerce.approvedPayments)} aprovados</NeonBadge>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <CommercialMetric
          icon={ReceiptText}
          label="Total aprovado"
          value={formatMoney(commerce.grossAmount)}
          detail="Pagamentos confirmados no periodo"
          tone="cyan"
        />
        <CommercialMetric
          icon={UserRound}
          label="Produto do cliente"
          value={formatMoney(commerce.clientDirectGross)}
          detail="Valor que pertence ao cliente"
          tone="green"
        />
        <CommercialMetric
          icon={BadgePercent}
          label="Revenda ConnectyHub"
          value={formatMoney(commerce.connectyHubResaleGross)}
          detail={`${formatMoney(commerce.commissionPayable)} em comissao aberta`}
          tone="amber"
        />
        <CommercialMetric
          icon={PackageCheck}
          label="Venda direta CH"
          value={formatMoney(commerce.connectyHubDirectGross)}
          detail="Produto nosso sem comissao"
          tone="violet"
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-emerald-500" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Separacao financeira</p>
          </div>
          <div className="grid gap-2">
            <ProviderValue label="Receita ConnectyHub" value={formatMoney(commerce.connectyHubGrossRevenue)} />
            <ProviderValue label="Receita clientes" value={formatMoney(commerce.clientGrossRevenue)} />
            <ProviderValue label="Comissao gerada" value={formatMoney(commerce.commissionAccrued)} />
            <ProviderValue label="Liquido ConnectyHub" value={formatMoney(commerce.netConnectyHubRevenue)} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            Revenda gera comissao para o cliente. Venda direta ConnectyHub fica como receita nossa sem repasse de afiliado.
          </p>
        </div>

        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          {commerce.flows.length > 0 ? (
            <DataTable
              columns={["Origem", "Bruto", "Receita CH", "Comissao", "Liquido CH"]}
              rows={commerce.flows.map((flow) => [
                <span key="label" className="font-semibold" style={{ color: "var(--ch-text)" }}>{flow.label}</span>,
                <span key="gross" className="font-mono text-slate-300">{formatMoney(flow.grossAmount)}</span>,
                <span key="revenue" className="font-mono text-slate-300">{formatMoney(flow.connectyHubRevenue)}</span>,
                <span key="commission" className="font-mono text-amber-300">{formatMoney(flow.commissionAmount)}</span>,
                <span key="net" className="font-mono text-emerald-300">{formatMoney(flow.netConnectyHubRevenue)}</span>,
              ])}
            />
          ) : (
            <div className="rounded-xl p-5 text-[13px] leading-6 text-slate-500" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              Ainda nao existem pagamentos aprovados no periodo. Quando os checkouts forem pagos, esta tabela separa produto do cliente, revenda ConnectyHub e venda direta ConnectyHub.
            </div>
          )}
        </div>
      </div>

      {commerce.warnings.length > 0 ? (
        <div
          className="mt-4 rounded-xl p-3 text-[12px] leading-5 text-amber-700"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}
        >
          {commerce.warnings.slice(0, 2).join(" ")}
        </div>
      ) : null}
    </Panel>
  );
}

function CurrentCostCenterPanel({ summary }: { summary: BillingAdminSummary }) {
  const current = summary.currentCostCenter;
  const fixedProvider = current.fixedProviders[0];
  const creditCostDetail = current.consumedCredits > 0
    ? `venda atual ${formatUnitMoney(current.creditUnitPriceBrl)}`
    : "aguardando consumo medido";

  return (
    <Panel
      className="mb-4"
      title="Centro de custos atual"
      eyebrow="Gemini / ElevenLabs / Uazapi"
      compact
      action={
        <div className="flex flex-wrap gap-2">
          <NeonBadge tone="cyan">{current.periodLabel}</NeonBadge>
          <NeonBadge tone="amber">MVP de custos reais</NeonBadge>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <BillingMetric
          icon={Calculator}
          label="Custo operacional"
          value={formatMoney(current.totalCostBrl)}
          detail={`${formatMoney(current.todayTotalCostBrl)} hoje`}
          tone="amber"
        />
        <BillingMetric
          icon={Banknote}
          label="Receita aprovada"
          value={formatMoney(current.approvedRevenueBrl)}
          detail={`${formatMoney(current.todayApprovedRevenueBrl)} hoje`}
          tone="green"
        />
        <BillingMetric
          icon={Coins}
          label="Creditos comprados"
          value={formatCredits(current.purchasedCredits)}
          detail={`${formatCredits(current.todayPurchasedCredits)} hoje / ${formatCredits(current.consumedCredits)} consumidos`}
          tone="cyan"
        />
        <BillingMetric
          icon={Gauge}
          label="Custo real/credito"
          value={formatUnitMoney(current.realCostPerConsumedCreditBrl)}
          detail={creditCostDetail}
          tone={current.realCostPerConsumedCreditBrl > current.creditUnitPriceBrl ? "amber" : "violet"}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-cyan-500" />
              <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Uazapi</p>
            </div>
            <StatusBadge status={current.activeConnectedWhatsappInstances > 0 ? "online" : "idle"} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <ProviderValue label="Custo mensal" value={formatMoney(fixedProvider?.monthlyCostBrl ?? 0)} />
            <ProviderValue label="Capacidade" value={`${formatNumber(fixedProvider?.capacityUnits ?? 0)} dispositivos`} />
            <ProviderValue label="Instancias conectadas" value={formatNumber(current.activeConnectedWhatsappInstances)} />
            <ProviderValue label="Empresas com WhatsApp" value={formatNumber(current.activeWhatsappOrganizations)} />
            <ProviderValue label="Custo planejado/unidade" value={formatMoney(fixedProvider?.plannedCostPerUnitBrl ?? 0)} />
            <ProviderValue label="Custo real/unidade ativa" value={formatMoney(fixedProvider?.effectiveCostPerUnitBrl ?? 0)} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            {fixedProvider?.allocationLabel ?? "Custo fixo de WhatsApp ainda sem instancia conectada."}
          </p>
        </div>

        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Leitura de margem</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {current.scopeLabel}
              </p>
            </div>
            <NeonBadge tone={current.grossProfitBrl >= 0 ? "green" : "amber"}>
              {formatPercent(current.grossMarginPercent)} margem
            </NeonBadge>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <ProviderValue label="Custo variavel" value={formatMoney(current.variableCostBrl)} />
            <ProviderValue label="Custo fixo" value={formatMoney(current.fixedCostBrl)} />
            <ProviderValue label="Lucro bruto" value={formatMoney(current.grossProfitBrl)} />
            <ProviderValue label="Receita dos creditos" value={formatMoney(current.creditRevenueBrl)} />
            <ProviderValue label="Preco sugerido 60%" value={formatUnitMoney(current.suggestedCreditPrice60MarginBrl)} />
            <ProviderValue label="Preco sugerido 70%" value={formatUnitMoney(current.suggestedCreditPrice70MarginBrl)} />
            <ProviderValue label="Hoje custo IA" value={formatMoney(current.todayVariableCostBrl)} />
            <ProviderValue label="Hoje lucro bruto" value={formatMoney(current.todayGrossProfitBrl)} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-cyan-500" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Fornecedores atuais</p>
          </div>
          <DataTable
            columns={["Fornecedor", "Custo", "Creditos", "Receita", "Margem"]}
            rows={current.providers.map((provider) => [
              <span key="provider" className="font-semibold" style={{ color: "var(--ch-text)" }}>{provider.label}</span>,
              <span key="cost" className="font-mono text-amber-300">{formatMoney(provider.totalCostBrl)}</span>,
              <span key="credits" className="font-mono text-slate-300">{formatCredits(provider.chargeCredits)}</span>,
              <span key="revenue" className="font-mono text-emerald-300">{formatMoney(provider.creditRevenueBrl)}</span>,
              <span key="margin" className="font-mono text-slate-300">{formatMoney(provider.marginBrl)}</span>,
            ])}
          />
        </div>

        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-emerald-500" />
            <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Clientes por custo</p>
          </div>
          {current.customers.length > 0 ? (
            <DataTable
              columns={["Cliente", "Receita", "Custo", "Creditos", "Margem"]}
              rows={current.customers.map((customer) => [
                <span key="customer" className="font-semibold" style={{ color: "var(--ch-text)" }}>
                  {customer.name}
                </span>,
                <span key="revenue" className="font-mono text-emerald-300">{formatMoney(customer.revenueBrl)}</span>,
                <span key="cost" className="font-mono text-amber-300">{formatMoney(customer.totalCostBrl)}</span>,
                <span key="credits" className="font-mono text-slate-300">{formatCredits(customer.chargeCredits)}</span>,
                <span key="margin" className="font-mono text-slate-300">{formatMoney(customer.marginBrl)}</span>,
              ])}
            />
          ) : (
            <div
              className="rounded-xl p-5 text-[13px] leading-6 text-slate-500"
              style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
            >
              Nenhum cliente teve pagamento, consumo ou instancia WhatsApp conectada no periodo.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function SupplierTariffsPanel({
  catalog,
  summary,
}: {
  catalog: BillingCommercialCatalog;
  summary: BillingAdminSummary;
}) {
  const fixedProvider = summary.currentCostCenter.fixedProviders[0];
  const creditUnitPrice = summary.currentCostCenter.creditUnitPriceBrl;
  const sortedRates = [...catalog.rates].sort((a, b) => {
    const providerCompare = a.providerLabel.localeCompare(b.providerLabel, "pt-BR");

    if (providerCompare !== 0) {
      return providerCompare;
    }

    return `${a.featureName}${a.modelName ?? ""}`.localeCompare(`${b.featureName}${b.modelName ?? ""}`, "pt-BR");
  });
  const rows = [
    [
      <TariffName key="provider" title="Uazapi" detail="Fornecedor fixo WhatsApp" muted={!fixedProvider} />,
      <TariffName key="model" title="WhatsApp conectado" detail="ate 100 dispositivos no plano atual" />,
      <span key="unit" className="font-mono text-slate-300">instancia/mes</span>,
      <TariffName
        key="cost"
        title={formatMoney(fixedProvider?.monthlyCostBrl ?? 0)}
        detail={`${formatMoney(fixedProvider?.plannedCostPerUnitBrl ?? 0)} planejado por dispositivo`}
      />,
      <span key="cost1k" className="font-mono text-slate-500">-</span>,
      <span key="cost1m" className="font-mono text-slate-500">-</span>,
      <TariffName key="price" title="custo fixo" detail="nao debita credito por unidade" />,
      <span key="minimum" className="font-mono text-slate-500">-</span>,
      <span key="margin" className="font-mono text-slate-500">rateio</span>,
    ],
    ...sortedRates.map((rate) => {
      const priceBrl = rate.connectyPricePerUnit * creditUnitPrice;
      const marginPercent = getRateMarginPercent(rate.providerCostPerUnit, priceBrl);

      return [
        <TariffName
          key="provider"
          title={rate.providerLabel}
          detail={rate.active ? "ativa" : "inativa"}
          muted={!rate.active}
        />,
        <TariffName
          key="model"
          title={rate.modelName ?? rate.featureName}
          detail={rate.modelName ? rate.featureName : rate.featureCode}
        />,
        <span key="unit" className="font-mono text-slate-300">{formatUnit(rate.unit)}</span>,
        <span key="cost" className="font-mono text-amber-300">{formatUnitMoney(rate.providerCostPerUnit)}</span>,
        <span key="cost1k" className="font-mono text-slate-300">{formatScaledSupplierCost(rate.providerCostPerUnit, rate.unit, 1000)}</span>,
        <span key="cost1m" className="font-mono text-slate-300">{formatScaledSupplierCost(rate.providerCostPerUnit, rate.unit, 1000000)}</span>,
        <TariffName
          key="price"
          title={`${formatCredits(rate.connectyPricePerUnit)} cr/un`}
          detail={`~ ${formatUnitMoney(priceBrl)}`}
        />,
        <span key="minimum" className="font-mono text-slate-300">{formatCredits(rate.minimumChargeCredits)}</span>,
        <TariffName
          key="margin"
          title={marginPercent === null ? "sem custo" : formatPercent(marginPercent)}
          detail={rate.marginMultiplier ? `alvo ${formatNumber(rate.marginMultiplier)}x` : "sem alvo"}
        />,
      ];
    }),
  ];

  return (
    <Panel
      className="mb-4"
      title="Tarifas de fornecedores"
      eyebrow="preco base / creditos / margem"
      compact
      collapsible
      action={
        <div className="flex flex-wrap gap-2">
          <NeonBadge tone={catalog.schemaReady ? "green" : "amber"}>
            {catalog.schemaReady ? `${formatNumber(sortedRates.length)} tarifas` : "catalogo pendente"}
          </NeonBadge>
          <NeonBadge tone="cyan">1 credito = {formatUnitMoney(creditUnitPrice)}</NeonBadge>
        </div>
      }
    >
      <div
        className="mb-3 rounded-xl p-3 text-[12px] leading-5 text-slate-500"
        style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.18)" }}
      >
        Esta tabela mostra a regua de custo e preco que transforma consumo de fornecedores em creditos para o cliente.
        Gemini e ElevenLabs entram por unidade de uso. Uazapi entra como custo fixo mensal da operacao.
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <DataTable
            columns={["Fornecedor", "Modelo/Recurso", "Unidade", "Custo fornecedor", "Custo 1k", "Custo 1M", "Preco CH", "Min. cr", "Margem"]}
            rows={rows}
          />
        </div>
      ) : (
        <div
          className="rounded-xl p-5 text-[13px] leading-6 text-slate-500"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          Nenhuma tarifa foi encontrada no catalogo financeiro.
        </div>
      )}
    </Panel>
  );
}

function TariffName({
  title,
  detail,
  muted = false,
}: {
  title: string;
  detail?: string;
  muted?: boolean;
}) {
  return (
    <span className="block min-w-[130px]">
      <span className="block truncate font-semibold" style={{ color: muted ? "var(--ch-muted)" : "var(--ch-text)" }}>
        {title}
      </span>
      {detail ? <span className="mt-0.5 block truncate text-[10px] text-slate-500">{detail}</span> : null}
    </span>
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
      className="min-w-0 rounded-xl p-3"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <div
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[20px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function CommercialMetric({
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
      className="min-w-0 rounded-xl p-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <div
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[19px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function ProviderValue({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-2"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{value}</p>
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
      className="rounded-xl p-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-500" />
        <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      </div>
      <p className="text-[11px] leading-4 text-slate-500">{text}</p>
    </div>
  );
}

function getMarginPercent(providerCost: number, revenue: number) {
  if (revenue <= 0) {
    return 0;
  }

  return Math.round(((revenue - providerCost) / revenue) * 10000) / 100;
}

function getRateMarginPercent(providerCost: number, priceBrl: number) {
  if (providerCost <= 0 || priceBrl <= 0) {
    return null;
  }

  return Math.round(((priceBrl - providerCost) / priceBrl) * 10000) / 100;
}

function formatScaledSupplierCost(providerCostPerUnit: number, unit: string, scale: number) {
  if (!["input_token", "output_token", "character"].includes(unit)) {
    return "-";
  }

  return formatUnitMoney(providerCostPerUnit * scale);
}

function formatUnit(unit: string) {
  const labels: Record<string, string> = {
    input_token: "token entrada",
    output_token: "token saida",
    character: "caractere",
    credit: "credito",
    request: "request",
    minute: "minuto",
    megabyte: "MB",
    instance: "instancia",
    message: "mensagem",
    media: "midia",
    custom: "custom",
  };

  return labels[unit] ?? unit;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUnitMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}
