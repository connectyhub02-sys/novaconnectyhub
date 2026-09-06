"use client";
import { sanitizePaymentAuditPayload } from "@/lib/security/payment-audit";

type Entry = { id: string; body: Record<string, unknown>; created: number; attempts: number; next: number };
const key = "connectyhub_tracking_outbox_v1";
let started = false, flushing = false;
export function compactTrackingQueue(entries: Entry[], now = Date.now()) {
  return entries.filter(entry => entry && typeof entry.id === "string" && entry.created > now - 3 * 86400000).slice(-100);
}
function read(): Entry[] {
  try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return compactTrackingQueue(Array.isArray(value) ? value : []); } catch { return []; }
}
function write(entries: Entry[]) { try { localStorage.setItem(key, JSON.stringify(compactTrackingQueue(entries))); } catch { /* Blocked storage must not block checkout. */ } }
async function deliver(entry: Entry) {
  const response = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry.body), keepalive: true, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("TRACKING_NOT_ACKNOWLEDGED");
  write(read().filter(item => item.id !== entry.id));
  return response.json().catch(() => null);
}
async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const entry of read().filter(item => item.next <= Date.now()).slice(0, 10)) {
      try { await deliver(entry); } catch {
        write(read().map(item => item.id === entry.id ? { ...item, attempts: item.attempts + 1, next: Date.now() + Math.min(300000, 2000 * 2 ** Math.min(item.attempts, 8)) } : item));
        break;
      }
    }
  } finally { flushing = false; }
}
export async function enqueueTrackingEvent(body: Record<string, unknown>) {
  if (!started) {
    started = true;
    window.addEventListener("online", () => void flush());
    window.setInterval(() => { if (document.visibilityState === "visible") void flush(); }, 15000);
  }
  const id = crypto.randomUUID();
  const entry: Entry = { id, created: Date.now(), attempts: 0, next: Date.now() + 15000, body: { ...sanitizePaymentAuditPayload(body) as Record<string, unknown>, event_id: id, occurred_at: new Date().toISOString() } };
  write([...read(), entry]);
  try { return await deliver(entry); } catch { return null; } finally { void flush(); }
}
