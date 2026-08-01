import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "WhatsApp Interno | ConnectyHub",
};

export default async function LegacyAdminWhatsappAgentsPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  redirect("/admin/whatsapp/atendimento");
}
