import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { applyTrackedLinkUtm, getPublicAppUrl } from "@/lib/tracking/tracked-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type LinkMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await context.params;
  const safeLinkId = typeof linkId === "string" ? linkId.trim() : "";

  if (!safeLinkId) {
    return NextResponse.redirect(getPublicAppUrl());
  }

  const client = createServiceClient();
  const { data: link, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata")
    .eq("id", safeLinkId)
    .contains("tags", ["tracked_link_button"])
    .maybeSingle<LinkMemoryRow>();

  if (error || !link) {
    return NextResponse.redirect(getPublicAppUrl());
  }

  const metadata = readRecord(link.metadata) ?? {};
  const slug = readString(metadata.slug) ?? link.id.slice(0, 8);
  const leadId = request.nextUrl.searchParams.get("lead_id");
  const leadPhone = request.nextUrl.searchParams.get("lead_phone");
  const finalUrl = applyTrackedLinkUtm(link.content, {
    campaign: link.organization_id ? `company_${link.organization_id.slice(0, 8)}` : "company",
    content: slug,
  });
  const tracking = extractTrackingData(request);
  const cookieTracking = extractCookieTracking(request);
  const currentClicks = readNumber(metadata.click_count) ?? 0;

  await Promise.all([
    client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: link.organization_id,
      source_type: "tracked_link_button",
      source_id: link.id,
      event_type: "tracked_link.clicked",
      title: `Lead clicou: ${link.title}`,
      summary: leadPhone ? `Clique vindo do WhatsApp ${leadPhone}.` : "Clique vindo de link rastreado do WhatsApp.",
      confidence: 1,
      visibility: "organization",
      tags: ["tracked_link_click", "whatsapp_agent", "lead_tracking"],
      payload: {
        label: link.title,
        target_url: link.content,
        final_url: finalUrl,
        lead_id: leadId,
        lead_phone: leadPhone,
        ...cookieTracking,
        query: Object.fromEntries(request.nextUrl.searchParams.entries()),
        ...tracking,
      },
    }),
    client
      .from("intelligence_memory")
      .update({
        metadata: {
          ...metadata,
          click_count: currentClicks + 1,
          last_clicked_at: new Date().toISOString(),
        },
      })
      .eq("id", link.id),
  ]);

  return NextResponse.redirect(finalUrl);
}

function extractCookieTracking(request: NextRequest) {
  return {
    visitor_cookie_id: readCookieValue(request, "connecty_visitor_id"),
    session_cookie_id: readCookieValue(request, "connecty_session_id"),
    first_touch: readJsonCookie(request, "connecty_first_touch"),
    last_touch: readJsonCookie(request, "connecty_last_touch"),
    attribution: readJsonCookie(request, "connecty_utm"),
  };
}

function readCookieValue(request: NextRequest, name: string) {
  const value = request.cookies.get(name)?.value;

  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readJsonCookie(request: NextRequest, name: string): JsonRecord | null {
  const value = readCookieValue(request, name);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return readRecord(parsed);
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
    referrer: request.headers.get("referer"),
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

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
