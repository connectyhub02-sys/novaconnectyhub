import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminAdsPlatformDashboard } from "@/components/connectyhub-os/admin-ads-platform-dashboard";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { FeatureUpgradePanel } from "@/components/connectyhub-os/feature-upgrade-panel";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getClientTrafficOverview } from "@/lib/traffic/admin-traffic";

export const metadata: Metadata = {
  title: "Google Ads | ConnectyHub",
  description: "Dashboard de campanhas, conversoes, tags e trafego Google Ads da empresa.",
};

export default async function ClientGoogleAdsPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Ftrafego%2Fgoogle-ads");
  }

  if (!workspace.organization?.id) {
    redirect("/dashboard/empresa");
  }

  const shellProps = {
    activeHref: "/dashboard/trafego/google-ads",
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    mode: "client" as const,
    userAvatarUrl: workspace.profile.avatarUrl,
    userLabel: workspace.profile.email ?? undefined,
    workspaceName: workspace.organization.name ?? workspace.profile.companyName ?? "Workspace",
  };
  const entitlement = resolvePlanFeatureEntitlement("google_ads_analytics", {
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    organizationStatus: workspace.organization.status,
    planCode: workspace.organization.planCode,
  });

  if (!entitlement.allowed) {
    return (
      <ConnectyShell {...shellProps}>
        <FeatureUpgradePanel
          entitlement={entitlement}
          title="Google Ads"
          description="Analise de campanhas Google, tags, conversoes e recomendacoes de trafego pago ficam reservadas para operacoes Scale. O teste gratis continua liberando a validacao completa."
        />
      </ConnectyShell>
    );
  }

  const overview = await getClientTrafficOverview(workspace.organization.id);

  return (
    <AdminAdsPlatformDashboard
      activeHref={shellProps.activeHref}
      credentialHref="/dashboard/integracoes#google-ads-guiado"
      credentialPrimaryLabel="Abrir integracoes"
      credentialSecondaryLabel="Salvar em integracoes"
      isPlatformAdmin={shellProps.isPlatformAdmin}
      organizationId={workspace.organization.id}
      overview={overview}
      platform="google"
      shellMode="client"
      userAvatarUrl={shellProps.userAvatarUrl}
      userLabel={shellProps.userLabel}
      workspaceName={shellProps.workspaceName}
    />
  );
}
