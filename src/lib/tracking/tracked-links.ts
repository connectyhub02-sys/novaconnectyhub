type TrackingUtmInput = {
  campaign?: string | null;
  content?: string | null;
};

export function getPublicAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();

  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

export function createTrackedLinkSlug(label: string) {
  const slug = label
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42);

  return slug || "link";
}

export function createTrackedLinkTag(label: string, id: string) {
  return `{{link_${createTrackedLinkSlug(label)}_${id.slice(0, 6)}}}`;
}

export function buildTrackedLinkUrl(linkId: string) {
  return `${getPublicAppUrl()}/r/${encodeURIComponent(linkId)}`;
}

export function appendLeadTrackingParams(
  rawUrl: string,
  input: {
    organizationId?: string | null;
    leadId?: string | null;
    leadPhone?: string | null;
    conversationId?: string | null;
    orderId?: string | null;
    paymentSessionId?: string | null;
    trackingLinkId?: string | null;
    trackingSource?: string | null;
    trackingToken?: string | null;
  },
) {
  try {
    const url = new URL(rawUrl);

    if (input.organizationId) {
      url.searchParams.set("organization_id", input.organizationId);
      url.searchParams.set("scope", "organization");
    }

    if (input.trackingToken) {
      url.searchParams.set("tracking_token", input.trackingToken);
    }

    if (input.leadId) {
      url.searchParams.set("lead_id", input.leadId);
    }

    const phone = input.leadPhone?.replace(/\D/g, "") ?? "";

    if (phone) {
      url.searchParams.set("lead_phone", phone);
    }

    if (input.conversationId) {
      url.searchParams.set("conversation_id", input.conversationId);
    }

    if (input.orderId) {
      url.searchParams.set("order_id", input.orderId);
    }

    if (input.paymentSessionId) {
      url.searchParams.set("payment_session_id", input.paymentSessionId);
    }

    if (input.trackingLinkId) {
      url.searchParams.set("tracking_link_id", input.trackingLinkId);
    }

    if (input.trackingSource) {
      url.searchParams.set("tracking_source", input.trackingSource);
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Informe uma URL com http:// ou https://.");
  }

  const url = new URL(trimmed);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Informe uma URL publica valida.");
  }

  return url.toString();
}

export function applyTrackedLinkUtm(rawUrl: string, input: TrackingUtmInput = {}) {
  const url = new URL(rawUrl);

  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "connectyhub");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "whatsapp_agent");
  if (input.campaign && !url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", input.campaign);
  if (input.content && !url.searchParams.has("utm_content")) url.searchParams.set("utm_content", input.content);

  return url.toString();
}
