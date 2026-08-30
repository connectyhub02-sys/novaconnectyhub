"use client";

export const commerceAgentTrackingEventName = "connectyhub:commerce-track";

export function publishCommerceAgentEvent(
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(commerceAgentTrackingEventName, {
    detail: {
      event_type: eventType,
      metadata,
    },
  }));
}
