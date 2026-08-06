import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PricingPlansGrid } from "@/components/connectyhub-os/pricing-plans-grid";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { AccountCompletionRequiredError, assertAccountComplete } from "@/lib/account/signup-completion";
import { buildDashboardBillingCheckoutPath } from "@/lib/billing/plan-checkout";
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
  const workspace = await getCurrentWorkspace();

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

async function loadPendingPlan(client: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, plan_code, status")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "incomplete"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      plan_code: string;
      status: string;
    }>();

  if (error || !data) {
    return null;
  }

  return {
    subscriptionId: data.id,
    planCode: data.plan_code,
    checkoutUrl: buildDashboardBillingCheckoutPath(data.id),
  };
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
