export function isMissingColumnError(error: unknown, columns: string[]) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = [
    record.message,
    record.details,
    record.hint,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (code !== "42703" && code !== "PGRST204" && !message.includes("schema cache") && !message.includes("does not exist")) {
    return false;
  }

  return columns.some((column) => message.includes(column.toLowerCase()));
}
