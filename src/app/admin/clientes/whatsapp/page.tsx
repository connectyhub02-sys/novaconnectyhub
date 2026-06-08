import type { Metadata } from "next";
import { connection } from "next/server";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminCustomerWhatsappConsole } from "@/components/connectyhub-os/admin-customer-whatsapp-console";
import { getAdminCustomerWhatsappWorkspace } from "@/lib/admin/customer-whatsapp";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "WhatsApp dos clientes | ConnectyHub",
  description: "Monitoramento separado das instancias WhatsApp conectadas pelos usuarios.",
};

export default async function AdminCustomerWhatsappPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const whatsappWorkspace = await getAdminCustomerWhatsappWorkspace();

  return (
    <AdminCustomerWhatsappConsole
      workspace={whatsappWorkspace}
      userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}
    />
  );
}
