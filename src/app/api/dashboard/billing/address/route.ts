import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { parseBillingAddress } from "@/lib/billing/billing-address";
import { loadBillingAddress } from "@/lib/billing/billing-address-store";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { loadAccountDocument } from "@/lib/account/signup-completion";
import { record } from "@/lib/sales-catalog/card-input";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) return json({ error: "Sessão obrigatória." }, 401);
  if (!["owner", "admin"].includes(workspace.organization.role)) return json({ error: "Somente responsáveis pela conta podem acessar o faturamento." }, 403);
  try { return json({ address: await loadBillingAddress(createServiceClient(), workspace.organization.id) }); }
  catch { return json({ error: "Não foi possível carregar o endereço de faturamento." }, 503); }
}

export async function PATCH(request: NextRequest) {
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "billing-address", maxPayloadBytes: 4000 });
  if (!guard.ok) return json({ error: guard.message }, guard.status);
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) return json({ error: "Sessão obrigatória." }, 401);
  if (!["owner", "admin"].includes(workspace.organization.role)) return json({ error: "Somente responsáveis pela conta podem editar o faturamento." }, 403);
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Origem ou formato não autorizado." }, 403);
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 4000) return json({ error: "Payload grande demais." }, 413);
  let address, subscriptionId: string | null;
  try { const body = record(JSON.parse(raw)); address = parseBillingAddress(body); subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : null; }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Confira o endereço." }, 422); }
  if (subscriptionId && !/^[0-9a-f-]{36}$/i.test(subscriptionId)) return json({ error: "Checkout inválido." }, 422);
  const client = createServiceClient();
  const document = await loadAccountDocument({ userId: workspace.user.id, client });
  const result = await client.rpc("save_organization_billing_address", { p_org: workspace.organization.id, p_actor: workspace.user.id, p_address: address, p_subscription: subscriptionId,
    p_contact: { name: workspace.profile.fullName ?? workspace.organization.name, email: workspace.profile.email ?? workspace.user.email ?? "", phone: workspace.profile.phone ?? "", documentPreview: document?.number ? `***${document.number.slice(-4)}` : "" } });
  if (result.error) return json({ error: "Não foi possível salvar o endereço. Tente novamente." }, 503);
  return json({ address });
}
