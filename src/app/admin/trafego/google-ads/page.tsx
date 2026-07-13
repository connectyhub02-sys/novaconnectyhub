import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminAdsPlatformDashboard } from "@/components/connectyhub-os/admin-ads-platform-dashboard";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAdminTrafficOverview } from "@/lib/traffic/admin-traffic";

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

  const overview = await getAdminTrafficOverview();

  return (
    <AdminAdsPlatformDashboard
      overview={overview}
      platform="google"
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
