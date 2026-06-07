import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

type IntelligenceEventRow = {
  id: string;
  scope: string | null;
  organization_id: string | null;
  source_type: string | null;
  source_id: string | null;
  event_type: string;
  title: string | null;
  summary: string | null;
  tags: string[] | null;
  payload: JsonRecord | null;
  occurred_at: string | null;
};

export type AdminMarketingOverview = {
  totalEvents: number;
  platformVisitors: number;
  dashboardUsers: number;
  clientLeadEvents: number;
  trackedLinkClicks: number;
  gpsGranted: number;
  gpsDenied: number;
  pushGranted: number;
  pushKnown: number;
  topPages: AdminMarketingBucket[];
  topDevices: AdminMarketingBucket[];
  topBrowsers: AdminMarketingBucket[];
  topCountries: AdminMarketingBucket[];
  recentEvents: AdminMarketingEvent[];
  warnings: string[];
};

export type AdminMarketingBucket = {
  label: string;
  value: number;
};

export type AdminMarketingEvent = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string | null;
  tone: "cyan" | "green" | "amber" | "rose" | "zinc";
};

const emptyOverview: AdminMarketingOverview = {
  totalEvents: 0,
  platformVisitors: 0,
  dashboardUsers: 0,
  clientLeadEvents: 0,
  trackedLinkClicks: 0,
  gpsGranted: 0,
  gpsDenied: 0,
  pushGranted: 0,
  pushKnown: 0,
  topPages: [],
  topDevices: [],
  topBrowsers: [],
  topCountries: [],
  recentEvents: [],
  warnings: [],
};

export async function getAdminMarketingOverview(
  client: SupabaseClient = createServiceClient(),
): Promise<AdminMarketingOverview> {
  const { data, error } = await client
    .from("intelligence_events")
    .select("id, scope, organization_id, source_type, source_id, event_type, title, summary, tags, payload, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(1200);

  if (error) {
    return {
      ...emptyOverview,
      warnings: [`Nao foi possivel carregar rastreamento: ${error.message}`],
    };
  }

  const trackingRows = ((data ?? []) as IntelligenceEventRow[]).filter(isTrackingEvent);
  const platformVisitorIds = new Set<string>();
  const dashboardUserIds = new Set<string>();
  const pageCounter = new Map<string, number>();
  const deviceCounter = new Map<string, number>();
  const browserCounter = new Map<string, number>();
  const countryCounter = new Map<string, number>();
  let clientLeadEvents = 0;
  let trackedLinkClicks = 0;
  let gpsGranted = 0;
  let gpsDenied = 0;
  let pushGranted = 0;
  let pushKnown = 0;

  for (const row of trackingRows) {
    const payload = row.payload ?? {};
    const tags = row.tags ?? [];
    const eventType = row.event_type;
    const isClientEvent = row.scope === "organization"
      || Boolean(row.organization_id)
      || row.source_type === "client_marketing_tracking"
      || tags.includes("client_marketing")
      || tags.includes("lead_tracking")
      || eventType === "tracked_link.clicked";

    if (isClientEvent) {
      clientLeadEvents += 1;
    } else {
      const visitorId = readString(payload.visitor_cookie_id) ?? row.source_id;
      if (visitorId) platformVisitorIds.add(visitorId);
    }

    const userId = readString(payload.user_id);
    if (userId || eventType === "dashboard_page_view" || tags.includes("authenticated_user")) {
      dashboardUserIds.add(userId ?? readString(payload.visitor_cookie_id) ?? row.source_id ?? row.id);
    }

    if (eventType === "tracked_link.clicked") {
      trackedLinkClicks += 1;
    }

    if (eventType === "push_permission_status") {
      pushKnown += 1;
      if (readString(payload.permission) === "granted") {
        pushGranted += 1;
      }
    }

    if (eventType === "gps_location_granted" || readString(readRecord(payload.gps_permission)?.status) === "granted") {
      gpsGranted += 1;
    }

    if (eventType === "gps_permission_status" && readString(payload.permission) === "denied") {
      gpsDenied += 1;
    }

    increment(pageCounter, readString(payload.page_path));
    increment(deviceCounter, readString(payload.device_type));
    increment(browserCounter, readString(payload.browser));
    increment(countryCounter, readString(payload.country));
  }

  return {
    totalEvents: trackingRows.length,
    platformVisitors: platformVisitorIds.size,
    dashboardUsers: dashboardUserIds.size,
    clientLeadEvents,
    trackedLinkClicks,
    gpsGranted,
    gpsDenied,
    pushGranted,
    pushKnown,
    topPages: topBuckets(pageCounter, 5),
    topDevices: topBuckets(deviceCounter, 4),
    topBrowsers: topBuckets(browserCounter, 4),
    topCountries: topBuckets(countryCounter, 4),
    recentEvents: trackingRows.slice(0, 8).map(mapRecentEvent),
    warnings: trackingRows.length === 0
      ? ["Ainda nao ha eventos de rastreamento registrados."]
      : [],
  };
}

function isTrackingEvent(row: IntelligenceEventRow) {
  const tags = row.tags ?? [];
  return tags.includes("connecty_tracking")
    || tags.includes("lead_tracking")
    || tags.includes("client_marketing")
    || tags.includes("platform_marketing")
    || row.event_type === "tracked_link.clicked"
    || row.source_type?.includes("tracking");
}

function mapRecentEvent(row: IntelligenceEventRow): AdminMarketingEvent {
  const payload = row.payload ?? {};
  const location = [readString(payload.city), readString(payload.region), readString(payload.country)]
    .filter(Boolean)
    .join(", ");
  const pagePath = readString(payload.page_path);
  const detailParts = [
    row.scope === "organization" || row.organization_id ? "cliente" : "plataforma",
    pagePath,
    location,
  ].filter(Boolean);

  return {
    id: row.id,
    title: row.title ?? row.event_type,
    detail: detailParts.join(" · ") || row.summary || row.event_type,
    occurredAt: row.occurred_at,
    tone: getEventTone(row),
  };
}

function getEventTone(row: IntelligenceEventRow): AdminMarketingEvent["tone"] {
  if (row.event_type.includes("gps")) return "green";
  if (row.event_type.includes("push")) return "amber";
  if (row.event_type === "tracked_link.clicked") return "cyan";
  if (row.scope === "organization" || row.organization_id) return "cyan";
  return "zinc";
}

function increment(counter: Map<string, number>, label: string | null) {
  if (!label || label === "unknown") {
    return;
  }

  counter.set(label, (counter.get(label) ?? 0) + 1);
}

function topBuckets(counter: Map<string, number>, limit: number): AdminMarketingBucket[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
