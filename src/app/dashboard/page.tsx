import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientDashboard } from "@/components/connectyhub-os/client-dashboard";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Dashboard | ConnectyHub",
  description: "Painel do cliente ConnectyHub para leads, conversas, agentes, links rastreaveis e automacoes.",
};

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard");
  }

  if (workspace?.profile.isPlatformAdmin && params.view !== "client") {
    redirect("/admin");
  }

  if (!workspace.organization && !workspace.profile.isPlatformAdmin) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;

  return (
    <ClientDashboard
      isPlatformAdmin={profile.isPlatformAdmin}
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    />
  );
}
