import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PricingPlansGrid } from "@/components/connectyhub-os/pricing-plans-grid";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AccountCompletionRequiredError, assertAccountComplete } from "@/lib/account/signup-completion";
import { loadPendingPlan } from "@/lib/billing/pending-plan";
import { loadPublicPricingPlans } from "@/lib/billing/public-pricing-server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planos | ConnectyHub",
  description: "Planos, creditos inclusos, armazenamento e limites do painel ConnectyHub.",
};

export default async function DashboardPlanosPage() {
  await connection();
  const workspace = await getCurrentWorkspace({ allowRestricted: true });

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fplanos");
  }

  const organization = workspace.organization;
  const client = createServiceClient();

  try {
    await assertAccountComplete({ userId: workspace.user.id, client });
  } catch (error) {
    if (error instanceof AccountCompletionRequiredError) {
      redirect("/dashboard/minha-conta?complete=1&next=%2Fdashboard%2Fplanos");
    }

    throw error;
  }

  const [pendingPlan, pricingPlans] = await Promise.all([
    organization ? loadPendingPlan(client, organization.id) : null,
    loadPublicPricingPlans(client),
  ]);
  const currentPlanCode = getCurrentPurchasablePlanCode(organization?.planCode, organization?.status);

  return (
    <ConnectyShell
      activeHref="/dashboard/planos"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <section className="space-y-6">
        {pendingPlan ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-slate-900">
          <div><h2 className="font-bold">{pendingPlan.renewal ? "Regularize seu plano" : "Conclua o pagamento do plano"}</h2>
            <p className="mt-1 text-sm">{pendingPlan.planName} · {pendingPlan.amountBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
            <p className="mt-1 text-sm text-slate-600">A liberação acontece após a confirmação do pagamento.</p></div>
          <Link href={pendingPlan.checkoutUrl} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white">Pagar fatura do plano</Link>
        </div> : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
              Billing / planos
            </div>
            <h1 className="mt-3 text-[28px] font-black leading-tight text-white sm:text-[36px]">
              Escolha o plano ideal para sua operacao.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Compare creditos, armazenamento, agentes, WhatsApps e recursos. Ative, finalize ou troque seu plano com seguranca quando sua operacao precisar crescer.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-slate-400">
            Plano atual: <span className="font-bold text-emerald-300">{currentPlanCode ?? "sem plano"}</span>
          </div>
        </div>

        <PricingPlansGrid
          currentPlanCode={currentPlanCode}
          initialPlans={pricingPlans}
          pendingPlan={pendingPlan}
          surface="dashboard"
        />
      </section>
    </ConnectyShell>
  );
}

function getCurrentPurchasablePlanCode(planCode: string | null | undefined, status: string | null | undefined) {
  const normalizedStatus = status?.trim().toLowerCase();

  if (!planCode || !normalizedStatus) {
    return null;
  }

  return ["active", "trial", "trial_pending", "internal"].includes(normalizedStatus)
    ? planCode
    : null;
}
