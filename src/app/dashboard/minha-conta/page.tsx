import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccountConsole } from "@/components/connectyhub-os/account-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Minha conta | ConnectyHub",
  description: "Perfil, plano, creditos e historico financeiro da conta ConnectyHub.",
};

export default async function DashboardMinhaContaPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fminha-conta");
  }

  const organization = workspace.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/minha-conta"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <AccountConsole />
    </ConnectyShell>
  );
}
