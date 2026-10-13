import { redirect } from "next/navigation";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { CustomerInfrastructure } from "@/components/connectyhub-os/hosting-console";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Minha infraestrutura | ConnectyHub" };
export default async function Page() {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace) redirect("/login?next=%2Fdashboard%2Finfraestrutura");
  return <ConnectyShell mode="client" activeHref="/dashboard/infraestrutura" isPlatformAdmin={workspace.profile.isPlatformAdmin} userLabel={workspace.profile.email ?? undefined} userAvatarUrl={workspace.profile.avatarUrl} workspaceName={workspace.organization?.name ?? "Minha conta"}><CustomerInfrastructure /></ConnectyShell>;
}
