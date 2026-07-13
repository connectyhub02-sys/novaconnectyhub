import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminAdsPlatformDashboard } from "@/components/connectyhub-os/admin-ads-platform-dashboard";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAdminTrafficOverview } from "@/lib/traffic/admin-traffic";

export const metadata: Metadata = {
  title: "Meta Ads | Trafego IA",
  description: "Dashboard administrativo de campanhas, rastreamento e leads Meta Ads.",
};

export default async function AdminMetaAdsPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const overview = await getAdminTrafficOverview();

  return (
    <AdminAdsPlatformDashboard
      overview={overview}
      platform="meta"
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
