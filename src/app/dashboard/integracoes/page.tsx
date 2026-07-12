import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ClientIntegrationsConsole } from "@/components/connectyhub-os/client-integrations-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getClientIntegrationHub } from "@/lib/client-os/integrations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integracoes | ConnectyHub",
  description: "Central de integracoes por empresa para pagamentos, campanhas, e-commerce, agenda, frete e webhooks.",
};

export default async function DashboardIntegracoesPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fintegracoes");
  }

  const client = createServiceClient();
  const hubState = await getClientIntegrationHub({
    userId: workspace.user.id,
    preferredCompanyId: workspace.organization?.id,
    client,
  });
  const organization = workspace.organization;

  return (
    <ConnectyShell
      activeHref="/dashboard/integracoes"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <ClientIntegrationsConsole state={hubState} />
    </ConnectyShell>
  );
}
