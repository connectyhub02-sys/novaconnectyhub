import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CampaignConsole } from "@/components/commerce/campaign-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
export const metadata = { title: "Campanhas e benefícios | ConnectyHub" };
export default async function Page() {
  await connection();
  const workspace = await getCurrentWorkspace();
  if (!workspace) redirect("/login");
  return (
    <ConnectyShell
      activeHref="/dashboard/campanhas-comerciais"
      mode="client"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={workspace.organization?.name ?? "Empresa"}
    >
      <CampaignConsole owner="store" />
    </ConnectyShell>
  );
}
