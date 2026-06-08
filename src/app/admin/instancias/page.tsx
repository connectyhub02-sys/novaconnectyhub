import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "WhatsApp dos clientes | ConnectyHub",
};

export default function AdminInstanciasPage() {
  redirect("/admin/clientes/whatsapp");
}
