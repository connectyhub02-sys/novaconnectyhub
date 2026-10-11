import "server-only";
import { requireClientCompanyAccess, type ClientCompany } from "@/lib/client-os/companies";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

const internalSlug = "connectyhub-platform-whatsapp";

export async function getMetaWorkspace() {
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return workspace;
  const result = await createServiceClient().from("organizations").select("id,name,slug,status")
    .eq("slug", internalSlug).eq("plan_code", "internal").eq("status", "active").single();
  if (result.error || !result.data) throw new Error("Operação interna Meta não localizada.");
  return { ...workspace, organization: { ...result.data, planCode: "internal", role: "owner" } };
}

// This exception is restricted to the platform's own Meta workspace. It does
// not grant administrators access to arbitrary customer assets.
export async function requireMetaCompanyAccess(input: Parameters<typeof requireClientCompanyAccess>[0]): Promise<ClientCompany> {
  try { return await requireClientCompanyAccess(input); }
  catch (clientAccessError) {
    const client = input.client ?? createServiceClient();
    const profile = await client.from("profiles").select("is_platform_admin").eq("id", input.userId).maybeSingle();
    if (profile.error || !profile.data?.is_platform_admin) throw clientAccessError;
    const result = await client.from("organizations").select("id,name,slug,status,created_at")
      .eq("id", input.companyId).eq("slug", internalSlug).eq("plan_code", "internal").eq("status", "active").maybeSingle();
    if (result.error || !result.data) throw clientAccessError;
    return { ...result.data, planCode: "internal", role: "owner", brandLogoUrl: null, brandLogoAlt: null, createdAt: result.data.created_at };
  }
}
