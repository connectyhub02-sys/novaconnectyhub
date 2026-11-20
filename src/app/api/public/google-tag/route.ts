import { createServiceClient } from "@/lib/supabase/service";
import { verifyOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { isPublicCommerceAvailable } from "@/lib/sales-catalog/public-commerce-access";
import { isUuid } from "@/lib/meta/conversion-policy";
import { googleStoreTagFromRow, publicGoogleStoreTag, type GoogleStoreTagRow } from "@/lib/google/store-tag-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Store page asks which Google IDs to load; answers only for a valid store tracking token. */
export async function POST(request: Request) {
  try {
    const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "google-store-tag-public", maxPayloadBytes: 1024, rateLimit: { limit: 120, windowMs: 60000 } });
    if (!guard.ok) return json({ error: guard.message }, guard.status);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({}, 415);
    const raw = await request.text();
    if (raw.length > 1024) return json({}, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const org = body.organizationId;
    if (!isUuid(org) || !verifyOrganizationTrackingToken(org, typeof body.trackingToken === "string" ? body.trackingToken : null)) return json({}, 403);
    const client = createServiceClient();
    if (!await isPublicCommerceAvailable(org, client)) return json({ active: false });
    const row = await client.from("google_store_tags").select("measurement_id,ads_conversion_id,lead_label,enabled").eq("organization_id", org).maybeSingle();
    if (row.error) return json({ active: false });
    return json(publicGoogleStoreTag(googleStoreTagFromRow(row.data as GoogleStoreTagRow | null)));
  } catch {
    return json({}, 400);
  }
}
