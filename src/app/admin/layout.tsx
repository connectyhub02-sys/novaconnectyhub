import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <>{children}</>;
  }

  return (
    <ConnectyShell
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
      workspaceName="ConnectyHub"
    >
      {children}
    </ConnectyShell>
  );
}
