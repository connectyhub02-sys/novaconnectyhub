export function leadContactMessage(text: string, url: string, choices: string[] = []) {
  // Uazapi cannot display mixed quick replies and URL buttons on WhatsApp Web.
  const exit = choices.length ? "sair_da_lista" : url;
  return { text: `${text}\n\nSair da lista de contatos automáticos: ${url}`, choices: [...choices, `Sair da lista|${exit}`] };
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

// Only retry as text after an explicit format rejection; never after an ambiguous delivery.
export async function sendLeadContactMessage<T extends { ok: boolean; status: number }>(
  send: (path: string, body: Record<string, unknown>) => Promise<T>,
  body: Record<string, unknown> & { text: string; choices: string[] },
  stillAllowed: () => Promise<boolean>,
) {
  const response = await send("/send/menu", { ...body, ...(body.choices.length > 3 ? { type: "list", listButton: "Opções do agendamento" } : { type: "button" }) });
  if (!response.ok && [400, 404, 405, 422].includes(response.status) && await stillAllowed()) {
    const { choices: _choices, footerText: _footer, ...textBody } = body;
    void _choices; void _footer;
    return send("/send/text", { ...textBody, linkPreview: false });
  }
  return response;
}
