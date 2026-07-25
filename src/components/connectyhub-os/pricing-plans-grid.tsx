"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const G = "#00ff88";

export type CommercialPlanCode = "trial" | "starter" | "pro" | "scale";

type PricingPlan = {
  code: CommercialPlanCode;
  name: string;
  price: string;
  priceValue: number;
  period: string;
  description: string;
  tagline: string;
  included: string[];
  locked: string[];
  cta: string;
  trial?: boolean;
  popular?: boolean;
  premium?: boolean;
};

const plans: PricingPlan[] = [
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
      "7 dias de acesso",
      "1 WhatsApp conectado",
      "1 agente IA",
      "Voz IA por creditos",
      "CRM basico, leads e conversas",
    ],
    locked: ["Creditos expiram no fim do teste", "Nao acumula com plano pago"],
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
      "CRM basico, leads e conversas",
      "Voz IA por creditos",
    ],
    locked: ["Campanhas e automacoes", "API WhatsApp", "Relatorios avancados"],
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
      "Relatorios basicos",
      "Voz IA por creditos",
    ],
    locked: ["API WhatsApp", "Integracoes avancadas"],
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
      "Relatorios e operacao em escala",
      "Voz IA por creditos",
    ],
    locked: [],
    cta: "Assinar Scale",
  },
];

type IntentState = {
  planCode: CommercialPlanCode;
  tone: "success" | "error";
  message: string;
} | null;

export function PricingPlansGrid({
  currentPlanCode = null,
  surface = "public",
}: {
  currentPlanCode?: string | null;
  surface?: "public" | "dashboard";
}) {
  const [loadingPlanCode, setLoadingPlanCode] = useState<CommercialPlanCode | null>(null);
  const [intent, setIntent] = useState<IntentState>(null);
  const currentPlan = useMemo(
    () => plans.find((plan) => plan.code === currentPlanCode) ?? null,
    [currentPlanCode],
  );

  async function requestPlan(plan: PricingPlan) {
    if (surface !== "dashboard" || plan.code === currentPlanCode || plan.code === "trial") {
      return;
    }

    setLoadingPlanCode(plan.code);
    setIntent(null);

    try {
      const response = await fetch("/api/dashboard/billing/plan-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: plan.code }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; error?: string; checkoutUrl?: string } | null;

      if (!response.ok) {
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

  return (
    <div className="pricing-plans-grid">
      {plans.map((plan) => {
        const isCurrent = currentPlanCode === plan.code;
        const buttonLabel = surface === "dashboard"
          ? dashboardButtonLabel({ currentPlan, isCurrent, plan })
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
            <h3>{plan.name}</h3>
            <strong>{plan.price}<small>{plan.period}</small></strong>
            <p className="mt-3 font-mono text-xs text-zinc-400">{plan.description}</p>
            <p className="mt-1 text-xs italic" style={{ color: `${G}99` }}>{plan.tagline}</p>
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
  );
}

function dashboardButtonLabel({
  currentPlan,
  isCurrent,
  plan,
}: {
  currentPlan: PricingPlan | null;
  isCurrent: boolean;
  plan: PricingPlan;
}) {
  if (isCurrent) return "Plano atual";
  if (plan.code === "trial") return "Teste gratis";
  if (!currentPlan || currentPlan.code === "trial") return plan.cta;
  if (plan.priceValue > currentPlan.priceValue) return `Upgrade para ${plan.name}`;
  if (plan.priceValue < currentPlan.priceValue) return `Downgrade para ${plan.name}`;
  return plan.cta;
}
