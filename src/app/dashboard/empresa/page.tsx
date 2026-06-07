import type { Metadata } from "next";
import { CompanyConsole } from "@/components/connectyhub-os/company-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Minha Empresa | ConnectyHub",
  description: "Cadastro de empresas do painel do cliente ConnectyHub.",
};

export default async function CompanyPage() {
  const workspace = await getCurrentWorkspace();
  const profile = workspace?.profile;
  const organization = workspace?.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/empresa"
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      mode="client"
      userAvatarUrl={profile?.avatarUrl ?? null}
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    >
      <CompanyConsole />
    </ConnectyShell>
  );
}
