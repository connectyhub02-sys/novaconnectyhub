import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGeminiCredentials } from "@/lib/gemini/credentials";

export const aiProviderOrigin = "https://generativelanguage.googleapis.com";
export class AiProviderFailure extends Error {
  constructor(public status: number, public uncertain: boolean) { super("O serviço não concluiu a operação."); }
}
export async function aiProviderRequest(client: SupabaseClient, path: string, method = "GET", body?: unknown, timeout = 90000) {
  if (!/^\/v1beta\/[A-Za-z0-9_.:%/-]+(?:\?[A-Za-z0-9_=&.%:+-]*)?$/.test(path) || path.includes("..")) throw new Error("Caminho de serviço inválido.");
  const { apiKey } = await loadGeminiCredentials(client);
  let response: Response;
  try {
    response = await fetch(aiProviderOrigin + path, { method, redirect: "error", headers: {
      "x-goog-api-key": apiKey, "Content-Type": "application/json",
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) });
  } catch { throw new AiProviderFailure(502, method !== "GET"); }
  if (!response.ok) throw new AiProviderFailure(response.status, method !== "GET" && ![400,401,403,404,409,413,422,429].includes(response.status));
  if (response.status === 204 || method === "DELETE") return {} as Record<string, unknown>;
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new AiProviderFailure(502, method !== "GET"); }
}
