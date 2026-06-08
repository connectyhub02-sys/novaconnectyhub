import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type TrackingBody = {
  visitor_cookie_id?: unknown;
  session_cookie_id?: unknown;
  organization_id?: unknown;
  scope?: unknown;
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
  const body = await readBody(request);
  const visitorId = readString(body.visitor_cookie_id) ?? randomUUID();
  const sessionId = readString(body.session_cookie_id);
  const eventType = normalizeEventType(readString(body.event_type) ?? "page_view");
  const requestedOrganizationId = readUuid(readString(body.organization_id));
  const requestedScope = readString(body.scope);
  const metadata = readRecord(body.metadata) ?? {};
  const tracking = extractTrackingData(request);
  const authUser = await getAuthUser();
  const scope = requestedScope === "organization" && requestedOrganizationId ? "organization" : "platform";
  const sourceType = scope === "organization"
    ? "client_marketing_tracking"
    : authUser
      ? "platform_user_activity"
      : "platform_marketing_tracking";
  const pagePath = readString(metadata.page_path);
  const title = buildEventTitle(eventType, pagePath, sourceType);
  const summary = buildEventSummary(eventType, metadata, tracking);
  const firstTouch = readRecord(body.first_touch) ?? readRecord(metadata.first_touch);
  const lastTouch = readRecord(body.last_touch) ?? readRecord(metadata.last_touch);
  const attribution = readRecord(body.attribution) ?? readRecord(metadata.attribution);
  const consent = readString(body.consent) ?? readString(metadata.consent);
  const tags = buildTags({ eventType, scope, authUserId: authUser?.id ?? null, sessionId });
  const payload = {
    visitor_cookie_id: visitorId,
    session_cookie_id: sessionId,
    referrer: readString(body.referrer),
    search_params: readString(body.search_params),
    first_touch: firstTouch,
    last_touch: lastTouch,
    attribution,
    tracking_consent: consent,
    ...tracking,
    ...metadata,
    user_id: authUser?.id ?? null,
    user_email: authUser?.email ?? null,
    tracked_at: new Date().toISOString(),
  };

  try {
    const client = createServiceClient();
    const { error } = await client.from("intelligence_events").insert({
      scope,
      organization_id: scope === "organization" ? requestedOrganizationId : null,
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

function buildTags(input: { eventType: string; scope: "platform" | "organization"; authUserId: string | null; sessionId: string | null }) {
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
