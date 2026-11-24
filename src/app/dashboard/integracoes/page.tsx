import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ClientIntegrationsConsole } from "@/components/connectyhub-os/client-integrations-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getClientIntegrationHub } from "@/lib/client-os/integrations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { SocialAccountsConsole } from "@/components/connectyhub-os/social-accounts-console";
import { socialAccess } from "@/lib/social/access";
import { loadGoogleGuidedOAuthConfig } from "@/lib/client-os/guided-oauth";
import { socialAccountsOverview } from "@/lib/social/connections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conexões | ConnectyHub",
  description: "Central de integracoes por empresa para pagamentos, campanhas, e-commerce, agenda, frete e webhooks.",
};

export default async function DashboardIntegracoesPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
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
  // YouTube and TikTok live here too (old Contas conectadas page redirects with ?connection=).
  const social = organization
    ? await socialAccess("client").then(access => socialAccountsOverview(access.client, access.organizationId, access.canManage)).catch(() => null)
    : null;
  const { connection: outcome } = await searchParams;
  // Google Ads/Analytics needs the platform OAuth client and developer token first.
  const googleAvailable = await loadGoogleGuidedOAuthConfig({ client }).then(() => true, () => false);

  return (
    <ConnectyShell
      activeHref="/dashboard/integracoes"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <ClientIntegrationsConsole
        state={hubState}
        showDiagnostics={workspace.profile.isPlatformAdmin}
        googleAvailable={googleAvailable}
        social={social && organization ? <SocialAccountsConsole embedded cardsOnly overview={social} companyId={organization.id} shell="client" outcome={outcome} /> : null}
      />
    </ConnectyShell>
  );
}
