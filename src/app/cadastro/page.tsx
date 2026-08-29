import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Teste gratis | ConnectyHub",
  description: "Crie sua conta e comece o teste gratis da ConnectyHub.",
  alternates: { canonical: "/cadastro" },
  openGraph: {
    title: "Teste gratis | ConnectyHub",
    description: "Crie sua conta e comece o teste gratis da ConnectyHub.",
    url: "/cadastro",
    siteName: "ConnectyHub",
    locale: "pt_BR",
    type: "website",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Teste gratis | ConnectyHub",
    description: "Crie sua conta e comece o teste gratis da ConnectyHub.",
    images: ["/opengraph-image"],
  },
};

export default async function CadastroPage() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  return <AuthCard mode="signup" nextPath="/dashboard" supabaseConfigured={isSupabaseAuthConfigured()} />;
}
