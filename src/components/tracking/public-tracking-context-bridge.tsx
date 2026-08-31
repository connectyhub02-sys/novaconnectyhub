"use client";

import { useEffect } from "react";
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

  return null;
}
