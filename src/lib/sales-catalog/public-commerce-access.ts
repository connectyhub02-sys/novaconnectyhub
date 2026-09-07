import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContractAccess } from "@/lib/billing/contract-access";

export const storeUnavailableMessage = "Loja temporariamente indisponível. Por favor, tente novamente mais tarde.";

export class PublicCommerceUnavailableError extends Error {
  readonly status = 503;
  readonly code = "store_temporarily_unavailable";
  constructor() { super(storeUnavailableMessage); this.name = "PublicCommerceUnavailableError"; }
}

// Resolve the owning company's contract on every request, including child companies.
// A failed lookup never makes an unavailable store public or exposes billing details.
export async function isPublicCommerceAvailable(organizationId: string, client: SupabaseClient) {
  try { return (await getContractAccess(organizationId, client)).allowed; }
  catch { return false; }
}

export async function assertPublicCommerceAccess(organizationId: string, client: SupabaseClient) {
  if (!(await isPublicCommerceAvailable(organizationId, client))) throw new PublicCommerceUnavailableError();
}

export async function publicCommerceBlockResponse(organizationId: string, client: SupabaseClient) {
  if (await isPublicCommerceAvailable(organizationId, client)) return null;
  return Response.json({ error: storeUnavailableMessage, code: "store_temporarily_unavailable" }, {
    status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" },
  });
}
