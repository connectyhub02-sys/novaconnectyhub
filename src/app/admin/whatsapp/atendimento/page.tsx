import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminWhatsappAgentsConsole } from "@/components/connectyhub-os/admin-whatsapp-agents-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "WhatsApp Interno | ConnectyHub",
  description: "Agentes WhatsApp da propria operacao ConnectyHub vinculados aos setores internos.",
};

export default async function AdminWhatsappAtendimentoPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  return (
    <ConnectyShell
      activeHref="/admin/whatsapp/atendimento"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <AdminWhatsappAgentsConsole />
    </ConnectyShell>
  );
}
