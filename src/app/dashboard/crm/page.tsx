import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM | ConnectyHub",
  description: "CRM centralizado na Central de Atendimento.",
};

export default function CrmPage() {
  redirect("/dashboard/atendimento");
}
