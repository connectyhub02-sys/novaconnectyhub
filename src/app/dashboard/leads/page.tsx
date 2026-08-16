import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leads | ConnectyHub",
  description: "Leads centralizados na Central de Atendimento.",
};

export default function LeadsPage() {
  redirect("/dashboard/atendimento");
}
