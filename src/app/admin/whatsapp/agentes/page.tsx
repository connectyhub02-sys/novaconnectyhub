import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "WhatsApp Interno | ConnectyHub",
};

export default function LegacyAdminWhatsappAgentsPage() {
  redirect("/admin/whatsapp/atendimento");
}
