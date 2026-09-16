import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { type Migration } from "./model";
import { InvalidInput, identifier } from "./validation";

export function response(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export async function audit(actor: string, project: string | null, action: string, result: string, reason: string, target: string | null = null) {
  const { error } = await createServiceClient().from("infra_audit").insert({ actor, project_id: project, action, result, reason, target });
  if (error) throw new Error("AUDIT_UNAVAILABLE");
}
export function isInfraAdmin(userId: string, platformAdmin: boolean) {
  return platformAdmin && (process.env.INFRA_ADMIN_USER_IDS ?? "").split(",").map(v => v.trim()).filter(Boolean).includes(userId);
}
export async function access(mutation = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (mutation) await audit("anonymous", null, "operational_attempt", "denied", "session_required");
    return response({ error: "Sessão obrigatória." }, 401);
  }
  const { data: profile, error } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).maybeSingle();
  if (error || !profile?.is_platform_admin) {
    if (mutation) await audit(user.id, null, "operational_attempt", "denied", "platform_admin_required");
    return response({ error: "Apenas administradores da plataforma." }, 403);
  }
  return { userId: user.id, canOperate: isInfraAdmin(user.id, true) };
}
// Per-project/per-purpose hashes only, never sent to the browser or written to audit.
export function ingestionIdentity(request: Request, project: string): { actor: string; scopes: string[] } | null {
  let entries: { project: string; actor: string; sha256: string; scopes: string[] }[];
  try { entries = JSON.parse(process.env.INFRA_INGEST_KEYS_JSON ?? "[]"); } catch { return null; }
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(header) || !Array.isArray(entries)) return null;
  const digest = createHash("sha256").update(header.slice(7)).digest();
  for (const e of entries) {
    if (!e || typeof e !== "object" || e.project !== project || !/^[a-f0-9]{64}$/.test(e.sha256) || !Array.isArray(e.scopes)) continue;
    if (timingSafeEqual(digest, Buffer.from(e.sha256, "hex"))) {
      try { return { actor: `script:${identifier(e.actor, 64)}`, scopes: e.scopes }; } catch { return null; }
    }
  }
  return null;
}
export async function getProject(id: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new InvalidInput("Projeto inválido.");
  const { data, error } = await createServiceClient().from("infra_projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("INVENTORY_UNAVAILABLE");
  return data;
}
export async function migrationCatalog(project: string): Promise<Migration[]> {
  if (project !== "connectyhub") {
    const { data, error } = await createServiceClient().from("infra_migrations").select("version,name,sql,checksum").eq("project_id", project).order("version").limit(2000);
    if (error) throw new Error("CATALOG_UNAVAILABLE");
    return data ?? [];
  }
  const directory = join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(directory)).filter(f => /^\d+_[a-zA-Z0-9_-]+\.sql$/.test(f)).sort();
  return Promise.all(files.map(async name => {
    const sql = (await readFile(join(directory, name), "utf8")).replace(/\r\n/g, "\n");
    return { version: name.split("_")[0], name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}
export function failure(error: unknown) {
  return error instanceof InvalidInput ? response({ error: error.message }, 400) : response({ error: "Infraestrutura indisponível. Confira a migration 0150, o acesso e a configuração no servidor." }, 503);
}
