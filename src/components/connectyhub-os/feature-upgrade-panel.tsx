import Link from "next/link";
import { ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { cn } from "@/lib/utils";
import { Panel, toneClass } from "./panel-primitives";

const planLabels: Record<string, string> = {
  starter: "Start",
  pro: "Pro",
  scale: "Scale",
};

export function FeatureUpgradePanel({
  children,
  description,
  entitlement,
  title,
}: {
  children?: ReactNode;
  description?: string;
  entitlement: PlanFeatureEntitlement;
  title?: string;
}) {
  const tone = entitlement.reason === "billing_blocked" ? "rose" : "amber";
  const href = entitlement.reason === "billing_blocked" ? "/dashboard/minha-conta" : "/dashboard/planos";
  const label = entitlement.reason === "billing_blocked" ? "Regularizar assinatura" : entitlement.upgradeLabel;

  return (
    <Panel
      eyebrow="Plano / permissao"
      title={title ?? entitlement.title}
      tone={tone}
      action={<PlanGateBadge entitlement={entitlement} />}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", toneClass(tone).bg)}>
              <LockKeyhole className={cn("h-5 w-5", toneClass(tone).text)} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-white">{entitlement.title}</p>
              <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-400">
                {description ?? entitlement.description}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {entitlement.requiredPlanCodes.map((planCode) => (
              <span
                key={planCode}
                className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-[12px] font-semibold text-cyan-100"
              >
                {planLabels[planCode] ?? planCode}
              </span>
            ))}
          </div>

          {children ? <div className="mt-5">{children}</div> : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Regra comercial
          </div>
          <p className="mt-3 text-[12px] leading-5 text-slate-400">
            O teste gratis libera todos os recursos por 7 dias. Depois disso, este recurso exige plano {entitlement.minimumPlanLabel}.
          </p>
          <Link
            href={href}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300 px-4 text-[13px] font-bold text-slate-950 transition hover:bg-amber-200"
          >
            {label}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Panel>
  );
}

function PlanGateBadge({ entitlement }: { entitlement: PlanFeatureEntitlement }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
      Plano minimo: {entitlement.minimumPlanLabel}
    </span>
  );
}
