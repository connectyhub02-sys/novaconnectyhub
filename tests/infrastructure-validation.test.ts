import { expect, it } from "vitest";
import { parseDeploy, parseSnapshot, readBody } from "@/lib/infrastructure/validation";
import { projectHealth, type Telemetry } from "@/lib/infrastructure/model";
const event = { kind: "deploy", deployId: "a30a3a19-b65d-4a44-a92c-57c05c56f7ba", sequence: 1, stage: "queued", origin: "vps", app: "app-production", currentImage: "betel:v1", newImage: "betel:v2", container: "running", health: "unknown", code: "started" };
export const snapshot = () => ({ kind: "telemetry", observedAt: new Date().toISOString(), payload: { services: { app: "healthy", api: "healthy", auth: "healthy", rest: "healthy", storage: "healthy", database: "healthy", inngest: "healthy", worker: "healthy" }, version: "v1", image: "betel:v1", container: "running", rollbackAvailable: null, appliedMigrations: null, tables: [], inngest: { functions: [], events: [], failures: null, retries: null, queued: null, delaySeconds: null, workers: null } } });
it("accepts only structured deploy progress and rejects logs/secret-like metadata", () => {
  expect(parseDeploy(event)).toMatchObject({ stage: "queued", app: "app-production" });
  for (const extra of [{ logs: "token=secret" }, { executor: "forged" }, { newImage: "https://user:password@host" }, { newImage: "postgres://user:password@host" }, { newImage: "sk-secret" }, { sequence: -1 }, { health: "green" }, { deployId: "../bad" }]) expect(() => parseDeploy({ ...event, ...extra })).toThrow();
});
it("requires health evidence for success and rollback, and explicitly separates GitHub push", () => {
  expect(() => parseDeploy({ ...event, stage: "completed" })).toThrow();
  expect(() => parseDeploy({ ...event, stage: "rollback", code: "rollback_ok" })).toThrow();
  expect(parseDeploy({ ...event, stage: "rollback", code: "progress" })).toMatchObject({ stage: "rollback" });
  expect(parseDeploy({ ...event, stage: "completed", origin: "github_push" })).toMatchObject({ origin: "github_push" });
});
it("preserves unknown metrics and rejects stale, future, missing or unbounded snapshot fields", () => {
  expect(parseSnapshot(snapshot()).payload.inngest.queued).toBeNull();
  for (const observedAt of ["bad", "2020-01-01", "2099-01-01"]) expect(() => parseSnapshot({ ...snapshot(), observedAt })).toThrow();
  expect(() => parseSnapshot({ ...snapshot(), payload: { ...snapshot().payload, token: "secret" } })).toThrow();
  expect(() => parseSnapshot({ ...snapshot(), payload: { ...snapshot().payload, tables: Array(101).fill({}) } })).toThrow();
});
it("never marks absent or stale observations as healthy", () => {
  const now = Date.now();
  const s = parseSnapshot(snapshot());
  const t: Telemetry = { payload: s.payload, executor: "script:collector", observed_at: s.observedAt, received_at: s.observedAt };
  expect(projectHealth(t, now)).toBe("healthy");
  expect(projectHealth(t, now + 121_000)).toBe("unknown");
  expect(projectHealth(null)).toBe("unknown");
  expect(projectHealth({ ...t, payload: { ...t.payload, services: { ...t.payload.services, auth: "error" } } }, now)).toBe("error");
});
it("limits actual request bytes even with no Content-Length", async () => {
  await expect(readBody(new Request("http://localhost", { method: "POST", body: JSON.stringify(event) }))).resolves.toEqual(event);
  await expect(readBody(new Request("http://localhost", { method: "POST", body: "x".repeat(65537) }))).rejects.toThrow("64 KiB");
});
