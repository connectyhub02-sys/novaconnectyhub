import { NextResponse } from "next/server";
import { getMetaWorkspace, requireMetaCompanyAccess } from "@/lib/meta/company-access";
import { createServiceClient } from "@/lib/supabase/service";
import { sendInboxReply } from "@/lib/meta/inbox-reply";
import { getAppBaseUrl } from "@/lib/client-os/guided-oauth";
export async function POST(request: Request) {
  const workspace = await getMetaWorkspace();
  if (!workspace) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  if (!workspace.organization) return NextResponse.json({ error: "Empresa obrigatória." }, { status: 422 });
  // Behind the production proxy, request.url can carry the internal container host.
  const origin = request.headers.get("origin");
  const allowedOrigins = new Set([new URL(request.url).origin, new URL(getAppBaseUrl()).origin]);
  if (!request.headers.get("content-type")?.startsWith("application/json") || (origin && !allowedOrigins.has(origin))) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const body = await request.json();
    const client = createServiceClient();
    const company = await requireMetaCompanyAccess({ client, userId: workspace.user.id, companyId: workspace.organization.id });
    const result = await sendInboxReply({ client, company, userId: workspace.user.id, requestId: String(body.requestId || ""), text: body.text, conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined, commentToken: typeof body.commentToken === "string" ? body.commentToken : undefined });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível preparar a resposta." }, { status: 400 });
  }
}
