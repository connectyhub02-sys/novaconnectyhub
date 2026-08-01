import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CompanyConsole } from "@/components/connectyhub-os/company-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Minha Empresa | ConnectyHub",
  description: "Cadastro de empresas do painel do cliente ConnectyHub.",
};

export default async function CompanyPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fempresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/empresa"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization?.name ?? profile.companyName ?? "Workspace"}
    >
      <CompanyConsole />
    </ConnectyShell>
  );
}
