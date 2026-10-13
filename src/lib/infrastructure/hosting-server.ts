import "server-only";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { readCapacity } from "./capacity-server";
import { projectUsage, type HostingInventory, type HostingPreview } from "./hosting";
import { InvalidInput } from "./validation";

export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) throw new InvalidInput("Origem inválida.");
}
export async function usageSources() {
  const [capacity, inventory] = await Promise.all([
    readCapacity().catch(() => null),
    readFile("/var/run/connectyhub-metrics/hosting.json", "utf8").then(raw => {
      if (raw.length > 256_000) throw new Error("INVENTORY_INVALID");
      return JSON.parse(raw) as HostingInventory;
    }).catch(() => null),
  ]);
  return (project: string) => projectUsage(project, capacity, inventory);
}
// Dedicated finite-operation broker; the web process has no Docker socket, SSH or arbitrary command API.
export async function hostingBroker(project: string, payload?: Record<string, unknown>): Promise<HostingPreview> {
  if (!/^[a-z0-9-]{1,64}$/.test(project)) throw new InvalidInput("Projeto inválido.");
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: "/var/run/connectyhub-hosting/control.sock", path: `/projects/${project}`, method: payload ? "POST" : "GET", headers: { "Content-Type": "application/json" } }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; if (body.length > 256_000) req.destroy(new Error("Resposta inválida.")); });
      res.on("end", () => {
        try { const data = JSON.parse(body); if (res.statusCode !== 200) return reject(new InvalidInput(data.error ?? "Operação indisponível.")); resolve(data); }
        catch { reject(new Error("HOSTING_UNAVAILABLE")); }
      });
      res.on("error", reject);
    });
    req.setTimeout(12_000, () => req.destroy(new Error("HOSTING_UNAVAILABLE")));
    req.on("error", reject);
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
