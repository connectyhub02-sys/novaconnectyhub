import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { response } from "@/lib/infrastructure/server";
import { usageSources } from "@/lib/infrastructure/hosting-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
    if (!user) return response({ error: "Sessão obrigatória." }, 401);
    const db = createServiceClient();
    // Membership is resolved from the authenticated user, never from a client-supplied organization ID.
    const memberships = await db.from("organization_members").select("organization_id").eq("user_id", user.id);
    if (memberships.error) throw memberships.error;
    const ids = (memberships.data ?? []).map(row => row.organization_id);
    if (!ids.length) return response({ projects: [] });
    const { data, error } = await db.from("infra_projects").select("id,name,organization_id").in("organization_id", ids).eq("client_access_enabled", true).order("name");
    if (error) throw error;
    const companies = await db.from("organizations").select("id,name").in("id", ids);
    if (companies.error) throw companies.error;
    const usage = await usageSources();
    return response({ projects: (data ?? []).map(row => ({ id: row.id, name: row.name, organizationId: row.organization_id, company: companies.data?.find(c => c.id === row.organization_id)?.name ?? "", usage: usage(row.id) })) });
  } catch { return response({ error: "Não foi possível consultar sua infraestrutura." }, 503); }
}
