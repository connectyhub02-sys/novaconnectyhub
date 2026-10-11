import "server-only";

import { createHmac } from "node:crypto";

/** Never infer granted permissions from the scopes requested in the login URL. */
export async function listMetaGrantedPermissions(input: {
  accessToken: string;
  config: { graphVersion: string; appSecret: string };
}) {
  const granted = new Set<string>();
  const seenCursors = new Set<string>();
  let after: string | undefined;

  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://graph.facebook.com/${input.config.graphVersion}/me/permissions`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("appsecret_proof", createHmac("sha256", input.config.appSecret).update(input.accessToken).digest("hex"));
    if (after) url.searchParams.set("after", after);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error || !Array.isArray(body.data)) {
      throw new Error("Nao foi possivel confirmar as permissoes concedidas pela Meta.");
    }
    for (const entry of body.data) {
      if (entry?.status === "granted" && typeof entry.permission === "string") granted.add(entry.permission);
    }
    if (!body.paging?.next) return [...granted].sort();
    // Rebuild the same trusted endpoint; never follow a URL containing credentials.
    after = body.paging.cursors?.after;
    if (typeof after !== "string" || !after || seenCursors.has(after)) break;
    seenCursors.add(after);
  }
  throw new Error("Nao foi possivel concluir a leitura das permissoes Meta.");
}
