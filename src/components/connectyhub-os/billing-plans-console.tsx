"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  Layers3,
  PackagePlus,
  Plus,
  Save,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import type { BillingPlan, BillingPlanCatalog, BillingPlanStatus } from "@/lib/billing/plans";
import { ConnectyShell } from "./connecty-shell";
import { NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";

type PlanDraft = {
  planId: string;
  planCode: string;
  name: string;
  shortDescription: string;
  status: BillingPlanStatus;
  sortOrder: string;
  highlighted: boolean;
  monthlyPriceBrl: string;
  includedCredits: string;
  overageCreditPriceBrl: string;
  autoRechargeMinCredits: string;
  overageLimitCredits: string;
  trialDays: string;
  agentLimit: string;
  whatsappInstanceLimit: string;
  userLimit: string;
  moduleCodes: string[];
  customModuleCode: string;
  mercadoPagoPreapprovalPlanId: string;
};

type ActionState = {
  tone: "idle" | "success" | "error";
  message: string;
};

const DEFAULT_MODULES = [
  { code: "whatsapp_agent", label: "Agente WhatsApp" },
  { code: "sales_catalog", label: "Catalogo de vendas" },
  { code: "crm_basic", label: "CRM basico" },
  { code: "automations", label: "Automacoes" },
  { code: "voice_ai", label: "Audio e voz" },
  { code: "api_whatsapp", label: "API WhatsApp" },
  { code: "reports", label: "Relatorios" },
  { code: "team_users", label: "Usuarios da equipe" },
];

export function BillingPlansConsole({
  catalog,
  userLabel = "CEO_HUMAN_ADM",
}: {
  catalog: BillingPlanCatalog;
  userLabel?: string;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState(catalog.plans);
  const [selectedPlanId, setSelectedPlanId] = useState(catalog.plans[0]?.id ?? "new");
  const selectedPlan = selectedPlanId === "new" ? null : plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const [draft, setDraft] = useState<PlanDraft>(() => createDraft(selectedPlan));
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ActionState>({ tone: "idle", message: "" });
  const metrics = useMemo(() => buildMetrics(plans), [plans]);
  const activeModuleOptions = useMemo(() => buildModuleOptions(plans, draft.moduleCodes), [plans, draft.moduleCodes]);

  function selectPlan(plan: BillingPlan | null) {
    setSelectedPlanId(plan?.id ?? "new");
    setDraft(createDraft(plan));
    setState({ tone: "idle", message: "" });
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setState({ tone: "idle", message: "" });

    try {
      const response = await fetch("/api/admin/billing/plans", {
        method: draft.planId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(draft)),
      });
      const data = (await response.json().catch(() => null)) as { plan?: BillingPlan; error?: string } | null;

      if (!response.ok || !data?.plan) {
        throw new Error(data?.error ?? "Nao foi possivel salvar o plano.");
      }

      const savedPlan = data.plan;

      setPlans((current) => upsertPlan(current, savedPlan));
      setSelectedPlanId(savedPlan.id);
      setDraft(createDraft(savedPlan));
      setState({ tone: "success", message: "Plano salvo. Agora ele ja pode ser usado como base de assinatura e creditos." });
      router.refresh();
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "Falha ao salvar plano." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel} activeHref="/admin/planos">
      <PageHeader
        eyebrow="Admin OS / Planos e cobranca"
        title="Planos da ConnectyHub"
        description="Configure mensalidade, creditos inclusos, excedentes e limites antes de ligar a assinatura automatica."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={catalog.schemaReady ? "green" : "amber"}>
              {catalog.schemaReady ? "Schema pronto" : "Aguardando SQL"}
            </NeonBadge>
            <NeonBadge tone="cyan">{formatMoney(metrics.activeRevenue)} MRR ativo</NeonBadge>
          </div>
        }
      />

      {!catalog.schemaReady ? (
        <Panel title="Migration pendente" eyebrow="supabase">
          <div
            className="rounded-xl p-4 text-[13px] leading-6 text-amber-200"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.24)" }}
          >
            A tabela de planos ainda nao esta disponivel. Aplique a migration de billing da plataforma no Supabase
            para liberar criacao e edicao dos planos.
          </div>
        </Panel>
      ) : (
        <div className="space-y-5">
          {state.message ? (
            <div
              className="rounded-2xl px-4 py-3 text-[13px] font-medium"
              style={{
                background: state.tone === "success" ? "rgba(16,185,129,0.10)" : "rgba(244,63,94,0.08)",
                border: state.tone === "success" ? "1px solid rgba(16,185,129,0.24)" : "1px solid rgba(244,63,94,0.22)",
                color: state.tone === "success" ? "#86efac" : "#fda4af",
              }}
            >
              {state.message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PlanMetric icon={Layers3} label="Planos" value={String(metrics.total)} detail={`${metrics.active} ativos`} />
            <PlanMetric icon={WalletCards} label="Creditos inclusos" value={formatCredits(metrics.includedCredits)} detail="somando planos ativos" />
            <PlanMetric icon={CreditCard} label="Excedente medio" value={formatMoney(metrics.averageOveragePrice)} detail="por credito extra" />
            <PlanMetric icon={CalendarDays} label="Trial" value={`${metrics.maxTrialDays} dias`} detail="maior periodo configurado" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[430px_1fr]">
            <Panel
              title="Catalogo de planos"
              eyebrow="oferta comercial"
              action={
                <button
                  type="button"
                  onClick={() => selectPlan(null)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[10px] font-bold uppercase tracking-wide transition hover:opacity-90"
                  style={{ background: "var(--ch-accent)", color: "#061015" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo
                </button>
              }
            >
              <div className="space-y-3">
                {plans.length > 0 ? (
                  plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => selectPlan(plan)}
                      className="block w-full rounded-xl p-4 text-left transition hover:opacity-90"
                      style={{
                        background: selectedPlanId === plan.id ? "rgba(var(--ch-accent-rgb),0.14)" : "var(--ch-surface-2)",
                        border: selectedPlanId === plan.id ? "1px solid rgba(var(--ch-accent-rgb),0.44)" : "1px solid var(--ch-border)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                              {plan.name}
                            </p>
                            {plan.highlighted ? <NeonBadge tone="amber">destaque</NeonBadge> : null}
                          </div>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                            {plan.planCode}
                          </p>
                        </div>
                        <StatusBadge status={plan.status === "active" ? "online" : plan.status === "draft" ? "warning" : "idle"} label={plan.status} />
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <MiniValue label="Mensal" value={formatMoney(plan.monthlyPriceBrl)} />
                        <MiniValue label="Creditos" value={formatCredits(plan.includedCredits)} />
                        <MiniValue label="Extra" value={formatMoney(plan.overageCreditPriceBrl)} />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl p-4 text-[13px] leading-6 text-slate-400" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
                    Nenhum plano cadastrado ainda. Crie o primeiro plano para testar assinatura, creditos e excedente.
                  </div>
                )}
              </div>
            </Panel>

            <Panel
              title={draft.planId ? "Editar plano" : "Novo plano"}
              eyebrow="assinatura / creditos / limites"
              action={<StatusBadge status={draft.status === "active" ? "online" : draft.status === "draft" ? "warning" : "idle"} label={draft.status} />}
            >
              <form className="space-y-5" onSubmit={savePlan}>
                <div className="grid gap-3 md:grid-cols-[180px_1fr_170px]">
                  <Field label="Codigo">
                    <input
                      value={draft.planCode}
                      onChange={(event) => updateDraft({ planCode: event.target.value })}
                      className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Nome">
                    <input
                      value={draft.name}
                      onChange={(event) => updateDraft({ name: event.target.value })}
                      className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      value={draft.status}
                      onChange={(event) => updateDraft({ status: event.target.value as BillingPlanStatus })}
                      className="h-10 w-full rounded-xl px-3 text-[13px] outline-none"
                      style={inputStyle}
                    >
                      <option value="draft">Rascunho</option>
                      <option value="active">Ativo</option>
                      <option value="archived">Arquivado</option>
                    </select>
                  </Field>
                </div>

                <Field label="Descricao curta">
                  <textarea
                    value={draft.shortDescription}
                    onChange={(event) => updateDraft({ shortDescription: event.target.value })}
                    className="min-h-[76px] w-full resize-y rounded-xl px-3 py-3 text-[13px] leading-5 outline-none"
                    style={inputStyle}
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-4">
                  <NumberField label="Mensalidade R$" value={draft.monthlyPriceBrl} onChange={(value) => updateDraft({ monthlyPriceBrl: value })} step="0.01" />
                  <NumberField label="Creditos inclusos" value={draft.includedCredits} onChange={(value) => updateDraft({ includedCredits: value })} step="1" />
                  <NumberField label="Credito excedente R$" value={draft.overageCreditPriceBrl} onChange={(value) => updateDraft({ overageCreditPriceBrl: value })} step="0.01" />
                  <NumberField label="Limite excedente" value={draft.overageLimitCredits} onChange={(value) => updateDraft({ overageLimitCredits: value })} step="1" />
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  <NumberField label="Recarga minima" value={draft.autoRechargeMinCredits} onChange={(value) => updateDraft({ autoRechargeMinCredits: value })} step="1" />
                  <NumberField label="Trial dias" value={draft.trialDays} onChange={(value) => updateDraft({ trialDays: value })} step="1" />
                  <NumberField label="Agentes" value={draft.agentLimit} onChange={(value) => updateDraft({ agentLimit: value })} step="1" allowBlank />
                  <NumberField label="WhatsApps" value={draft.whatsappInstanceLimit} onChange={(value) => updateDraft({ whatsappInstanceLimit: value })} step="1" allowBlank />
                  <NumberField label="Usuarios" value={draft.userLimit} onChange={(value) => updateDraft({ userLimit: value })} step="1" allowBlank />
                </div>

                <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                  <NumberField label="Ordem" value={draft.sortOrder} onChange={(value) => updateDraft({ sortOrder: value })} step="1" />
                  <Field label="Preapproval plan ID Mercado Pago">
                    <input
                      value={draft.mercadoPagoPreapprovalPlanId}
                      onChange={(event) => updateDraft({ mercadoPagoPreapprovalPlanId: event.target.value })}
                      className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none"
                      style={inputStyle}
                      placeholder="Opcional agora; usado quando ligarmos assinatura recorrente automatica."
                    />
                  </Field>
                </div>

                <div className="rounded-xl p-4" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                        Modulos inclusos
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        Isto vira a regra comercial para liberar recursos no painel do cliente.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                      <input
                        type="checkbox"
                        checked={draft.highlighted}
                        onChange={(event) => updateDraft({ highlighted: event.target.checked })}
                      />
                      destaque
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {activeModuleOptions.map((module) => {
                      const checked = draft.moduleCodes.includes(module.code);

                      return (
                        <label
                          key={module.code}
                          className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition"
                          style={{
                            background: checked ? "rgba(var(--ch-accent-rgb),0.13)" : "var(--ch-surface)",
                            border: checked ? "1px solid rgba(var(--ch-accent-rgb),0.38)" : "1px solid var(--ch-border)",
                            color: "var(--ch-text)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => toggleModule(module.code, event.target.checked)}
                          />
                          <span className="min-w-0 truncate">{module.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={draft.customModuleCode}
                      onChange={(event) => updateDraft({ customModuleCode: event.target.value })}
                      className="h-10 flex-1 rounded-xl px-3 font-mono text-[12px] outline-none"
                      style={inputStyle}
                      placeholder="novo_modulo_custom"
                    />
                    <button
                      type="button"
                      onClick={addCustomModule}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold transition hover:opacity-90"
                      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
                    >
                      <PackagePlus className="h-4 w-4" />
                      Adicionar modulo
                    </button>
                  </div>
                </div>

                <div className="rounded-xl p-4" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.20)" }}>
                  <div className="flex items-start gap-3">
                    <SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <div>
                      <p className="text-[13px] font-semibold text-cyan-100">Proxima ligacao com Mercado Pago</p>
                      <p className="mt-1 text-[12px] leading-5 text-cyan-100/75">
                        Este cadastro define a oferta. A etapa seguinte cria assinatura, cartao salvo, cobranca mensal,
                        recarga automatica e webhook de pagamento usando a conta Mercado Pago da ConnectyHub.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[12px] font-bold transition disabled:opacity-50"
                    style={{ background: "var(--ch-accent)", color: "#061015" }}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Salvando" : "Salvar plano"}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPlan(null)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold transition hover:opacity-90"
                    style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
                  >
                    <Plus className="h-4 w-4" />
                    Limpar para novo
                  </button>
                </div>
              </form>
            </Panel>
          </div>
        </div>
      )}
    </ConnectyShell>
  );

  function updateDraft(patch: Partial<PlanDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleModule(moduleCode: string, enabled: boolean) {
    setDraft((current) => {
      const moduleCodes = enabled
        ? Array.from(new Set([...current.moduleCodes, moduleCode]))
        : current.moduleCodes.filter((code) => code !== moduleCode);

      return { ...current, moduleCodes };
    });
  }

  function addCustomModule() {
    const code = normalizeCode(draft.customModuleCode);

    if (!/^[a-z0-9_-]{2,60}$/.test(code)) {
      setState({ tone: "error", message: "Use um codigo de modulo com letras minusculas, numeros, - ou _." });
      return;
    }

    setDraft((current) => ({
      ...current,
      moduleCodes: Array.from(new Set([...current.moduleCodes, code])),
      customModuleCode: "",
    }));
    setState({ tone: "idle", message: "" });
  }
}

const inputStyle = {
  background: "var(--ch-surface)",
  border: "1px solid var(--ch-border)",
  color: "var(--ch-text)",
};

function PlanMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Layers3;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(6,182,212,0.14)", color: "#22d3ee" }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 font-mono text-[26px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <p className="mt-3 text-[12px] text-slate-500">{detail}</p>
    </div>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <p className="font-mono text-[8px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  allowBlank = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
  allowBlank?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(allowBlank && event.target.value === "" ? "" : event.target.value)}
        className="h-10 w-full rounded-xl px-3 font-mono text-[13px] outline-none"
        style={inputStyle}
      />
    </Field>
  );
}

function createDraft(plan: BillingPlan | null): PlanDraft {
  if (!plan) {
    return {
      planId: "",
      planCode: "",
      name: "",
      shortDescription: "",
      status: "draft",
      sortOrder: "100",
      highlighted: false,
      monthlyPriceBrl: "0",
      includedCredits: "0",
      overageCreditPriceBrl: "0",
      autoRechargeMinCredits: "0",
      overageLimitCredits: "0",
      trialDays: "0",
      agentLimit: "",
      whatsappInstanceLimit: "",
      userLimit: "",
      moduleCodes: [],
      customModuleCode: "",
      mercadoPagoPreapprovalPlanId: "",
    };
  }

  return {
    planId: plan.id,
    planCode: plan.planCode,
    name: plan.name,
    shortDescription: plan.shortDescription ?? "",
    status: plan.status,
    sortOrder: String(plan.sortOrder),
    highlighted: plan.highlighted,
    monthlyPriceBrl: String(plan.monthlyPriceBrl),
    includedCredits: String(plan.includedCredits),
    overageCreditPriceBrl: String(plan.overageCreditPriceBrl),
    autoRechargeMinCredits: String(plan.autoRechargeMinCredits),
    overageLimitCredits: String(plan.overageLimitCredits),
    trialDays: String(plan.trialDays),
    agentLimit: plan.agentLimit === null ? "" : String(plan.agentLimit),
    whatsappInstanceLimit: plan.whatsappInstanceLimit === null ? "" : String(plan.whatsappInstanceLimit),
    userLimit: plan.userLimit === null ? "" : String(plan.userLimit),
    moduleCodes: plan.moduleCodes,
    customModuleCode: "",
    mercadoPagoPreapprovalPlanId: plan.mercadoPagoPreapprovalPlanId ?? "",
  };
}

function buildPayload(draft: PlanDraft) {
  return {
    planId: draft.planId || undefined,
    planCode: normalizeCode(draft.planCode),
    name: draft.name.trim(),
    shortDescription: draft.shortDescription.trim(),
    status: draft.status,
    sortOrder: Number(draft.sortOrder || 100),
    highlighted: draft.highlighted,
    monthlyPriceBrl: Number(draft.monthlyPriceBrl || 0),
    includedCredits: Number(draft.includedCredits || 0),
    overageCreditPriceBrl: Number(draft.overageCreditPriceBrl || 0),
    autoRechargeMinCredits: Number(draft.autoRechargeMinCredits || 0),
    overageLimitCredits: Number(draft.overageLimitCredits || 0),
    trialDays: Number(draft.trialDays || 0),
    agentLimit: draft.agentLimit === "" ? null : Number(draft.agentLimit),
    whatsappInstanceLimit: draft.whatsappInstanceLimit === "" ? null : Number(draft.whatsappInstanceLimit),
    userLimit: draft.userLimit === "" ? null : Number(draft.userLimit),
    moduleCodes: draft.moduleCodes,
    mercadoPagoPreapprovalPlanId: draft.mercadoPagoPreapprovalPlanId.trim(),
  };
}

function buildMetrics(plans: BillingPlan[]) {
  const activePlans = plans.filter((plan) => plan.status === "active");
  const averageOveragePrice = activePlans.length > 0
    ? activePlans.reduce((total, plan) => total + plan.overageCreditPriceBrl, 0) / activePlans.length
    : 0;

  return {
    total: plans.length,
    active: activePlans.length,
    activeRevenue: activePlans.reduce((total, plan) => total + plan.monthlyPriceBrl, 0),
    includedCredits: activePlans.reduce((total, plan) => total + plan.includedCredits, 0),
    averageOveragePrice,
    maxTrialDays: plans.reduce((max, plan) => Math.max(max, plan.trialDays), 0),
  };
}

function buildModuleOptions(plans: BillingPlan[], extraCodes: string[]) {
  const map = new Map(DEFAULT_MODULES.map((module) => [module.code, module]));

  for (const plan of plans) {
    for (const code of plan.moduleCodes) {
      if (!map.has(code)) {
        map.set(code, { code, label: code });
      }
    }
  }

  for (const code of extraCodes) {
    if (!map.has(code)) {
      map.set(code, { code, label: code });
    }
  }

  return Array.from(map.values());
}

function upsertPlan(plans: BillingPlan[], plan: BillingPlan) {
  const exists = plans.some((item) => item.id === plan.id);
  const next = exists ? plans.map((item) => (item.id === plan.id ? plan : item)) : [...plans, plan];

  return next.sort((left, right) => left.sortOrder - right.sortOrder || left.monthlyPriceBrl - right.monthlyPriceBrl);
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
