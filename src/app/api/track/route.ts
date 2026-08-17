import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  validatePublicWriteRequest,
  type PublicWriteGuardResult,
} from "@/lib/security/public-request-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  decideOrganizationAttribution,
  verifyOrganizationTrackingToken,
} from "@/lib/tracking/organization-attribution";
import { resolveLeadTrackingContext } from "@/lib/tracking/lead-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type TrackingBody = {
  visitor_cookie_id?: unknown;
  session_cookie_id?: unknown;
  organization_id?: unknown;
  scope?: unknown;
  tracking_token?: unknown;
  lead_id?: unknown;
  lead_phone?: unknown;
  conversation_id?: unknown;
  order_id?: unknown;
  payment_session_id?: unknown;
  tracking_link_id?: unknown;
  tracking_source?: unknown;
  event_type?: unknown;
  referrer?: unknown;
  search_params?: unknown;
  first_touch?: unknown;
  last_touch?: unknown;
  attribution?: unknown;
  consent?: unknown;
  metadata?: unknown;
};

export async function POST(request: NextRequest) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "track",
    maxPayloadBytes: 64 * 1024,
    rateLimit: {
      limit: 240,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const body = await readBody(request);
  const visitorId = readString(body.visitor_cookie_id) ?? randomUUID();
  const sessionId = readString(body.session_cookie_id);
  const eventType = normalizeEventType(readString(body.event_type) ?? "page_view");
  const requestedOrganizationId = readUuid(readString(body.organization_id));
  const requestedScope = readString(body.scope);
  const trackingToken = readString(body.tracking_token)
    ?? readString(request.headers.get("x-connectyhub-tracking-token"));
  const metadata = readRecord(body.metadata) ?? {};
  const publicTracking = readRecord(metadata.public_tracking) ?? {};
  const tracking = extractTrackingData(request);
  const authUser = await getAuthUser();
  const firstTouch = readRecord(body.first_touch) ?? readRecord(metadata.first_touch);
  const lastTouch = readRecord(body.last_touch) ?? readRecord(metadata.last_touch);
  const attribution = readRecord(body.attribution) ?? readRecord(metadata.attribution);
  const consent = readString(body.consent) ?? readString(metadata.consent);
  const requestedLeadId = readString(body.lead_id) ?? readString(metadata.lead_id) ?? readString(publicTracking.lead_id);
  const requestedConversationId = readString(body.conversation_id) ?? readString(metadata.conversation_id) ?? readString(publicTracking.conversation_id);
  const requestedLeadPhone = readString(body.lead_phone) ?? readString(metadata.lead_phone) ?? readString(publicTracking.lead_phone);
  const orderId = readString(body.order_id) ?? readString(metadata.order_id) ?? readString(publicTracking.order_id);
  const paymentSessionId = readString(body.payment_session_id) ?? readString(metadata.payment_session_id) ?? readString(publicTracking.payment_session_id);
  const trackingLinkId = readString(body.tracking_link_id) ?? readString(metadata.tracking_link_id) ?? readString(publicTracking.tracking_link_id);
  const trackingSource = readString(body.tracking_source) ?? readString(metadata.tracking_source) ?? readString(publicTracking.tracking_source);

  try {
    const client = createServiceClient();
    const authenticatedCanAccessOrganization = await canAttributeOrganization(
      client,
      authUser?.id ?? null,
      requestedOrganizationId,
    );
    const organizationAttribution = decideOrganizationAttribution({
      requestedOrganizationId,
      requestedScope,
      authenticatedCanAccessOrganization,
      hasValidTrackingToken: verifyOrganizationTrackingToken(requestedOrganizationId, trackingToken),
    });
    const scope = organizationAttribution.scope;
    const sourceType = scope === "organization"
      ? "client_marketing_tracking"
      : authUser
        ? "platform_user_activity"
        : "platform_marketing_tracking";
    const leadContext = await resolveLeadTrackingContext(client, {
      organizationId: organizationAttribution.organizationId,
      leadId: requestedLeadId,
      conversationId: requestedConversationId,
      leadPhone: requestedLeadPhone,
    });
    const pagePath = readString(metadata.page_path);
    const title = buildEventTitle(eventType, pagePath, sourceType);
    const summary = buildEventSummary(eventType, metadata, tracking);
    const tags = buildTags({
      eventType,
      scope,
      authUserId: authUser?.id ?? null,
      sessionId,
      hasLeadContext: Boolean(leadContext.leadId || leadContext.leadPhone),
    });
    const payload = {
      visitor_cookie_id: visitorId,
      session_cookie_id: sessionId,
      referrer: readString(body.referrer),
      search_params: readString(body.search_params),
      first_touch: firstTouch,
      last_touch: lastTouch,
      attribution,
      tracking_consent: consent,
      organization_attribution: {
        requested_organization_id: requestedOrganizationId,
        result: organizationAttribution.reason,
      },
      ...tracking,
      ...metadata,
      lead_id: leadContext.leadId,
      lead_phone: leadContext.leadPhone,
      conversation_id: leadContext.conversationId,
      order_id: orderId,
      payment_session_id: paymentSessionId,
      tracking_link_id: trackingLinkId,
      tracking_source: trackingSource,
      user_id: authUser?.id ?? null,
      user_email: authUser?.email ?? null,
      tracked_at: new Date().toISOString(),
    };
    const { error } = await client.from("intelligence_events").insert({
      scope,
      organization_id: organizationAttribution.organizationId,
      source_type: sourceType,
      source_id: visitorId,
      event_type: eventType,
      title,
      summary,
      confidence: 1,
      visibility: scope,
      tags,
      payload,
    });

    if (error) {
      return NextResponse.json({ visitor_id: visitorId, error: error.message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        visitor_id: visitorId,
        error: error instanceof Error ? error.message : "Tracking indisponivel.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    visitor_id: visitorId,
    vapid_public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

async function canAttributeOrganization(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null,
  organizationId: string | null,
) {
  if (!userId || !organizationId) {
    return false;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle<{ is_platform_admin: boolean | null }>();

  if (profile?.is_platform_admin) {
    return true;
  }

  const { data: membership } = await client
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  return Boolean(membership);
}

function publicGuardResponse(guard: Extract<PublicWriteGuardResult, { ok: false }>) {
  const headers = guard.retryAfterSeconds
    ? { "Retry-After": String(guard.retryAfterSeconds) }
    : undefined;

  return NextResponse.json({ error: guard.message }, { status: guard.status, headers });
}

async function readBody(request: NextRequest): Promise<TrackingBody> {
  try {
    const value = await request.json();
    return readRecord(value) ?? {};
  } catch {
    return {};
  }
}

async function getAuthUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user ?? null;
  } catch {
    return null;
  }
}

function extractTrackingData(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const parsed = parseUserAgent(userAgent);

  return {
    ip_address: getIpAddress(request),
    user_agent: userAgent,
    city: getDecodedHeader(request, ["x-vercel-ip-city", "cf-ipcity"]),
    region: getDecodedHeader(request, ["x-vercel-ip-country-region", "cf-region"]),
    country: getDecodedHeader(request, ["x-vercel-ip-country", "cf-ipcountry"]),
    device_type: parsed.deviceType,
    browser: parsed.browser,
    os: parsed.os,
  };
}

function getIpAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
}

function getDecodedHeader(request: NextRequest, keys: string[]) {
  for (const key of keys) {
    const value = request.headers.get(key);

    if (value) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
}

function parseUserAgent(userAgent: string) {
  const value = userAgent.toLowerCase();
  const deviceType = /tablet|ipad/i.test(userAgent)
    ? "tablet"
    : /mobile|android|iphone|ipod/i.test(userAgent)
      ? "mobile"
      : "desktop";
  const browser = value.includes("edg/")
    ? "edge"
    : value.includes("chrome/")
      ? "chrome"
      : value.includes("firefox/")
        ? "firefox"
        : value.includes("safari/")
          ? "safari"
          : "unknown";
  const os = value.includes("android")
    ? "android"
    : value.includes("iphone") || value.includes("ipad") || value.includes("ios")
      ? "ios"
      : value.includes("windows")
        ? "windows"
        : value.includes("mac os")
          ? "macos"
          : value.includes("linux")
            ? "linux"
            : "unknown";

  return { deviceType, browser, os };
}

function buildEventTitle(eventType: string, pagePath: string | null, sourceType: string) {
  if (eventType === "tracked_link.clicked") {
    return "Lead clicou em link rastreado";
  }

  if (sourceType === "platform_user_activity") {
    return `Usuario no painel: ${eventType}`;
  }

  if (sourceType === "client_marketing_tracking") {
    return `Lead do cliente: ${eventType}`;
  }

  return pagePath ? `Visitante ConnectyHub: ${pagePath}` : `Visitante ConnectyHub: ${eventType}`;
}

function buildEventSummary(eventType: string, metadata: JsonRecord, tracking: ReturnType<typeof extractTrackingData>) {
  const pagePath = readString(metadata.page_path);
  const location = [tracking.city, tracking.region, tracking.country].filter(Boolean).join(", ");

  if (pagePath) {
    return `${eventType} em ${pagePath}${location ? ` de ${location}` : ""}.`;
  }

  return `${eventType}${location ? ` de ${location}` : ""}.`;
}

function buildTags(input: {
  eventType: string;
  scope: "platform" | "organization";
  authUserId: string | null;
  sessionId: string | null;
  hasLeadContext: boolean;
}) {
  const tags = ["connecty_tracking", input.scope === "organization" ? "client_marketing" : "platform_marketing"];

  if (input.authUserId) {
    tags.push("authenticated_user");
  } else {
    tags.push("anonymous_visitor");
  }

  if (input.eventType.includes("gps")) tags.push("gps_tracking");
  if (input.eventType.includes("push")) tags.push("push_tracking");
  if (input.eventType.includes("scroll")) tags.push("behavior_tracking");
  if (input.eventType.includes("click")) tags.push("click_tracking");
  if (input.eventType.includes("form") || input.eventType.includes("signup") || input.eventType.includes("cadastro")) tags.push("conversion_tracking");
  if (input.eventType.includes("dashboard")) tags.push("dashboard_usage");
  if (input.hasLeadContext) tags.push("lead_tracking");
  if (input.sessionId) tags.push("session_tracking");

  return tags;
}

function normalizeEventType(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .slice(0, 80) || "page_view";
}

function readUuid(value: string | null) {
  if (!value) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
