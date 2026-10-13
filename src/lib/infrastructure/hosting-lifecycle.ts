// Missing/stale data and paused/quarantined projects remain visible.
export function deletedHostingProjects(raw: unknown, now = Date.now()): Set<string> {
  const deleted = new Set<string>();
  if (!raw || typeof raw !== "object") return deleted;
  const snapshot = raw as { observedAt?: unknown; projects?: unknown };
  const at = typeof snapshot.observedAt === "string" ? Date.parse(snapshot.observedAt) : NaN;
  if (!Number.isFinite(at) || now - at > 120000 || at - now > 30000 || !snapshot.projects || typeof snapshot.projects !== "object" || Array.isArray(snapshot.projects)) return deleted;
  for (const [id, value] of Object.entries(snapshot.projects)) {
    if (!value || typeof value !== "object") continue;
    const p = value as { state?: unknown; services?: unknown };
    if (/^[a-z0-9-]{1,64}$/.test(id) && p.state === "deleted" && Array.isArray(p.services) && p.services.length === 0) deleted.add(id);
  }
  return deleted;
}
