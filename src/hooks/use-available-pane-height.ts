"use client";
import { useEffect, useRef } from "react";

/** Fits the conversation between its header and the app dock, including the mobile keyboard. */
export function useAvailablePaneHeight(layoutKey?: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    function measure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const dock = document.querySelector<HTMLElement>(".connecty-mobile-dock");
        const dockHeight = dock?.getBoundingClientRect().height ?? 0;
        const top = Math.max(0, element!.getBoundingClientRect().top);
        element!.style.setProperty("--attendance-height", `${Math.max(160, viewportHeight - top - dockHeight - 8)}px`);
      });
    }
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [layoutKey]);
  return ref;
}
