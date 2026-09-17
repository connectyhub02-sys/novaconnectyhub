import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: "admin-user" as string | null, admin: true, auditFails: false, audit: vi.fn(), rpc: vi.fn(), eq: vi.fn(), execute: vi.fn(), catalog: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/executor", () => ({ executeMigration: (...args: unknown[]) => mock.execute(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mock.user ? { id: mock.user } : null } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_platform_admin: mock.admin } }) }) }) }) }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({
  from: (table: string) => {
    const row = table === "infra_projects" ? { id: "betel", app: "app-production" } : null;
    const chain = {
      select: () => chain, eq: (...args: unknown[]) => { mock.eq(...args); return chain; }, order: () => chain, limit: () => chain, neq: () => chain,
      maybeSingle: async () => ({ data: row, error: null }),
      insert: async (v: unknown) => { mock.audit(v); return { error: mock.auditFails ? { message: "DO_NOT_LEAK_SECRET" } : null }; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "infra_migrations" ? mock.catalog : [], error: null }).then(resolve),
    };
    return chain;
  }, rpc: (...args: unknown[]) => mock.rpc(...args),
}) }));
import { POST as action } from "@/app/api/admin/infrastructure/[project]/actions/route";
import { POST as ingest } from "@/app/api/infrastructure/[project]/events/route";
import { GET as overview } from "@/app/api/admin/infrastructure/route";
import { GET as detail } from "@/app/api/admin/infrastructure/[project]/route";
import { POST as prepare } from "@/app/api/admin/infrastructure/[project]/migrations/route";
import { ingestionIdentity, isInfraAdmin } from "@/lib/infrastructure/server";
const token = "a".repeat(48);
const ctx = (project = "betel") => ({ params: Promise.resolve({ project }) });
const request = (body: unknown, opts: { bearer?: string; origin?: string } = {}) => new Request("http://localhost/api/admin/infrastructure/betel/actions", { method: "POST", headers: { "Content-Type": "application/json", Origin: opts.origin ?? "http://localhost", ...(opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {}) }, body: JSON.stringify(body) });
const event = { kind: "deploy", deployId: "a30a3a19-b65d-4a44-a92c-57c05c56f7ba", sequence: 1, stage: "queued", origin: "vps", app: "app-production", currentImage: "betel:v1", newImage: "betel:v2", container: "running", health: "unknown", code: "started" };
beforeEach(() => {
  vi.clearAllMocks(); mock.user = "admin-user"; mock.admin = true; mock.auditFails = false; mock.catalog = [];
  vi.stubEnv("INFRA_MIGRATION_EXECUTION_ENABLED", "false");
  vi.stubEnv("INFRA_PROJECT_DATABASE_URLS_JSON", "{}");
  vi.stubEnv("INFRA_ADMIN_USER_IDS", "admin-user");
  vi.stubEnv("INFRA_INGEST_KEYS_JSON", JSON.stringify([{ project: "betel", actor: "betel-publisher", sha256: createHash("sha256").update(token).digest("hex"), scopes: ["deploy"] }]));
  mock.rpc.mockResolvedValue({ data: { replay: false }, error: null });
});
it("executes only after permission, exact confirmation, reviewed hash and server configuration", async () => {
  const sql = "create table public.example(id int)";
  const checksum = createHash("sha256").update(sql).digest("hex");
  mock.catalog = [{ version: "9999", name: "example", sql, checksum }];
  const body = { action: "migration_apply", target: "9999", confirmation: "betel:migration_apply:9999", checksum };
  expect((await action(request(body), ctx())).status).toBe(409);
  expect((await action(request({ ...body, riskAccepted: checksum }), ctx())).status).toBe(501);
  expect(mock.execute).not.toHaveBeenCalled();
  vi.stubEnv("INFRA_MIGRATION_EXECUTION_ENABLED", "true");
  vi.stubEnv("INFRA_MIGRATION_EXECUTOR", "vps-sql");
  vi.stubEnv("INFRA_PROJECT_DATABASE_URLS_JSON", JSON.stringify({ betel: "postgres://operator:secret@db.example/betel" }));
  mock.execute.mockResolvedValue({ status: "applied" });
  expect((await action(request({ ...body, riskAccepted: checksum }), ctx())).status).toBe(200);
  expect(mock.execute).toHaveBeenCalledWith("betel", "admin-user", expect.objectContaining({ checksum }));
});
it("prepares SQL only for an infra admin on the same origin and never executes it", async () => {
  const body = { version: "9999", name: "example", sql: "create table public.example(id int)" };
  expect((await prepare(request(body, { origin: "https://evil.example" }), ctx())).status).toBe(403);
  expect((await prepare(request(body), ctx())).status).toBe(201);
  expect(mock.rpc).toHaveBeenCalledWith("infra_prepare_migration", expect.objectContaining({ p_project: "betel", p_actor: "admin-user" }));
  expect(mock.execute).not.toHaveBeenCalled();
  expect((await prepare(request({ ...body, sql: "begin; create table public.example(id int); commit;" }), ctx())).status).toBe(422);
});
it("requires session and platform admin for inventory and audits rejected operational attempts", async () => {
  mock.user = null;
  expect((await overview()).status).toBe(401);
  expect((await action(request({}), ctx())).status).toBe(401);
  expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ actor: "anonymous", result: "denied" }));
  mock.user = "client"; mock.admin = false;
  expect((await overview()).status).toBe(403);
  expect((await action(request({}), ctx())).status).toBe(403);
  expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ actor: "client", reason: "platform_admin_required" }));
});
it("platform admin alone cannot operate; infra allowlist never promotes a customer", async () => {
  vi.stubEnv("INFRA_ADMIN_USER_IDS", "customer");
  expect(isInfraAdmin("customer", false)).toBe(false);
  expect((await action(request({ action: "inngest_pause", target: "job" }), ctx())).status).toBe(403);
  expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ reason: "infra_admin_required" }));
});
it("validates selected deploy UUIDs and scopes historical event access to the project", async () => {
  expect((await detail(new Request("http://localhost/?deploy=invalid"), ctx())).status).toBe(400);
  expect((await detail(new Request(`http://localhost/?deploy=${event.deployId}`), ctx())).status).toBe(404);
  expect(mock.eq).toHaveBeenCalledWith("project_id", "betel");
  expect(mock.eq).toHaveBeenCalledWith("id", event.deployId);
});
it("requires same origin and exact confirmation, then audits blocked action without executing", async () => {
  const body = { action: "inngest_pause", target: "job", confirmation: "betel:inngest_pause:job" };
  expect((await action(request(body, { origin: "https://evil.example" }), ctx())).status).toBe(403);
  expect((await action(request({ ...body, confirmation: "vision:inngest_pause:job" }), ctx())).status).toBe(409);
  const response = await action(request(body), ctx());
  expect(response.status).toBe(501);
  expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "inngest_pause", result: "blocked" }));
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("rejects free SQL and a migration absent from the versioned catalog", async () => {
  expect((await action(request({ action: "migration_apply", target: "9999", confirmation: "betel:migration_apply:9999", sql: "drop table profiles" }), ctx())).status).toBe(400);
  expect((await action(request({ action: "migration_apply", target: "9999", confirmation: "betel:migration_apply:9999", checksum: "abc" }), ctx())).status).toBe(409);
});
it("fails closed without disclosing dependency errors if audit is unavailable", async () => {
  mock.auditFails = true;
  const response = await action(request({ action: "app_rollback", target: "app", confirmation: "betel:app_rollback:app" }), ctx());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("DO_NOT_LEAK_SECRET");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("binds ingestion token to one project and records credential failures without logging the token", async () => {
  expect((await ingest(request(event, { bearer: token }), ctx("vision"))).status).toBe(401);
  expect((await ingest(request(event), ctx())).status).toBe(401);
  expect(JSON.stringify(mock.audit.mock.calls)).not.toContain(token);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("enforces purpose scopes, rejects arbitrary logs, derives executor from credential", async () => {
  expect((await ingest(request({ kind: "telemetry" }, { bearer: token }), ctx())).status).toBe(403);
  expect((await ingest(request({ ...event, logs: "password=secret" }, { bearer: token }), ctx())).status).toBe(400);
  const result = await ingest(request(event, { bearer: token }), ctx());
  expect(result.status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("infra_record_deploy", expect.objectContaining({ p_project: "betel", p_actor: "script:betel-publisher", p_event: expect.objectContaining({ sequence: 1 }) }));
});
it("returns ordered-ingestion conflicts and generic failures without secret-bearing DB messages", async () => {
  mock.rpc.mockResolvedValueOnce({ data: { error: "invalid_transition" }, error: null });
  expect((await ingest(request(event, { bearer: token }), ctx())).status).toBe(409);
  mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "DO_NOT_LEAK_SECRET" } });
  const response = await ingest(request(event, { bearer: token }), ctx());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("DO_NOT_LEAK_SECRET");
});
it("malformed credential configuration is fail-closed", () => {
  vi.stubEnv("INFRA_INGEST_KEYS_JSON", "not-json");
  expect(ingestionIdentity(request({}, { bearer: token }), "betel")).toBeNull();
  vi.stubEnv("INFRA_INGEST_KEYS_JSON", "[null,{}]");
  expect(ingestionIdentity(request({}, { bearer: token }), "betel")).toBeNull();
});
