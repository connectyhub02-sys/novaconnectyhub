import "server-only";
import { readFile } from "node:fs/promises";
import { deletedHostingProjects } from "./hosting-lifecycle";

export async function readDeletedHosting(): Promise<Set<string>> {
  try {
    const raw = await readFile("/var/run/connectyhub-metrics/hosting.json", "utf8");
    if (raw.length > 256000) return new Set();
    return deletedHostingProjects(JSON.parse(raw));
  } catch { return new Set(); }
}
