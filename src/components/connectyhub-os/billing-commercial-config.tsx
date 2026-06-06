"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  FlaskConical,
  Gauge,
  Mic2,
  PlayCircle,
  Save,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import type { BillingCatalogFeature, BillingCatalogRate, BillingCommercialCatalog } from "@/lib/billing/admin-catalog";
import { Panel, StatusBadge } from "./panel-primitives";

type RateDraft = {
  providerCostPerUnit: string;
  connectyPricePerUnit: string;
  marginMultiplier: string;
  minimumChargeCredits: string;
  active: boolean;
};

type FeatureAccessDraft = {
  includedInPlans: string[];
  enabled: boolean;
  billable: boolean;
};

type ActionState = {
  tone: "idle" | "success" | "error";
  message: string;
};

const DEFAULT_PLAN_OPTIONS = [
  { code: "trial", label: "Trial" },
  { code: "starter", label: "Starter" },
  { code: "pro", label: "Pro" },
  { code: "scale", label: "Scale" },
];

export function BillingCommercialConfig({ catalog }: { catalog: BillingCommercialCatalog }) {
  const router = useRouter();
  const [rates, setRates] = useState(catalog.rates);
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>(() => buildRateDrafts(catalog.rates));
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, FeatureAccessDraft>>(() => buildFeatureDrafts(catalog.features));
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(catalog.organizations[0]?.id ?? "");
  const [grantAmount, setGrantAmount] = useState("1000");
  const [grantDescription, setGrantDescription] = useState("Credito manual inicial");
  const [selectedRateId, setSelectedRateId] = useState(catalog.rates[0]?.id ?? "");
  const [inputUnits, setInputUnits] = useState("1200");
  const [outputUnits, setOutputUnits] = useState("450");
  const [providerCost, setProviderCost] = useState("0.35");
  const [chargeCredits, setChargeCredits] = useState("8");
  const [revenueEstimate, setRevenueEstimate] = useState("8");
  const [debitCredits, setDebitCredits] = useState(true);
  const [savingRateId, setSavingRateId] = useState<string | null>(null);
  const [savingAllRates, setSavingAllRates] = useState(false);
  const [savingFeatureId, setSavingFeatureId] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvancedRates, setShowAdvancedRates] = useState(false);
  const [state, setState] = useState<ActionState>({ tone: "idle", message: "" });

  const selectedRate = useMemo(
    () => rates.find((rate) => rate.id === selectedRateId) ?? rates[0] ?? null,
    [rates, selectedRateId],
  );
  const selectedOrganization = catalog.organizations.find((organization) => organization.id === selectedOrganizationId);
  const configuredRateCount = useMemo(() => countConfiguredDrafts(rates, rateDrafts), [rates, rateDrafts]);
  const providerGroups = useMemo(() => groupRatesByProvider(rates, rateDrafts), [rates, rateDrafts]);
  const planOptions = useMemo(() => buildPlanOptions(catalog), [catalog]);
  const elevenLabsFeatures = useMemo(
    () => catalog.features.filter((feature) => feature.provider === "elevenlabs"),
    [catalog.features],
  );
  const elevenLabsConfiguredCount = useMemo(
    () => countConfiguredFeatures(elevenLabsFeatures, featureDrafts),
    [elevenLabsFeatures, featureDrafts],
  );

  if (!catalog.schemaReady) {
    return (
      <Panel title="Configuracao comercial" eyebrow="schema pendente">
        <div
          className="rounded-xl p-4 text-[13px] leading-6 text-amber-700"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}
        >
          O catalogo comercial ainda nao pode ser carregado. Confira se a migration de billing foi aplicada no Supabase.
        </div>
      </Panel>
    );
  }

  async function saveRate(rate: BillingCatalogRate) {
    const draft = rateDrafts[rate.id];

    if (!draft) {
      return;
    }

    setSavingRateId(rate.id);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRatePayload(rate.id, draft)),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a tarifa.");
      }

      setRates((current) => current.map((item) => (item.id === rate.id ? applyDraftToRate(item, draft) : item)));
      setState({ tone: "success", message: "Tarifa salva com sucesso." });
      router.refresh();
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "Falha ao salvar tarifa." });
    } finally {
      setSavingRateId(null);
    }
  }

  async function saveAllRateDrafts() {
    if (rates.length === 0) {
      return;
    }

    setSavingAllRates(true);
    setState({ tone: "idle", message: "" });

    try {
      for (const rate of rates) {
        const draft = rateDrafts[rate.id];

        if (!draft) {
          continue;
        }

        const response = await fetch("/api/admin/billing/rates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRatePayload(rate.id, draft)),
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error ?? `Nao foi possivel salvar ${rate.featureName}.`);
        }
      }

      setRates((current) => current.map((rate) => applyDraftToRate(rate, rateDrafts[rate.id])));
      setState({
        tone: "success",
        message: "Configuracao inicial salva. Agora coloque creditos no cliente e lance um consumo teste.",
      });
      router.refresh();
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar as tarifas.",
      });
    } finally {
      setSavingAllRates(false);
    }
  }

  async function saveFeatureAccess(feature: BillingCatalogFeature) {
    const draft = featureDrafts[feature.id];

    if (!draft) {
      return;
    }

    setSavingFeatureId(feature.id);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureId: feature.id,
          includedInPlans: draft.includedInPlans,
          enabled: draft.enabled,
          billable: draft.billable,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a ferramenta.");
      }

      setState({ tone: "success", message: "Ferramenta liberada por plano com sucesso." });
      router.refresh();
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "Falha ao salvar ferramenta." });
    } finally {
      setSavingFeatureId(null);
    }
  }

  function applyStarterPreset() {
    setRateDrafts(buildStarterDrafts(rates));
    setGrantAmount("1000");
    setGrantDescription("Credito manual inicial para teste MVP");
    setProviderCost("0.35");
    setChargeCredits("8");
    setRevenueEstimate("8");
    setInputUnits("1200");
    setOutputUnits("450");
    setDebitCredits(true);
    setState({
      tone: "success",
      message: "Valores de MVP preenchidos. Revise se quiser e clique em Salvar todas as tarifas.",
    });
  }

  async function grantOrganizationCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGranting(true);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrganizationId,
          amountCredits: Number(grantAmount),
          description: grantDescription,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel conceder creditos.");
      }

      setState({ tone: "success", message: "Creditos adicionados a carteira da empresa." });
      router.refresh();
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "Falha ao conceder creditos." });
    } finally {
      setGranting(false);
    }
  }

  async function createTestEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRate) {
      setState({ tone: "error", message: "Escolha uma tarifa para testar." });
      return;
    }

    setTesting(true);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/test-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrganizationId,
          provider: selectedRate.provider,
          featureCode: selectedRate.featureCode,
          modelId: selectedRate.modelId,
          inputUnits: Number(inputUnits),
          outputUnits: Number(outputUnits),
          providerCost: Number(providerCost),
          connectyChargeCredits: Number(chargeCredits),
          connectyRevenueEstimate: Number(revenueEstimate || chargeCredits),
          debitCredits,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel criar o consumo teste.");
      }

      setState({ tone: "success", message: "Consumo teste registrado. O painel ja pode mostrar custo, receita e margem." });
      router.refresh();
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "Falha ao registrar consumo teste." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      {state.message && (
        <div
          className="rounded-2xl px-4 py-3 text-[13px] font-medium"
          style={{
            background: state.tone === "success" ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.08)",
            border: state.tone === "success" ? "1px solid rgba(16,185,129,0.24)" : "1px solid rgba(244,63,94,0.2)",
            color: state.tone === "success" ? "#047857" : "#be123c",
          }}
        >
          {state.message}
        </div>
      )}

      <Panel
        title="Comece por aqui"
        eyebrow="configuracao simples"
        action={<StatusBadge status={configuredRateCount === rates.length ? "online" : "warning"} label={`${configuredRateCount}/${rates.length} prontas`} />}
      >
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-cyan-500" />
                  <p className="text-[15px] font-semibold" style={{ color: "var(--ch-text)" }}>
                    Modo MVP recomendado
                  </p>
                </div>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">
                  Para comecar, nao tente calcular o preco oficial de cada token. Use uma regua comercial temporaria:
                  creditos para o cliente, margem 5x e custo real sendo ajustado depois pelos eventos de uso.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyStarterPreset}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white transition hover:opacity-90"
                  style={{ background: "#01004c" }}
                >
                  <Wand2 className="h-4 w-4" />
                  Aplicar MVP
                </button>
                <button
                  type="button"
                  disabled={savingAllRates || rates.length === 0}
                  onClick={saveAllRateDrafts}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white transition disabled:opacity-50"
                  style={{ background: "#06b6d4" }}
                >
                  <Save className="h-4 w-4" />
                  {savingAllRates ? "Salvando" : "Salvar todas"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <GuidedCard
                icon={<Gauge className="h-4 w-4 text-cyan-500" />}
                title="O que preencher?"
                text="Clique em Aplicar MVP. Ele preenche preco por unidade, minimo de cobranca e margem inicial."
              />
              <GuidedCard
                icon={<Coins className="h-4 w-4 text-emerald-500" />}
                title="O que o cliente compra?"
                text="Ele compra creditos dentro da ConnectyHub. Os agentes consomem esses creditos."
              />
              <GuidedCard
                icon={<PlayCircle className="h-4 w-4 text-violet-500" />}
                title="Como testar?"
                text="Depois salve, adicione 1000 creditos ao cliente e lance um consumo teste."
              />
            </div>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(1,0,76,0.04)", border: "1px solid rgba(1,0,76,0.12)" }}
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">proximo clique</p>
            <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
              Sequencia segura
            </p>
            <ol className="mt-3 space-y-2 text-[12px] leading-5 text-slate-500">
              <li>1. Aplicar MVP.</li>
              <li>2. Salvar todas as tarifas.</li>
              <li>3. Adicionar creditos ao cliente.</li>
              <li>4. Lancar consumo teste.</li>
            </ol>
            <p className="mt-4 rounded-lg p-3 text-[11px] leading-5 text-slate-500" style={{ background: "var(--ch-surface)" }}>
              Estes valores sao para operar o MVP. Quando tivermos billing real de Gemini e ElevenLabs,
              ajustamos a tabela com custo oficial e margem por plano.
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Ferramentas ElevenLabs por plano"
        eyebrow="painel do cliente / voz"
        action={
          <StatusBadge
            status={elevenLabsFeatures.length > 0 && elevenLabsConfiguredCount === elevenLabsFeatures.length ? "online" : "warning"}
            label={`${elevenLabsConfiguredCount}/${elevenLabsFeatures.length} liberadas`}
          />
        }
      >
        <div
          className="mb-4 rounded-xl p-4"
          style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.18)" }}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                A manutencao conecta apenas o token. Aqui voce decide o produto vendido.
              </p>
              <p className="mt-1 text-[12px] leading-5 text-slate-500">
                Use estes controles para definir quais planos enxergam voz no WhatsApp, biblioteca de vozes,
                clonagem autorizada e ferramentas avancadas no painel do usuario.
              </p>
            </div>
          </div>
        </div>

        {elevenLabsFeatures.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {elevenLabsFeatures.map((feature) => {
              const draft = featureDrafts[feature.id] ?? buildFeatureDraft(feature);

              return (
                <div
                  key={feature.id}
                  className="rounded-xl p-4"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Mic2 className="h-4 w-4 text-violet-500" />
                        <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                          {feature.name}
                        </p>
                      </div>
                      <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-500">
                        {feature.description ?? "Ferramenta de audio liberada conforme plano do cliente."}
                      </p>
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                        {feature.featureCode} / {formatUnit(feature.unit)}
                      </p>
                    </div>
                    <StatusBadge status={draft.enabled && draft.includedInPlans.length > 0 ? "online" : "warning"} />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ToggleRow
                      checked={draft.enabled}
                      label="Ativa no produto"
                      text="Aparece no painel do usuario quando o plano permitir."
                      onChange={(checked) => updateFeatureDraft(feature.id, { enabled: checked })}
                    />
                    <ToggleRow
                      checked={draft.billable}
                      label="Cobrar creditos"
                      text="Consumo entra no centro de custo e carteira do cliente."
                      onChange={(checked) => updateFeatureDraft(feature.id, { billable: checked })}
                    />
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                      Liberar nos planos
                    </p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {planOptions.map((plan) => {
                        const checked = draft.includedInPlans.includes(plan.code);

                        return (
                          <label
                            key={plan.code}
                            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition"
                            style={{
                              background: checked ? "rgba(1,0,76,0.08)" : "var(--ch-surface)",
                              border: checked ? "1px solid rgba(1,0,76,0.26)" : "1px solid var(--ch-border)",
                              color: checked ? "#01004c" : "var(--ch-muted)",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => updateFeaturePlan(feature.id, plan.code, event.target.checked)}
                            />
                            {plan.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={savingFeatureId === feature.id}
                      onClick={() => saveFeatureAccess(feature)}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white transition disabled:opacity-50"
                      style={{ background: "#01004c" }}
                    >
                      <Save className="h-4 w-4" />
                      {savingFeatureId === feature.id ? "Salvando" : "Salvar liberacao"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="rounded-xl p-5 text-[13px] leading-6 text-slate-500"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            Nenhuma ferramenta ElevenLabs foi encontrada no catalogo financeiro. Rode a seed do centro de custo para liberar esta configuracao.
          </div>
        )}
      </Panel>

      <Panel
        title="Tarifas avancadas"
        eyebrow="opcional / ajuste fino"
        action={
          <button
            type="button"
            onClick={() => setShowAdvancedRates((current) => !current)}
            className="flex h-8 items-center gap-2 rounded-xl px-3 font-mono text-[10px] uppercase tracking-wide transition hover:opacity-80"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
          >
            {showAdvancedRates ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showAdvancedRates ? "Ocultar" : "Ver campos"}
          </button>
        }
      >
        {!showAdvancedRates ? (
          <div className="grid gap-3 md:grid-cols-2">
            {providerGroups.length > 0 ? (
              providerGroups.map((group) => (
                <div
                  key={group.provider}
                  className="rounded-xl p-4"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{group.label}</p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        {group.configured}/{group.total} tarifas com preco inicial.
                      </p>
                    </div>
                    <StatusBadge status={group.configured === group.total ? "online" : "warning"} />
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-slate-500">
                    Use os campos avancados apenas para revisar custo por unidade, preco por unidade e minimo de cobranca.
                  </p>
                </div>
              ))
            ) : (
              <div
                className="rounded-xl p-4 text-[13px] text-slate-500"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                Nenhuma tarifa encontrada no catalogo.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rates.map((rate) => {
              const draft = rateDrafts[rate.id];

              return (
                <div
                  key={rate.id}
                  className="rounded-xl p-4"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                        {rate.providerLabel}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        {rate.featureName}
                        {rate.modelName ? ` / ${rate.modelName}` : ""} / {formatUnit(rate.unit)}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      <input
                        type="checkbox"
                        checked={draft?.active ?? true}
                        onChange={(event) => updateRateDraft(rate.id, { active: event.target.checked })}
                      />
                      ativa
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-5">
                    <MoneyInput
                      label="Custo provedor R$"
                      value={draft?.providerCostPerUnit ?? "0"}
                      onChange={(value) => updateRateDraft(rate.id, { providerCostPerUnit: value })}
                      step="0.000001"
                    />
                    <MoneyInput
                      label="Preco Connecty"
                      value={draft?.connectyPricePerUnit ?? "0"}
                      onChange={(value) => updateRateDraft(rate.id, { connectyPricePerUnit: value })}
                      step="0.000001"
                    />
                    <MoneyInput
                      label="Margem alvo"
                      value={draft?.marginMultiplier ?? ""}
                      onChange={(value) => updateRateDraft(rate.id, { marginMultiplier: value })}
                      step="0.1"
                    />
                    <MoneyInput
                      label="Min. por uso"
                      value={draft?.minimumChargeCredits ?? "0"}
                      onChange={(value) => updateRateDraft(rate.id, { minimumChargeCredits: value })}
                      step="0.000001"
                    />
                    <button
                      type="button"
                      disabled={savingRateId === rate.id}
                      onClick={() => saveRate(rate)}
                      className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition disabled:opacity-50"
                      style={{ background: "var(--ch-accent)", color: "#ffffff" }}
                    >
                      <Save className="h-4 w-4" />
                      {savingRateId === rate.id ? "Salvando" : "Salvar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Coloque creditos no cliente" eyebrow="carteira de teste">
          <form className="space-y-4" onSubmit={grantOrganizationCredits}>
            <FieldLabel label="Empresa">
              <select
                value={selectedOrganizationId}
                onChange={(event) => setSelectedOrganizationId(event.target.value)}
                className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              >
                {catalog.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name} / {organization.planCode} / {formatCredits(organization.balanceCredits)} creditos
                  </option>
                ))}
              </select>
            </FieldLabel>

            {selectedOrganization && (
              <div
                className="grid gap-3 rounded-xl p-4 sm:grid-cols-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <MiniStat label="Saldo" value={formatCredits(selectedOrganization.balanceCredits)} />
                <MiniStat label="Comprados" value={formatCredits(selectedOrganization.lifetimePurchasedCredits)} />
                <MiniStat label="Usados" value={formatCredits(selectedOrganization.lifetimeUsedCredits)} />
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-[180px_1fr]">
              <MoneyInput label="Creditos" value={grantAmount} onChange={setGrantAmount} step="1" />
              <FieldLabel label="Descricao">
                <input
                  value={grantDescription}
                  onChange={(event) => setGrantDescription(event.target.value)}
                  className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
                />
              </FieldLabel>
            </div>

            <button
              type="submit"
              disabled={!selectedOrganizationId || granting}
              className="flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white transition disabled:opacity-50"
              style={{ background: "#01004c" }}
            >
              <Coins className="h-4 w-4" />
              {granting ? "Creditando" : "Adicionar creditos"}
            </button>
          </form>
        </Panel>

        <Panel title="Lance um consumo teste" eyebrow="simulador rapido">
          <form className="space-y-4" onSubmit={createTestEvent}>
            <FieldLabel label="Tarifa base">
              <select
                value={selectedRateId}
                onChange={(event) => setSelectedRateId(event.target.value)}
                className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              >
                {rates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.providerLabel} / {rate.featureName}{rate.modelName ? ` / ${rate.modelName}` : ""}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <div className="grid gap-3 md:grid-cols-2">
              <MoneyInput label="Input units" value={inputUnits} onChange={setInputUnits} step="1" />
              <MoneyInput label="Output units" value={outputUnits} onChange={setOutputUnits} step="1" />
              <MoneyInput label="Custo provedor R$" value={providerCost} onChange={setProviderCost} step="0.01" />
              <MoneyInput label="Cobrar creditos" value={chargeCredits} onChange={setChargeCredits} step="0.01" />
              <MoneyInput label="Receita estimada R$" value={revenueEstimate} onChange={setRevenueEstimate} step="0.01" />
              <label
                className="mt-5 flex h-10 items-center gap-2 rounded-xl px-3 text-[12px]"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              >
                <input
                  type="checkbox"
                  checked={debitCredits}
                  onChange={(event) => setDebitCredits(event.target.checked)}
                />
                Debitar carteira
              </label>
            </div>

            <button
              type="submit"
              disabled={!selectedOrganizationId || !selectedRate || testing}
              className="flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white transition disabled:opacity-50"
              style={{ background: "#06b6d4" }}
            >
              <FlaskConical className="h-4 w-4" />
              {testing ? "Lancando" : "Lancar consumo teste"}
            </button>
          </form>
        </Panel>
      </div>

      <Panel title="Como usar agora" eyebrow="fluxo financeiro">
        <div className="grid gap-3 md:grid-cols-3">
          <StepCard title="1. Aplique o MVP" text="Preencha uma regua inicial de creditos sem depender do preco oficial de cada provedor." />
          <StepCard title="2. Salve e credite" text="Salve as tarifas e coloque creditos na empresa usada para teste." />
          <StepCard title="3. Lance consumo" text="Crie um evento teste para ver custo, receita, margem e debito aparecendo no painel." />
        </div>
      </Panel>
    </div>
  );

  function updateRateDraft(rateId: string, patch: Partial<RateDraft>) {
    setRateDrafts((current) => ({
      ...current,
      [rateId]: {
        ...current[rateId],
        ...patch,
      },
    }));
  }

  function updateFeatureDraft(featureId: string, patch: Partial<FeatureAccessDraft>) {
    setFeatureDrafts((current) => ({
      ...current,
      [featureId]: {
        ...current[featureId],
        ...patch,
      },
    }));
  }

  function updateFeaturePlan(featureId: string, planCode: string, enabled: boolean) {
    setFeatureDrafts((current) => {
      const draft = current[featureId];

      if (!draft) {
        return current;
      }

      const includedInPlans = enabled
        ? Array.from(new Set([...draft.includedInPlans, planCode]))
        : draft.includedInPlans.filter((plan) => plan !== planCode);

      return {
        ...current,
        [featureId]: {
          ...draft,
          includedInPlans,
        },
      };
    });
  }
}

function MoneyInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
}) {
  return (
    <FieldLabel label={label}>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl px-3 font-mono text-[13px] outline-none"
        style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
      />
    </FieldLabel>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-[16px] font-bold" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function GuidedCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      </div>
      <p className="text-[12px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  text,
  onChange,
}: {
  checked: boolean;
  label: string;
  text: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-xl p-3"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function StepCard({ title, text }: { title: string; text: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      </div>
      <p className="text-[12px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function buildRateDrafts(rates: BillingCatalogRate[]) {
  return rates.reduce<Record<string, RateDraft>>((drafts, rate) => {
    drafts[rate.id] = {
      providerCostPerUnit: String(rate.providerCostPerUnit),
      connectyPricePerUnit: String(rate.connectyPricePerUnit),
      marginMultiplier: rate.marginMultiplier === null ? "" : String(rate.marginMultiplier),
      minimumChargeCredits: String(rate.minimumChargeCredits),
      active: rate.active,
    };
    return drafts;
  }, {});
}

function buildFeatureDrafts(features: BillingCatalogFeature[]) {
  return features.reduce<Record<string, FeatureAccessDraft>>((drafts, feature) => {
    drafts[feature.id] = buildFeatureDraft(feature);
    return drafts;
  }, {});
}

function buildFeatureDraft(feature: BillingCatalogFeature): FeatureAccessDraft {
  return {
    includedInPlans: feature.includedInPlans,
    enabled: feature.enabled,
    billable: feature.billable,
  };
}

function buildStarterDrafts(rates: BillingCatalogRate[]) {
  return rates.reduce<Record<string, RateDraft>>((drafts, rate) => {
    drafts[rate.id] = buildStarterDraft(rate);
    return drafts;
  }, {});
}

function buildStarterDraft(rate: BillingCatalogRate): RateDraft {
  return {
    providerCostPerUnit: "0",
    connectyPricePerUnit: trimNumber(getStarterUnitPrice(rate)),
    marginMultiplier: "5",
    minimumChargeCredits: trimNumber(getStarterMinimumCharge(rate)),
    active: true,
  };
}

function getStarterUnitPrice(rate: BillingCatalogRate) {
  if (rate.provider === "gemini") {
    if (rate.featureCode === "embedding_memory") {
      return 0.00005;
    }

    return rate.unit === "input_token" ? 0.00015 : 0.0006;
  }

  if (rate.provider === "elevenlabs") {
    return rate.unit === "character" ? 0.006 : 6;
  }

  return 0.1;
}

function getStarterMinimumCharge(rate: BillingCatalogRate) {
  if (rate.provider === "elevenlabs" && rate.unit === "request") {
    return rate.featureCode === "voice_clone" ? 25 : 5;
  }

  if (rate.provider === "gemini") {
    return 1;
  }

  return 2;
}

function buildRatePayload(rateId: string, draft: RateDraft) {
  return {
    rateId,
    providerCostPerUnit: Number(draft.providerCostPerUnit),
    connectyPricePerUnit: Number(draft.connectyPricePerUnit),
    marginMultiplier: draft.marginMultiplier ? Number(draft.marginMultiplier) : null,
    minimumChargeCredits: Number(draft.minimumChargeCredits),
    active: draft.active,
  };
}

function applyDraftToRate(rate: BillingCatalogRate, draft?: RateDraft): BillingCatalogRate {
  if (!draft) {
    return rate;
  }

  return {
    ...rate,
    providerCostPerUnit: Number(draft.providerCostPerUnit),
    connectyPricePerUnit: Number(draft.connectyPricePerUnit),
    marginMultiplier: draft.marginMultiplier ? Number(draft.marginMultiplier) : null,
    minimumChargeCredits: Number(draft.minimumChargeCredits),
    active: draft.active,
  };
}

function countConfiguredDrafts(rates: BillingCatalogRate[], drafts: Record<string, RateDraft>) {
  return rates.filter((rate) => {
    const draft = drafts[rate.id];
    return draft ? Number(draft.connectyPricePerUnit) > 0 || Number(draft.minimumChargeCredits) > 0 : false;
  }).length;
}

function groupRatesByProvider(rates: BillingCatalogRate[], drafts: Record<string, RateDraft>) {
  const groups = new Map<string, { provider: string; label: string; total: number; configured: number }>();

  for (const rate of rates) {
    const provider = String(rate.provider);
    const current = groups.get(provider) ?? {
      provider,
      label: rate.providerLabel,
      total: 0,
      configured: 0,
    };
    const draft = drafts[rate.id];

    current.total += 1;
    current.configured += draft && (Number(draft.connectyPricePerUnit) > 0 || Number(draft.minimumChargeCredits) > 0) ? 1 : 0;
    groups.set(provider, current);
  }

  return Array.from(groups.values());
}

function countConfiguredFeatures(features: BillingCatalogFeature[], drafts: Record<string, FeatureAccessDraft>) {
  return features.filter((feature) => {
    const draft = drafts[feature.id];
    return draft ? draft.enabled && draft.includedInPlans.length > 0 : false;
  }).length;
}

function buildPlanOptions(catalog: BillingCommercialCatalog) {
  const knownPlans = new Set(DEFAULT_PLAN_OPTIONS.map((plan) => plan.code));
  const extraPlans = new Set<string>();

  for (const organization of catalog.organizations) {
    if (!knownPlans.has(organization.planCode)) {
      extraPlans.add(organization.planCode);
    }
  }

  for (const feature of catalog.features) {
    for (const planCode of feature.includedInPlans) {
      if (!knownPlans.has(planCode)) {
        extraPlans.add(planCode);
      }
    }
  }

  return [
    ...DEFAULT_PLAN_OPTIONS,
    ...Array.from(extraPlans)
      .sort((a, b) => a.localeCompare(b))
      .map((code) => ({ code, label: code })),
  ];
}

function formatUnit(unit: string) {
  const labels: Record<string, string> = {
    input_token: "input token",
    output_token: "output token",
    character: "caractere",
    request: "request",
    credit: "credito",
    minute: "minuto",
    message: "mensagem",
    media: "midia",
  };

  return labels[unit] ?? unit;
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function trimNumber(value: number) {
  return String(Number(value.toFixed(6)));
}
