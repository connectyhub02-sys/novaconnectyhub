"use client";

import type { ComponentProps } from "react";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { cn } from "@/lib/utils";

/** Keeps the panel's color variables while providing a scrollable, keyboard-safe dialog. */
export function DialogFrame({ onClose, className, ...props }: ComponentProps<"div"> & { onClose: () => void }) {
  const ref = useDialogFocus(onClose);
  return <div {...props} ref={ref} role="dialog" aria-modal="true" tabIndex={-1}
    className={cn("ch-dialog-frame", className)} />;
}
