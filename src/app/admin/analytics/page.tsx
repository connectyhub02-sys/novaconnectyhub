import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { PageHeader } from "@/components/connectyhub-os/panel-primitives";
import { PlatformAnalyticsPanel } from "@/components/connectyhub-os/platform-analytics-panel";
import { getPlatformAnalytics } from "@/lib/analytics/platform-analytics";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = { title: "Analytics do site | ConnectyHub", robots: { index: false, follow: false } };
export default async function AnalyticsPage() {
  await connection();
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return <AccessDenied />;
  const report = await getPlatformAnalytics();
  return <ConnectyShell mode="admin" activeHref="/admin/analytics" isPlatformAdmin userLabel={workspace.profile.email ?? "Administrador"}>
    <PageHeader eyebrow="Divulgação" title="Analytics do site" description="Visitantes, páginas e origens das visitas à ConnectyHub." />
    <PlatformAnalyticsPanel report={report} />
  </ConnectyShell>;
}
