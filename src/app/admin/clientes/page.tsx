import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminUsersConsole } from "@/components/connectyhub-os/admin-users-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Usuarios | Admin OS",
  description: "Gestao de usuarios registrados na plataforma ConnectyHub.",
};

export default async function AdminClientesPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  return (
    <ConnectyShell
      activeHref="/admin/clientes"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <AdminUsersConsole />
    </ConnectyShell>
  );
}
