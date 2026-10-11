import "server-only";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";

export class OfficialAccessError extends Error {
  constructor(message:string, public status:number) { super(message); }
}
export async function officialAccess(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) throw new OfficialAccessError("Sessão obrigatória.",401);
  const client = createServiceClient();
  const admin = new URL(request.url).searchParams.get("admin") === "1";
  if (admin && !workspace.profile.isPlatformAdmin) throw new OfficialAccessError("Acesso administrativo obrigatório.",403);
  let organizationId = workspace.organization?.id;
  if (admin) {
    // Internal company is a fixed server-side scope; never take a tenant ID from the caller.
    const internal = await client.from("organizations").select("id").eq("plan_code","internal").eq("slug","connectyhub-platform-whatsapp").maybeSingle();
    if (internal.error || !internal.data) throw new OfficialAccessError("Empresa interna da plataforma não localizada.",422);
    organizationId = internal.data.id;
  }
  if (!organizationId) throw new OfficialAccessError("Cadastre sua empresa antes de conectar.",422);
  if (!admin) {
    const company = await requireClientCompanyAccess({client,userId:workspace.user.id,companyId:organizationId});
    if (!["owner","admin"].includes(company.role)) throw new OfficialAccessError("Apenas proprietário ou administrador da empresa.",403);
    await assertBillableAccess({client,organizationId});
  }
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    // Browser mutations must originate from the public app, never arbitrary cross-site forms.
    const expected = new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.connectyhub.com.br").origin;
    if (origin !== expected) throw new OfficialAccessError("Origem da solicitação inválida.",403);
  }
  return {client,organizationId,actorId:workspace.user.id,isPlatformAdmin:workspace.profile.isPlatformAdmin,admin};
}
