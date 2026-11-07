/** Memory-only drafts: never share a reply between accounts, channels or conversations. */
export function attendanceDraftKey(scope: string | undefined, companyId: string | null | undefined, channel: string | null | undefined, conversationId: string | null, leadId: string | null | undefined) {
  return leadId ? JSON.stringify([scope ?? "client", companyId ?? "", channel ?? "", conversationId ?? `lead:${leadId}`]) : null;
}

export function acknowledgeAttendanceDraft(drafts: Record<string, string>, key: string | null, submitted: string) {
  if (!key || drafts[key] !== submitted) return drafts;
  const next = { ...drafts };
  delete next[key];
  return next;
}
