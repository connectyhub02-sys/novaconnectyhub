import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminWhatsappAtendimentoConsole } from "@/components/connectyhub-os/admin-whatsapp-atendimento-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getAdminLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
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

  const leadWorkspace = await getAdminLeadCrmWorkspace({
    limit: 400,
    scope: "platform_internal",
  });

  return (
    <ConnectyShell
      activeHref="/admin/whatsapp/atendimento"
      isPlatformAdmin
      mode="admin"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    >
      <AdminWhatsappAtendimentoConsole leadWorkspace={leadWorkspace} />
    </ConnectyShell>
  );
}
