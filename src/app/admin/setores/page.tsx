import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminSectorsConsole } from "@/components/connectyhub-os/admin-sectors-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Setores | ConnectyHub",
  description: "Setores internos da ConnectyHub para atendimento, prompts e agentes WhatsApp.",
};

export default async function AdminSetoresPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  return (
    <ConnectyShell
      activeHref="/admin/setores"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <AdminSectorsConsole />
    </ConnectyShell>
  );
}
