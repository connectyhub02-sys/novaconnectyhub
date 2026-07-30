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
  title: "Meta Ads | ConnectyHub",
  description: "Dashboard de campanhas, pixel, leads e trafego Meta Ads da empresa.",
};

export default async function ClientMetaAdsPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Ftrafego%2Fmeta-ads");
  }

  if (!workspace.organization?.id) {
    redirect("/dashboard/empresa");
  }

  const shellProps = {
    activeHref: "/dashboard/trafego/meta-ads",
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    mode: "client" as const,
    userAvatarUrl: workspace.profile.avatarUrl,
    userLabel: workspace.profile.email ?? undefined,
    workspaceName: workspace.organization.name ?? workspace.profile.companyName ?? "Workspace",
  };
  const entitlement = resolvePlanFeatureEntitlement("meta_ads_analytics", {
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    organizationStatus: workspace.organization.status,
    planCode: workspace.organization.planCode,
  });

  if (!entitlement.allowed) {
    return (
      <ConnectyShell {...shellProps}>
        <FeatureUpgradePanel
          entitlement={entitlement}
          title="Meta Ads"
          description="Analise de campanhas Meta, pixel, anuncios e recomendacoes de trafego pago ficam reservadas para operacoes Scale. O teste gratis continua liberando a validacao completa."
        />
      </ConnectyShell>
    );
  }

  const overview = await getClientTrafficOverview(workspace.organization.id);

  return (
    <AdminAdsPlatformDashboard
      activeHref={shellProps.activeHref}
      credentialHref="/dashboard/integracoes#meta-ads-guiado"
      credentialPrimaryLabel="Abrir integracoes"
      credentialSecondaryLabel="Salvar em integracoes"
      isPlatformAdmin={shellProps.isPlatformAdmin}
      organizationId={workspace.organization.id}
      overview={overview}
      platform="meta"
      shellMode="client"
      userAvatarUrl={shellProps.userAvatarUrl}
      userLabel={shellProps.userLabel}
      workspaceName={shellProps.workspaceName}
    />
  );
}
