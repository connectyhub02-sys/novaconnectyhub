import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { FeatureUpgradePanel } from "@/components/connectyhub-os/feature-upgrade-panel";
import { MetaComingSoonPanel } from "@/components/connectyhub-os/meta-coming-soon-panel";
import { MetaOrganicConsole } from "@/components/connectyhub-os/meta-organic-console";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { metaFeatureLaunchPaused } from "@/lib/meta/launch-status";
import { getClientMetaOrganicOverview } from "@/lib/meta/organic-publishing";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Organico Meta | ConnectyHub",
  description: "Rascunhos e publicacoes organicas para Instagram e Facebook.",
};

export default async function OrganicTrafficPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Ftrafego-organico");
  }

  if (!workspace.organization?.id) {
    redirect("/dashboard/empresa");
  }

  const shellProps = {
    activeHref: "/dashboard/trafego-organico",
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    mode: "client" as const,
    userAvatarUrl: workspace.profile.avatarUrl,
    userLabel: workspace.profile.email ?? undefined,
    workspaceName: workspace.organization.name ?? workspace.profile.companyName ?? "Workspace",
  };

  if (metaFeatureLaunchPaused) {
    return (
      <ConnectyShell {...shellProps}>
        <MetaComingSoonPanel featureName="Organico Meta" />
      </ConnectyShell>
    );
  }

  const entitlement = resolvePlanFeatureEntitlement("meta_organic_insights", {
    isPlatformAdmin: workspace.profile.isPlatformAdmin,
    organizationStatus: workspace.organization.status,
    planCode: workspace.organization.planCode,
  });

  if (!entitlement.allowed) {
    return (
      <ConnectyShell {...shellProps}>
        <FeatureUpgradePanel
          entitlement={entitlement}
          title="Organico Meta"
          description="Publicacoes, leitura organica e preparacao de campanhas para Instagram e Facebook ficam liberadas no Pro e Scale. O teste gratis continua com acesso completo por 7 dias."
        />
      </ConnectyShell>
    );
  }

  const overview = await getClientMetaOrganicOverview({
    organizationId: workspace.organization.id,
    userId: workspace.user.id,
  }).catch(() => ({
    items: [],
    media: [],
    summary: {
      approved: 0,
      drafts: 0,
      failed: 0,
      published: 0,
      publishing: 0,
      scheduled: 0,
      total: 0,
    },
  }));

  return (
    <ConnectyShell {...shellProps}>
      <MetaOrganicConsole overview={overview} />
    </ConnectyShell>
  );
}
