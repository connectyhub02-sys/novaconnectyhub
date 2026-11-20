import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createOpsToken, isOpsTool, opsCookieMaxAge, opsCookieName, opsTools } from "@/lib/infrastructure/ops-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Platform admin opens a console: sign a short cookie for *.connectyhub.com.br and go there. */
export async function GET(request: NextRequest) {
  const tool = request.nextUrl.searchParams.get("tool");
  if (!isOpsTool(tool)) return NextResponse.json({ error: "Ferramenta desconhecida." }, { status: 404 });
  const workspace = await getCurrentWorkspace();
  if (!workspace?.profile.isPlatformAdmin) return NextResponse.json({ error: "Acesso restrito a administradores da plataforma." }, { status: 403 });
  const response = NextResponse.redirect(opsTools[tool], 302);
  response.cookies.set({
    name: opsCookieName,
    value: createOpsToken(workspace.user.id),
    domain: ".connectyhub.com.br",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: opsCookieMaxAge,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
