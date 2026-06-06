import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Teste gratis | ConnectyHub",
  description: "Crie sua conta e comece o teste gratis da ConnectyHub.",
};

export default async function CadastroPage() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  return <AuthCard mode="signup" nextPath="/dashboard" supabaseConfigured={isSupabaseAuthConfigured()} />;
}
