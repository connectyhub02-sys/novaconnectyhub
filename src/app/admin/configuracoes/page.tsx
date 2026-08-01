import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Configuracoes | Admin OS",
};

export default async function AdminConfiguracoesPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  redirect("/admin/maintenance");
}
