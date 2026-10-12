import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { MetaAdsAnalyticsPanel } from "@/components/connectyhub-os/meta-ads-analytics-panel";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

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

  return (
    <ConnectyShell mode="admin" isPlatformAdmin activeHref="/admin/trafego/meta-ads" userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}>
      <MetaAdsAnalyticsPanel admin/>
    </ConnectyShell>
  );
}
