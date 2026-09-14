export function leadContactMessage(text: string, url: string, choices: string[] = []) {
  // The common transport separates navigation buttons from quick replies.
  // Keep the exit action explicit; never depend on a URL in the prose.
  return { text, choices: [...choices, `Sair da lista|${url}`] };
}

export function isExplicitLeadOptOut(text: string | null) {
  return /^(sair[ _]da[ _]lista|sair|stop|unsubscribe)[.!]?$/i.test(text?.trim() ?? "");
}

export function leadOptOutButtonReply(value: unknown): string | null {
  const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const root = record(value);
  // Inspect selected replies only. Quoted messages and their available buttons are not a decision.
  for (const item of [root, record(root.content), record(root.message)]) {
    const button = record(item.buttonsResponseMessage);
    const row = record(record(item.listResponseMessage).singleSelectReply);
    const interactive = record(item.interactiveResponseMessage);
    let native: Record<string, unknown> = {};
    try { native = record(JSON.parse(String(record(interactive.nativeFlowResponseMessage).paramsJson ?? "{}"))); } catch { /* malformed reply */ }
    if ([item.selectedButtonId, item.selectedRowId, button.selectedButtonId, row.selectedRowId, native.id].some(id => id === "sair_da_lista")) return "sair_da_lista";
  }
  return null;
}

// Required actions must survive every delivery. A rejection is not permission
// to degrade the message or silently remove the unsubscribe action.
export async function sendLeadContactMessage<T extends { ok: boolean; status: number }>(
  send: (path: string, body: Record<string, unknown>) => Promise<T>,
  body: Record<string, unknown> & { text: string; choices: string[]; hideButtonLinks?: boolean },
  stillAllowed: () => Promise<boolean>,
) {
  if (!await stillAllowed()) throw new Error("Contato automático não autorizado.");
  const { hideButtonLinks: _legacy, ...payload } = body;
  void _legacy;
  return send("/send/menu", { ...payload, type: "button" });
}
