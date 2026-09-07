"use client";

import { useEffect } from "react";
import { StoreAvailabilityMonitor } from "@/components/checkout/store-availability-monitor";
import {
  getPublicTrackingContextSignature,
  type ConnectyPublicTrackingContext,
  writePublicTrackingContext,
} from "@/lib/tracking/public-context";

type PublicTrackingContextBridgeProps = {
  context: ConnectyPublicTrackingContext | null;
};

export function PublicTrackingContextBridge({ context }: PublicTrackingContextBridgeProps) {
  const signature = getPublicTrackingContextSignature(context);

  useEffect(() => {
    writePublicTrackingContext(context);
  }, [context, signature]);

  return context?.scope === "organization" && context.organization_id ? <StoreAvailabilityMonitor organizationId={context.organization_id} /> : null;
}
