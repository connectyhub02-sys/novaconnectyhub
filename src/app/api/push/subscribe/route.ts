import { createHash, randomUUID } from "node:crypto";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PushSubscribeBody = {
  visitor_cookie_id?: unknown;
  session_cookie_id?: unknown;
  organization_id?: unknown;
  tracking_token?: unknown;
  permission?: unknown;
  subscription?: unknown;
  metadata?: unknown;
};

export async function POST(request: NextRequest) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "push-subscribe",
    maxPayloadBytes: 64 * 1024,
    rateLimit: {
      limit: 24,
      windowMs: 10 * 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const body = await readBody(request);
  const subscription = readRecord(body.subscription);
  const keys = readRecord(subscription?.keys);
  const endpoint = readString(subscription?.endpoint);
  const p256dh = readString(keys?.p256dh);
  const auth = readString(keys?.auth);

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Assinatura push incompleta." }, { status: 400 });
  }

  const visitorId = readString(body.visitor_cookie_id) ?? randomUUID();
  const sessionId = readString(body.session_cookie_id);
  const requestedOrganizationId = readUuid(readString(body.organization_id));
  const trackingToken = readString(body.tracking_token)
    ?? readString(request.headers.get("x-connectyhub-tracking-token"));
  const permission = normalizePermission(readString(body.permission));
  const metadata = readRecord(body.metadata) ?? {};
  const authUser = await getAuthUser();
  const now = new Date().toISOString();
  const endpointHash = fingerprint(endpoint);

  try {
    const client = createServiceClient();
    const authenticatedCanAccessOrganization = await canAttributeOrganization(
      client,
      authUser?.id ?? null,
      requestedOrganizationId,
    );
    const organizationAttribution = decideOrganizationAttribution({
      requestedOrganizationId,
      requestedScope: requestedOrganizationId ? "organization" : null,
      allowOrganizationIdWithoutScope: true,
      authenticatedCanAccessOrganization,
      hasValidTrackingToken: verifyOrganizationTrackingToken(requestedOrganizationId, trackingToken),
    });
    const organizationId = organizationAttribution.organizationId;
    const scope = organizationAttribution.scope;
    const { data, error } = await client
      .from("push_subscriptions")
      .upsert(
        {
          visitor_cookie_id: visitorId,
          session_cookie_id: sessionId,
          user_id: authUser?.id ?? null,
          organization_id: organizationId,
          endpoint,
          p256dh,
          auth,
          permission,
          user_agent: request.headers.get("user-agent"),
          metadata: {
            ...metadata,
            endpoint_hash: endpointHash,
            expiration_time: subscription?.expirationTime ?? null,
            organization_attribution: {
              requested_organization_id: requestedOrganizationId,
              result: organizationAttribution.reason,
            },
          },
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: "endpoint" },
      )
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await client.from("intelligence_events").insert({
      scope,
      organization_id: organizationId,
      source_type: scope === "organization" ? "client_marketing_tracking" : "platform_marketing_tracking",
      source_id: visitorId,
      event_type: "push_subscription_saved",
      title: "Visitante autorizou Web Push",
      summary: "Assinatura push salva para comunicacao e acompanhamento do lead.",
      confidence: 1,
      visibility: scope,
      tags: [
        "connecty_tracking",
        "push_tracking",
        "subscription_tracking",
        sessionId ? "session_tracking" : "no_session",
        authUser ? "authenticated_user" : "anonymous_visitor",
      ],
      payload: {
        visitor_cookie_id: visitorId,
        session_cookie_id: sessionId,
        user_id: authUser?.id ?? null,
        user_email: authUser?.email ?? null,
        organization_id: organizationId,
        organization_attribution: {
          requested_organization_id: requestedOrganizationId,
          result: organizationAttribution.reason,
        },
        subscription_id: data?.id ?? null,
        endpoint_hash: endpointHash,
        permission,
        metadata,
        tracked_at: now,
      },
    });

    return NextResponse.json({
      ok: true,
      subscription_id: data?.id ?? null,
      endpoint_hash: endpointHash,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Nao foi possivel salvar a assinatura push.",
      },
      { status: 500 },
    );
  }
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

async function readBody(request: NextRequest): Promise<PushSubscribeBody> {
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

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizePermission(value: string | null) {
  if (value === "granted" || value === "denied" || value === "default" || value === "prompt") {
    return value;
  }

  return "unknown";
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: string | null) {
  if (!value) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
