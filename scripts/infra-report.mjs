#!/usr/bin/env node
// Sends structured evidence only. This script never builds, deploys or runs SQL.
import { readFile } from "node:fs/promises";

async function main() {
  const base = new URL(process.env.INFRA_REPORT_URL ?? "");
  if (base.username || base.password || base.search || base.hash ||
      (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) throw new Error("invalid_url");
  const project = process.env.INFRA_REPORT_PROJECT ?? "";
  const token = process.env.INFRA_REPORT_TOKEN ?? "";
  if (!/^[a-z0-9-]{1,64}$/.test(project) || !/^[A-Za-z0-9_-]{32,256}$/.test(token) || !process.argv[2]) throw new Error("missing_configuration");
  const body = await readFile(process.argv[2], "utf8");
  if (Buffer.byteLength(body) > 65536) throw new Error("oversized_payload");
  JSON.parse(body);
  const url = new URL(`/api/infrastructure/${project}/events`, base);
  // Same deployId + sequence + exact payload must be retained across retries.
  for (let attempt = 0; attempt < 3; attempt++) {
    let status;
    try {
      const result = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body });
      status = result.status;
      if (result.ok) { console.log("Infrastructure event acknowledged."); return; }
    } catch { /* Never print URLs, headers, payload or exception text. */ }
    if (status && status < 500 && status !== 429) throw new Error("event_rejected");
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error("report_unavailable");
}
main().catch(() => {
  console.error("Infrastructure event was not acknowledged. Keep the payload for an ordered retry; inspect the receiver audit.");
  process.exitCode = 1;
});
