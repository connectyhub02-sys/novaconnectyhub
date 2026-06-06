import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Login | ConnectyHub",
  description: "Entre no painel da ConnectyHub.",
};

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
    email?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const user = await getAuthenticatedUser();
  const nextPath = safeNext(params.next);

  if (user) {
    const workspace = await getCurrentWorkspace();
    redirect(nextPath ?? getDefaultPath(workspace?.profile.isPlatformAdmin ?? false));
  }

  return (
    <AuthCard
      initialEmail={params.email ?? ""}
      mode="login"
      nextPath={nextPath ?? "/dashboard"}
      supabaseConfigured={isSupabaseAuthConfigured()}
    />
  );
}

function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return null;
  }

  return next;
}

function getDefaultPath(isPlatformAdmin: boolean) {
  return isPlatformAdmin ? "/admin" : "/dashboard";
}
