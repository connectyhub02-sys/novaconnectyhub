import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminAdsPlatformDashboard } from "@/components/connectyhub-os/admin-ads-platform-dashboard";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAdminTrafficOverview } from "@/lib/traffic/admin-traffic";
import { getMetaWorkspace } from "@/lib/meta/company-access";

export const metadata: Metadata = {
  title: "Google Ads | Trafego IA",
  description: "Dashboard administrativo de campanhas, rastreamento e leads Google Ads.",
};

export default async function AdminGoogleAdsPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  // ConnectyHub's internal company (same one the admin Meta connection uses).
  const ownOrganizationId = await getMetaWorkspace().then(w => w?.organization?.id ?? null, () => null);
  const overview = await getAdminTrafficOverview(ownOrganizationId);

  return (
    <AdminAdsPlatformDashboard
      overview={overview}
      platform="google"
      {...(ownOrganizationId ? {
        credentialHref: `/api/dashboard/integrations/google/connect?companyId=${ownOrganizationId}`,
        credentialPrimaryLabel: "Conectar Google",
        credentialSecondaryHref: "/admin/maintenance#credenciais-do-sistema",
      } : {})}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
