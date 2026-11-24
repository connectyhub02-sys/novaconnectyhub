import { NextResponse } from "next/server";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { loadInboxContext, readInboxPosts, readInboxComments } from "@/lib/meta/inbox-content";
export async function GET(request: Request) {
  const workspace = await getMetaWorkspace();
  if (!workspace) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  if (!workspace.organization) return NextResponse.json({ error: "Empresa obrigatória." }, { status: 422 });
  const params = new URL(request.url).searchParams;
  const network = params.get("network");
  if (network !== "instagram" && network !== "facebook") return NextResponse.json({ error: "Rede inválida." }, { status: 400 });
  const after = params.get("after") || "";
  if (after.length > 3000) return NextResponse.json({ error: "Página inválida." }, { status: 400 });
  try {
    const client = createServiceClient();
    const company = await requireMetaCompanyAccess({ client, userId: workspace.user.id, companyId: workspace.organization.id });
    const ctx = await loadInboxContext(client, company.id);
    const post = params.get("post");
    const data = post ? await readInboxComments(ctx, network, post, after, params.get("parent") || "") : await readInboxPosts(ctx, network, after);
    return NextResponse.json({ ...data, canReply: ["owner", "admin"].includes(company.role) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar esta publicação ou seus comentários. Confira se o perfil está selecionado, se o conteúdo ainda existe e se as permissões estão válidas." }, { status: 403 });
  }
}
