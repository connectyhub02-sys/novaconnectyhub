export type ConnectyPublicTrackingContext = {
  scope?: "organization" | "platform" | null;
  organization_id?: string | null;
  tracking_token?: string | null;
  lead_id?: string | null;
  lead_phone?: string | null;
  conversation_id?: string | null;
  agent_id?: string | null;
  order_id?: string | null;
  payment_session_id?: string | null;
  tracking_link_id?: string | null;
  product_id?: string | null;
  catalog_item_id?: string | null;
  tracking_source?: string | null;
};

const contextKeys = [
  "scope",
  "organization_id",
  "tracking_token",
  "lead_id",
  "lead_phone",
  "conversation_id",
  "agent_id",
  "order_id",
  "payment_session_id",
  "tracking_link_id",
  "product_id",
  "catalog_item_id",
  "tracking_source",
] as const;

declare global {
  interface Window {
    __CONNECTYHUB_TRACKING_CONTEXT__?: ConnectyPublicTrackingContext;
  }
}

export function readPublicTrackingContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const fromWindow = normalizePublicTrackingContext(window.__CONNECTYHUB_TRACKING_CONTEXT__);
  const fromUrl = readPublicTrackingContextFromSearchParams(new URLSearchParams(window.location.search));

  return mergePublicTrackingContext(fromWindow, fromUrl);
}

export function readPublicTrackingContextFromSearchParams(searchParams: URLSearchParams) {
  const context: ConnectyPublicTrackingContext = {};

  for (const key of contextKeys) {
    const value = readContextString(searchParams.get(key));

    if (value) {
      context[key] = value as never;
    }
  }

  return normalizePublicTrackingContext(context);
}

export function normalizePublicTrackingContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const context: ConnectyPublicTrackingContext = {};

  for (const key of contextKeys) {
    const normalized = readContextString(input[key]);

    if (normalized) {
      context[key] = normalized as never;
    }
  }

  if (context.scope !== "organization" && context.scope !== "platform") {
    context.scope = context.organization_id ? "organization" : null;
  }

  return Object.values(context).some(Boolean) ? context : null;
}

export function mergePublicTrackingContext(
  base: ConnectyPublicTrackingContext | null,
  override: ConnectyPublicTrackingContext | null,
) {
  const merged = normalizePublicTrackingContext({
    ...(base ?? {}),
    ...(override ?? {}),
  });

  return merged;
}

export function buildPublicTrackingApiBody(context: ConnectyPublicTrackingContext | null) {
  if (!context) {
    return {};
  }

  return {
    scope: context.scope,
    organization_id: context.organization_id,
    tracking_token: context.tracking_token,
    lead_id: context.lead_id,
    lead_phone: context.lead_phone,
    conversation_id: context.conversation_id,
    agent_id: context.agent_id,
    order_id: context.order_id,
    payment_session_id: context.payment_session_id,
    tracking_link_id: context.tracking_link_id,
    product_id: context.product_id,
    catalog_item_id: context.catalog_item_id,
    tracking_source: context.tracking_source,
  };
}

export function buildPublicTrackingMetadata(context: ConnectyPublicTrackingContext | null) {
  if (!context) {
    return {};
  }

  return {
    public_tracking: context,
    lead_id: context.lead_id,
    lead_phone: context.lead_phone,
    conversation_id: context.conversation_id,
    agent_id: context.agent_id,
    order_id: context.order_id,
    payment_session_id: context.payment_session_id,
    tracking_link_id: context.tracking_link_id,
    product_id: context.product_id,
    catalog_item_id: context.catalog_item_id,
    tracking_source: context.tracking_source,
  };
}

function readContextString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}
