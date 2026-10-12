import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MetaAdsAnalyticsPanel } from "@/components/connectyhub-os/meta-ads-analytics-panel";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { FeatureUpgradePanel } from "@/components/connectyhub-os/feature-upgrade-panel";
import { MetaComingSoonPanel } from "@/components/connectyhub-os/meta-coming-soon-panel";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { metaFeatureLaunchPaused } from "@/lib/meta/launch-status";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

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

  if (metaFeatureLaunchPaused) {
    return (
      <ConnectyShell {...shellProps}>
        <MetaComingSoonPanel featureName="Meta Ads" />
      </ConnectyShell>
    );
  }

  const entitlement = resolvePlanFeatureEntitlement("meta_ads_analytics", {
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    organizationStatus: workspace.organization.status,
    planCode: workspace.organization.planCode, featureOverrides: workspace.organization.featureOverrides,
  });

  if (!entitlement.allowed) {
    return (
      <ConnectyShell {...shellProps}>
        <FeatureUpgradePanel
          entitlement={entitlement}
          title="Meta Ads"
          description="Disponível em todos os planos ativos, conforme conexão, permissões e créditos da sua conta."
        />
      </ConnectyShell>
    );
  }

  return (
    <ConnectyShell {...shellProps}><MetaAdsAnalyticsPanel companyId={workspace.organization.id}/></ConnectyShell>
  );
}
