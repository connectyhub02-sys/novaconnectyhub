import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminTrafficConsole } from "@/components/connectyhub-os/admin-traffic-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getAdminTrafficOverview } from "@/lib/traffic/admin-traffic";

export const metadata: Metadata = {
  title: "Trafego | Admin OS",
  description: "Mostradores administrativos de trafego pago e organico conectados a Meta Ads, Google Ads e Search Console.",
};

export default async function AdminTrafficPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const overview = await getAdminTrafficOverview();

  return <AdminTrafficConsole overview={overview} userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"} />;
}
