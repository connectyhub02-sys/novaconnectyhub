import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Iniciar | ConnectyHub",
};

export default async function IniciarPage() {
  const user = await getAuthenticatedUser();

  if (user) {
    const workspace = await getCurrentWorkspace();
    redirect(workspace?.profile.isPlatformAdmin ? "/admin" : "/dashboard");
  }

  redirect("/cadastro");
}
