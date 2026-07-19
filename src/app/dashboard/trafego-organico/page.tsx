import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { MetaOrganicConsole } from "@/components/connectyhub-os/meta-organic-console";
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

  const overview = await getClientMetaOrganicOverview({
    organizationId: workspace.organization.id,
    userId: workspace.user.id,
  }).catch(() => ({
    items: [],
    summary: {
      approved: 0,
      drafts: 0,
      failed: 0,
      published: 0,
      publishing: 0,
      total: 0,
    },
  }));

  return (
    <ConnectyShell
      activeHref="/dashboard/trafego-organico"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={workspace.organization.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <MetaOrganicConsole overview={overview} />
    </ConnectyShell>
  );
}
