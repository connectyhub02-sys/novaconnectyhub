import type { ReactNode } from "react";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return <>{children}</>;
  }

  const profile = workspace.profile;
  const organization = workspace.organization;

  return (
    <ConnectyShell
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization?.name ?? profile.companyName ?? "Workspace"}
    >
      {children}
    </ConnectyShell>
  );
}
