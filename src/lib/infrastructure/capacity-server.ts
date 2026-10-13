import "server-only";
import { open } from "node:fs/promises";
import { parseCapacity } from "./capacity";

export async function readCapacity() {
  // Fixed file, mounted read-only. Never expose Docker, SSH or host credentials to the app.
  const file = await open("/var/run/connectyhub-metrics/capacity.json", "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error("INVALID_CAPACITY");
    return parseCapacity(JSON.parse(await file.readFile("utf8")));
  } finally { await file.close(); }
}
