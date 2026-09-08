"use client";

import { useEffect, useRef } from "react";

const dialogStack: HTMLElement[] = [];
let previousOverflow = "";

/** Keyboard navigation and scroll ownership for inline dialogs inside the panel theme. */
export function useDialogFocus(onClose: () => void, active = true) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const root = ref.current;
    if (!root || !active) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogStack.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogStack.push(root);
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]',
    )).filter(element => element.getClientRects().length && !element.closest('[inert], [aria-hidden="true"]'));
    const frame = requestAnimationFrame(() => (focusable()[0] ?? root).focus({ preventScroll: true }));
    function handleKey(event: KeyboardEvent) {
      if (dialogStack.at(-1) !== root) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0] ?? root!;
      const last = elements.at(-1) ?? root!;
      if (event.shiftKey && (document.activeElement === first || !root!.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !root!.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      dialogStack.splice(dialogStack.indexOf(root), 1);
      if (!dialogStack.length) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [active]);
  return ref;
}
