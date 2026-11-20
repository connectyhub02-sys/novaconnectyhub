import { opsCookieName, readCookie, verifyOpsToken } from "@/lib/infrastructure/ops-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Caddy forward_auth target for ops-*.connectyhub.com.br: 204 lets the request through. */
export async function GET(request: Request) {
  const session = verifyOpsToken(readCookie(request.headers.get("cookie"), opsCookieName));
  if (session) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Acesso restrito</title><p style=\"font-family:sans-serif\">Abra este painel pela Infraestrutura do Admin da ConnectyHub.</p>",
    { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
