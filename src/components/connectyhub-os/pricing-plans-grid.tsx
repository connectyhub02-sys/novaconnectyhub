"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { PublicPricingPlan } from "@/lib/billing/public-pricing";

const G = "#00ff88";

type PricingPlan = PublicPricingPlan;

const fallbackPlans: PricingPlan[] = [
  {
    code: "trial",
    name: "Teste gratis",
    price: "R$ 0",
    priceValue: 0,
    period: "/7 dias",
    description: "Para provar o atendimento antes de assinar.",
    tagline: "1.000 creditos de teste para ativar seu primeiro agente",
    trial: true,
    included: [
      "1.000 creditos inclusos",
      "Saldo restante soma ao plano pago",
      "7 dias de acesso",
      "1 WhatsApp conectado",
      "1 agente IA",
      "Instagram Direct e Messenger Facebook no teste",
      "Meta Ads, Google Ads e gestor IA no teste",
      "Voz IA por creditos",
      "CRM basico, leads e conversas",
    ],
    locked: ["Atendimento pausa apos 7 dias sem plano", "Sem creditos extras automaticos"],
    cta: "Comecar teste gratis",
  },
  {
    code: "starter",
    name: "Start",
    price: "R$ 97",
    priceValue: 97,
    period: "/mes",
    description: "Para comecar a vender com IA no WhatsApp.",
    tagline: "Entrada com 1 agente para validar atendimento e vendas",
    included: [
      "3.000 creditos inclusos",
      "1 WhatsApp conectado",
      "1 agente IA",
      "2 usuarios no painel",
      "Catalogo de vendas",
      "Campanhas WhatsApp",
      "Grupos e canais WhatsApp",
      "CRM basico, leads e conversas",
      "Voz IA por creditos",
      "Creditos acumulam com saldo anterior",
    ],
    locked: ["Instagram Direct e Messenger Facebook", "Comentario para Direct", "Meta Ads, Google Ads e gestor IA", "Relatorios avancados"],
    cta: "Assinar Start",
  },
  {
    code: "pro",
    name: "Pro",
    price: "R$ 247",
    priceValue: 247,
    period: "/mes",
    description: "Para operacao comercial com mais volume.",
    tagline: "4 agentes e 4 WhatsApps para times que atendem todos os dias",
    popular: true,
    included: [
      "10.000 creditos inclusos",
      "4 WhatsApps conectados",
      "4 agentes IA",
      "5 usuarios no painel",
      "CRM e funil comercial",
      "Campanhas e automacoes",
      "Instagram Direct e Messenger Facebook",
      "Comentario para Direct",
      "Organico Meta",
      "Relatorios basicos",
      "Voz IA por creditos",
      "Creditos acumulam com saldo anterior",
    ],
    locked: ["Meta Ads avancado", "Google Ads avancado", "Gestor de trafego IA", "API WhatsApp"],
    cta: "Assinar Pro",
  },
  {
    code: "scale",
    name: "Scale",
    price: "R$ 497",
    priceValue: 497,
    period: "/mes",
    description: "Para escalar atendimento, agentes e API.",
    tagline: "1 agente para cada WhatsApp em operacoes com equipe",
    premium: true,
    included: [
      "25.000 creditos inclusos",
      "8 WhatsApps conectados",
      "8 agentes IA",
      "15 usuarios no painel",
      "API WhatsApp",
      "Integracoes avancadas",
      "Instagram Direct e Messenger Facebook",
      "Comentario para Direct",
      "Organico Meta",
      "Meta Ads e Google Ads avancados",
      "Gestor de trafego IA",
      "Relatorios e operacao em escala",
      "Voz IA por creditos",
      "Creditos acumulam com saldo anterior",
    ],
    locked: [],
    cta: "Assinar Scale",
  },
];

type IntentState = {
  planCode: string;
  tone: "success" | "error";
  message: string;
} | null;

type PendingPlanInfo = {
  subscriptionId: string;
  planCode: string;
  checkoutUrl: string;
} | null;

type SwitchPromptState = {
  fromPlanName: string;
  toPlan: PricingPlan;
} | null;

export function PricingPlansGrid({
  currentPlanCode = null,
  initialPlans = [],
  liveCatalog = true,
  pendingPlan = null,
  surface = "public",
}: {
  currentPlanCode?: string | null;
  initialPlans?: PricingPlan[];
  liveCatalog?: boolean;
  pendingPlan?: PendingPlanInfo;
  surface?: "public" | "dashboard";
}) {
  const [catalogPlans, setCatalogPlans] = useState<PricingPlan[]>(() => normalizePricingPlans(initialPlans));
  const [catalogLoading, setCatalogLoading] = useState(liveCatalog && initialPlans.length === 0);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [loadingPlanCode, setLoadingPlanCode] = useState<string | null>(null);
  const [intent, setIntent] = useState<IntentState>(null);
  const [switchPrompt, setSwitchPrompt] = useState<SwitchPromptState>(null);
  const visiblePlans = useMemo(() => {
    if (catalogPlans.length > 0) return catalogPlans;
    if (catalogLoading) return [];
    if (!catalogFailed && liveCatalog) return [];
    return fallbackPlans;
  }, [catalogFailed, catalogLoading, catalogPlans, liveCatalog]);
  const currentPlan = useMemo(
    () => visiblePlans.find((plan) => plan.code === currentPlanCode) ?? null,
    [currentPlanCode, visiblePlans],
  );
  const pendingPricingPlan = useMemo(
    () => visiblePlans.find((plan) => plan.code === pendingPlan?.planCode) ?? null,
    [pendingPlan?.planCode, visiblePlans],
  );

  useEffect(() => {
    if (!liveCatalog) return;

    let ignore = false;
    fetch("/api/billing/plans", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { plans?: PricingPlan[] } | null;

        if (!response.ok || !data?.plans) {
          throw new Error("Nao foi possivel carregar planos.");
        }

        if (!ignore) {
          const nextPlans = normalizePricingPlans(data.plans);
          setCatalogPlans(nextPlans);
          setCatalogFailed(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setCatalogFailed(true);
        }
      })
      .finally(() => {
        if (!ignore) {
          setCatalogLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [liveCatalog]);

  async function requestPlan(plan: PricingPlan, options: { replacePending?: boolean } = {}) {
    if (surface !== "dashboard" || plan.code === currentPlanCode || plan.code === "trial") {
      return;
    }

    if (!options.replacePending && pendingPlan && pendingPlan.planCode === plan.code) {
      window.location.assign(pendingPlan.checkoutUrl);
      return;
    }

    if (!options.replacePending && pendingPlan && pendingPlan.planCode !== plan.code) {
      setSwitchPrompt({
        fromPlanName: pendingPricingPlan?.name ?? pendingPlan.planCode,
        toPlan: plan,
      });
      return;
    }

    setLoadingPlanCode(plan.code);
    setIntent(null);

    try {
      const response = await fetch("/api/dashboard/billing/plan-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: plan.code, replacePending: options.replacePending === true }),
      });
      const data = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
        error?: string;
        checkoutUrl?: string;
        pendingPlanCode?: string;
        pendingCheckoutUrl?: string;
      } | null;

      if (!response.ok) {
        if (data?.code === "pending_plan_exists") {
          const fromPlan = visiblePlans.find((item) => item.code === data.pendingPlanCode);
          setSwitchPrompt({
            fromPlanName: fromPlan?.name ?? data.pendingPlanCode ?? "plano pendente",
            toPlan: plan,
          });
          return;
        }

        throw new Error(data?.error ?? "Nao foi possivel solicitar este plano.");
      }

      if (data?.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      setIntent({
        planCode: plan.code,
        tone: "success",
        message: data?.message ?? "Solicitacao recebida. Vamos finalizar a ativacao deste plano pelo painel.",
      });
    } catch (error) {
      setIntent({
        planCode: plan.code,
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel solicitar este plano.",
      });
    } finally {
      setLoadingPlanCode(null);
    }
  }

  async function confirmPlanSwitch() {
    if (!switchPrompt) return;

    const nextPlan = switchPrompt.toPlan;
    setSwitchPrompt(null);
    await requestPlan(nextPlan, { replacePending: true });
  }

  return (
    <>
      <div className="pricing-plans-grid">
        {visiblePlans.length === 0 && catalogLoading ? (
          <PricingPlanSkeleton />
        ) : visiblePlans.length === 0 ? (
          <PricingPlansEmptyState />
        ) : visiblePlans.map((plan) => {
          const isCurrent = currentPlanCode === plan.code;
          const isPending = pendingPlan?.planCode === plan.code;
          const buttonLabel = surface === "dashboard"
          ? dashboardButtonLabel({ currentPlan, isCurrent, isPending, pendingPlan, plan })
          : plan.cta;
          const buttonDisabled = surface === "dashboard" && (isCurrent || plan.code === "trial" || loadingPlanCode !== null);

          return (
            <div
              key={plan.code}
              className={
                plan.trial
                  ? "pricing-card pricing-card-trial"
                  : plan.popular
                    ? "pricing-card pricing-card-popular"
                    : plan.premium
                      ? "pricing-card pricing-card-premium"
                      : "pricing-card"
              }
            >
              {plan.trial ? <span className="trial-badge">7 dias gratis</span> : null}
              {plan.popular ? <span className="popular-badge">Mais popular</span> : null}
              {plan.premium ? <span className="premium-badge">Mais completo</span> : null}
              {isPending ? (
                <span className="absolute right-4 top-11 rounded border border-amber-300/35 bg-amber-400/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-amber-200">
                  Pagamento pendente
                </span>
              ) : null}
              <h3>{plan.name}</h3>
              <strong>{plan.price}<small>{plan.period}</small></strong>
              <p className="mt-3 font-mono text-xs text-zinc-400">{plan.description}</p>
              <p className="mt-1 text-xs italic" style={{ color: `${G}99` }}>{plan.tagline}</p>
              {isPending ? (
                <p className="mt-3 rounded-lg border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-100">
                  Este plano esta aguardando pagamento. Finalize para liberar os creditos.
                </p>
              ) : null}
              <ul>
                {plan.included.map((item) => <li key={item}>{item}</li>)}
                {plan.locked.map((item) => <li key={item} className="plan-locked">{item}</li>)}
              </ul>
              {surface === "dashboard" ? (
                <>
                  <button
                    className="pricing-card-action"
                    disabled={buttonDisabled}
                    type="button"
                    onClick={() => requestPlan(plan)}
                  >
                    {loadingPlanCode === plan.code ? <Loader2 className="inline h-3.5 w-3.5 animate-spin align-[-2px]" /> : null}
                    {buttonLabel}
                  </button>
                  {intent?.planCode === plan.code ? (
                    <p
                      className="mt-3 rounded-lg border px-3 py-2 text-[11px] leading-5"
                      style={{
                        background: intent.tone === "success" ? "rgba(0,255,136,0.08)" : "rgba(251,113,133,0.09)",
                        borderColor: intent.tone === "success" ? "rgba(0,255,136,0.28)" : "rgba(251,113,133,0.32)",
                        color: intent.tone === "success" ? "#8fffc7" : "#fecdd3",
                      }}
                    >
                      {intent.tone === "success" ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" /> : null}
                      {intent.message}
                    </p>
                  ) : null}
                </>
              ) : (
                <a href={`/iniciar?plan=${plan.code}`}>{plan.cta}</a>
              )}
            </div>
          );
        })}
      </div>

      {catalogFailed && catalogPlans.length === 0 ? (
        <p className="mt-3 text-center font-mono text-[11px] text-amber-200">
          Planos exibidos em modo reserva. O checkout valida o valor atual antes do pagamento.
        </p>
      ) : null}

      {switchPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[8px] border border-amber-300/30 bg-slate-950 p-5 shadow-2xl shadow-black/40">
            <div className="flex items-start gap-3">
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 p-2 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">
                  Pagamento pendente
                </div>
                <h2 className="mt-2 text-xl font-black text-white">Trocar plano escolhido?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Voce ja tem o plano {switchPrompt.fromPlanName} aguardando pagamento. Se confirmar, vamos cancelar essa solicitacao e abrir o checkout do plano {switchPrompt.toPlan.name}.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSwitchPrompt(null)}
                className="min-h-11 rounded-[8px] border border-slate-600 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/5"
              >
                Manter plano atual
              </button>
              <button
                type="button"
                onClick={confirmPlanSwitch}
                className="min-h-11 rounded-[8px] bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200"
              >
                Trocar para {switchPrompt.toPlan.name}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function dashboardButtonLabel({
  currentPlan,
  isCurrent,
  isPending,
  pendingPlan,
  plan,
}: {
  currentPlan: PricingPlan | null;
  isCurrent: boolean;
  isPending: boolean;
  pendingPlan: PendingPlanInfo;
  plan: PricingPlan;
}) {
  if (isCurrent) return "Plano atual";
  if (plan.code === "trial") return "Teste gratis";
  if (isPending) return "Finalizar pagamento";
  if (pendingPlan && pendingPlan.planCode !== plan.code) return `Trocar para ${plan.name}`;
  if (!currentPlan || currentPlan.code === "trial") return plan.cta;
  if (plan.priceValue > currentPlan.priceValue) return `Upgrade para ${plan.name}`;
  if (plan.priceValue < currentPlan.priceValue) return `Downgrade para ${plan.name}`;
  return plan.cta;
}

function PricingPlanSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="pricing-card animate-pulse">
          <div className="h-5 w-24 rounded bg-white/10" />
          <div className="mt-6 h-11 w-32 rounded bg-white/10" />
          <div className="mt-4 h-3 w-full rounded bg-white/10" />
          <div className="mt-2 h-3 w-4/5 rounded bg-white/10" />
          <div className="mt-8 grid gap-3">
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-11/12 rounded bg-white/10" />
            <div className="h-3 w-10/12 rounded bg-white/10" />
            <div className="h-3 w-8/12 rounded bg-white/10" />
          </div>
          <div className="mt-auto h-11 rounded border border-white/10 bg-white/5" />
        </div>
      ))}
    </>
  );
}

function PricingPlansEmptyState() {
  return (
    <div className="pricing-card flex min-h-[320px] items-center justify-center text-center md:col-span-2 xl:col-span-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">Planos</p>
        <p className="mt-3 text-sm text-white/70">Nenhum plano ativo disponivel no momento.</p>
      </div>
    </div>
  );
}

function normalizePricingPlans(plans: PricingPlan[]) {
  return plans
    .filter((plan) => plan.code && plan.name)
    .map((plan) => ({
      ...plan,
      code: plan.code.trim().toLowerCase(),
      included: Array.isArray(plan.included) ? plan.included : [],
      locked: Array.isArray(plan.locked) ? plan.locked : [],
    }));
}
