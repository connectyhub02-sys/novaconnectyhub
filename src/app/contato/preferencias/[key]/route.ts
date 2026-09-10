import { createServiceClient } from "@/lib/supabase/service";
import { loadLeadContactLink, optOutLeadContactByKey, validLeadContactKey } from "@/lib/automations/lead-contact-preferences";
import { leadContactPage } from "@/lib/automations/lead-contact-page";
import { accountNoticePageHeaders } from "@/lib/billing/account-notice-page";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ key: string }> };
const page = (state: Parameters<typeof leadContactPage>[0], key = "", status = 200) => new Response(leadContactPage(state, key), { status, headers: accountNoticePageHeaders });

export async function GET(_request: Request, context: Context) {
  const { key } = await context.params;
  if (!validLeadContactKey(key)) return page("missing", "", 404);
  try {
    const preference = await loadLeadContactLink(createServiceClient(), key);
    return preference ? page(preference.enabled ? "confirm" : "disabled", key) : page("missing", "", 404);
  } catch { return page("error", "", 503); }
}

export async function POST(request: Request, context: Context) {
  const { key } = await context.params;
  if (!validLeadContactKey(key)) return page("missing", "", 404);
  const origin = request.headers.get("origin");
  const sameOriginPrivateForm = origin === "null" && request.headers.get("sec-fetch-site") === "same-origin";
  if (origin && origin !== new URL(request.url).origin && !sameOriginPrivateForm) return page("error", "", 403);
  try {
    if ((await request.formData()).get("action") !== "unsubscribe") return page("error", "", 422);
    return await optOutLeadContactByKey(createServiceClient(), key) ? page("disabled") : page("missing", "", 404);
  } catch { return page("error", "", 503); }
}
