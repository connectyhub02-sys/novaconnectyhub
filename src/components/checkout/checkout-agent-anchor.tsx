"use client";

import { useEffect, useRef } from "react";

export const checkoutAgentAnchorReadyEvent = "connectyhub:checkout-agent-anchor-ready";

export function CheckoutAgentAnchor() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const anchor = ref.current;
    if (!anchor) return;
    // The dock may hydrate before the checkout. Only mount its portal once this slot is ready.
    anchor.dataset.checkoutAgentAnchor = "ready";
    window.dispatchEvent(new Event(checkoutAgentAnchorReadyEvent));
    return () => { delete anchor.dataset.checkoutAgentAnchor; };
  }, []);

  return <span ref={ref} className="empty:hidden" />;
}
