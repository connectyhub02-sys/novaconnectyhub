export type HistoryPosition = { at: string; id: string };
export type AttendanceHistoryCursor = { whatsapp?: HistoryPosition | null; commerce?: HistoryPosition | null; events?: HistoryPosition | null };
export const historyUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAttendanceHistoryCursor(value: string | null): AttendanceHistoryCursor {
  if (!value) return {};
  if (value.length > 1500) throw new Error("Cursor invalido.");
  const parsed = JSON.parse(value) as AttendanceHistoryCursor;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Cursor invalido.");
  for (const [key, position] of Object.entries(parsed)) {
    if (!["whatsapp", "commerce", "events"].includes(key)) throw new Error("Cursor invalido.");
    if (position === null) continue;
    if (!position || typeof position.id !== "string" || typeof position.at !== "string" || !historyUuidPattern.test(position.id)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(position.at ?? "")
      || !Number.isFinite(Date.parse(position.at))) throw new Error("Cursor invalido.");
  }
  return parsed;
}

export function historyBeforeFilter(column: "occurred_at" | "created_at", position: HistoryPosition) {
  return `${column}.lt.${position.at},and(${column}.eq.${position.at},id.lt.${position.id})`;
}
