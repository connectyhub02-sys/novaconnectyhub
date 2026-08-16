import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversas | ConnectyHub",
  description: "Conversas centralizadas na Central de Atendimento.",
};

export default function ConversationsPage() {
  redirect("/dashboard/atendimento");
}
