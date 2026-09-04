export type ConnectyPublicTrackingContext = {
  scope?: "organization" | "platform" | null;
  organization_id?: string | null;
  tracking_token?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  conversation_id?: string | null;
  agent_id?: string | null;
  order_id?: string | null;
  payment_session_id?: string | null;
  tracking_link_id?: string | null;
  product_id?: string | null;
  catalog_item_id?: string | null;
  tracking_source?: string | null;
};

export const publicTrackingContextUpdatedEventName = "connectyhub:public-tracking-context-updated";

const contextKeys = [
  "scope",
  "organization_id",
  "tracking_token",
  "lead_id",
  "lead_name",
  "lead_phone",
  "lead_email",
  "conversation_id",
  "agent_id",
  "order_id",
  "payment_session_id",
  "tracking_link_id",
  "product_id",
  "catalog_item_id",
  "tracking_source",
] as const;

const publicTrackingStorageKey = "connectyhub_public_tracking_context";

declare global {
  interface Window {
    __CONNECTYHUB_TRACKING_CONTEXT__?: ConnectyPublicTrackingContext;
  }
}

export function writePublicTrackingContext(context: ConnectyPublicTrackingContext | null) {
  if (typeof window === "undefined") {
    return;
  }

  const incoming = normalizePublicTrackingContext(context);
  const normalized = context === null
    ? null
    : mergeStoredPublicTrackingContext(readStoredPublicTrackingContext(), incoming);

  if (normalized) {
    window.__CONNECTYHUB_TRACKING_CONTEXT__ = normalized;
    writeStoredPublicTrackingContext(normalized);
  } else {
    delete window.__CONNECTYHUB_TRACKING_CONTEXT__;
    clearStoredPublicTrackingContext();
  }

  window.dispatchEvent(new CustomEvent(publicTrackingContextUpdatedEventName, {
    detail: { context: normalized },
  }));
}

export function readPublicTrackingContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const fromWindow = normalizePublicTrackingContext(window.__CONNECTYHUB_TRACKING_CONTEXT__);
  const fromStorage = readStoredPublicTrackingContext();
  const fromUrl = readPublicTrackingContextFromSearchParams(new URLSearchParams(window.location.search));

  return mergePublicTrackingContext(mergeStoredPublicTrackingContext(fromStorage, fromWindow), fromUrl);
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
    lead_name: context.lead_name,
    lead_phone: context.lead_phone,
    lead_email: context.lead_email,
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
    lead_name: context.lead_name,
    lead_phone: context.lead_phone,
    lead_email: context.lead_email,
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

export function getPublicTrackingContextSignature(context: ConnectyPublicTrackingContext | null) {
  const normalized = normalizePublicTrackingContext(context);

  if (!normalized) {
    return "";
  }

  return contextKeys.map((key) => `${key}:${normalized[key] ?? ""}`).join("|");
}

function readContextString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function mergeStoredPublicTrackingContext(
  stored: ConnectyPublicTrackingContext | null,
  next: ConnectyPublicTrackingContext | null,
) {
  if (!stored) return next;
  if (!next) return stored;

  const storedOrganization = stored.organization_id ?? null;
  const nextOrganization = next.organization_id ?? null;

  if (storedOrganization && nextOrganization && storedOrganization !== nextOrganization) {
    return next;
  }

  return mergePublicTrackingContext(stored, next);
}

function readStoredPublicTrackingContext() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizePublicTrackingContext(window.localStorage.getItem(publicTrackingStorageKey)
      ? JSON.parse(window.localStorage.getItem(publicTrackingStorageKey) as string)
      : null);
  } catch {
    return null;
  }
}

function writeStoredPublicTrackingContext(context: ConnectyPublicTrackingContext) {
  try {
    window.localStorage.setItem(publicTrackingStorageKey, JSON.stringify(context));
  } catch {
    // Public tracking persistence cannot block commerce flows.
  }
}

function clearStoredPublicTrackingContext() {
  try {
    window.localStorage.removeItem(publicTrackingStorageKey);
  } catch {
    // Public tracking persistence cannot block commerce flows.
  }
}
