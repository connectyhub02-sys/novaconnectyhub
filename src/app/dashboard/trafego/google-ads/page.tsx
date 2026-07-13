import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminAdsPlatformDashboard } from "@/components/connectyhub-os/admin-ads-platform-dashboard";
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

  const overview = await getClientTrafficOverview(workspace.organization.id);

  return (
    <AdminAdsPlatformDashboard
      activeHref="/dashboard/trafego/google-ads"
      credentialHref="/dashboard/integracoes#google-growth"
      credentialPrimaryLabel="Abrir integracoes"
      credentialSecondaryLabel="Salvar em integracoes"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      overview={overview}
      platform="google"
      shellMode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={workspace.organization.name ?? workspace.profile.companyName ?? "Workspace"}
    />
  );
}
