import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Iniciar | ConnectyHub",
  robots: {
    index: false,
    follow: false,
  },
};

type IniciarPageProps = {
  searchParams?: Promise<{
    plan?: string;
  }>;
};

export default async function IniciarPage({ searchParams }: IniciarPageProps) {
  const params = (await searchParams) ?? {};
  const user = await getAuthenticatedUser();

  if (user) {
    const workspace = await getCurrentWorkspace();
    const plan = normalizePlanParam(params.plan);
    const clientDestination = plan ? `/dashboard/planos?plan=${encodeURIComponent(plan)}` : "/dashboard/planos";
    redirect(workspace?.profile.isPlatformAdmin ? "/admin" : clientDestination);
  }

  const plan = normalizePlanParam(params.plan);
  redirect(plan ? `/cadastro?plan=${encodeURIComponent(plan)}` : "/cadastro");
}

function normalizePlanParam(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9_-]{2,60}$/.test(normalized)) return normalized;

  return null;
}
