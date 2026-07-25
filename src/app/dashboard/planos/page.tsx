import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PricingPlansGrid } from "@/components/connectyhub-os/pricing-plans-grid";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planos | ConnectyHub",
  description: "Planos, creditos inclusos e limites do painel ConnectyHub.",
};

export default async function DashboardPlanosPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fplanos");
  }

  const organization = workspace.organization;

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
              Escolha o plano sem sair do painel.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Compare creditos, agentes, WhatsApps e recursos. Upgrade e downgrade ficam registrados aqui no painel para a ativacao do plano.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-slate-400">
            Plano atual: <span className="font-bold text-emerald-300">{organization?.planCode ?? "sem plano"}</span>
          </div>
        </div>

        <PricingPlansGrid currentPlanCode={organization?.planCode ?? null} surface="dashboard" />
      </section>
    </ConnectyShell>
  );
}
