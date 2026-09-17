import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { projectConfiguration } from "@/lib/infrastructure/readiness";
import type { HealthCheck, Project } from "@/lib/infrastructure/model";
const project: Project = { id: "betel", name: "Betel", company: "Betel", environment: "production", topology: "vercel_proxy_vps", app: "VPS", supabase: "A confirmar", inngest: "A confirmar", worker: "A confirmar", storage: "A confirmar", organization_id: null, client_access_enabled: false };
afterEach(() => vi.unstubAllEnvs());
it("shows actionable setup requirements without secrets or false readiness for a seeded project", () => {
  vi.stubEnv("INFRA_PROJECT_DATABASE_URLS_JSON", "{}"); vi.stubEnv("INFRA_INGEST_KEYS_JSON", "[]"); vi.stubEnv("INFRA_JOB_ADAPTERS_JSON", "{}");
  const check: HealthCheck = { service: "app", health: "unknown", reason: "missing", checkedAt: new Date().toISOString(), configuration: "missing", missing: ["INFRA_HEALTH_PROJECTS_JSON.betel.app"] };
  const result = projectConfiguration(project, [check], false);
  expect(result.status).toBe("blocked"); expect(result.checked).toBe(0);
  expect(result.missing.join(" ")).toContain("INFRA_JOB_ADAPTERS_JSON.betel");
  expect(result.sql.missing.join(" ")).toContain("INFRA_ADMIN_USER_IDS");
  expect(result.sql.missing).toContain("INFRA_PROJECT_DATABASE_URLS_JSON.betel");
  expect(result.missing.join(" ")).toContain("infra_projects.organization_id");
});
it("distinguishes partial health configuration from SQL and reporter capability", () => {
  vi.stubEnv("INFRA_INGEST_KEYS_JSON", JSON.stringify([{ project: "vision", actor: "publisher", sha256: "f".repeat(64), scopes: ["deploy", "telemetry"] }]));
  const result = projectConfiguration(project, [{ service: "app", health: "error", reason: "HTTP 500", checkedAt: new Date().toISOString(), configuration: "ready", missing: [] }], true);
  expect(result.status).toBe("incomplete"); expect(result.checked).toBe(1); expect(result.reporter).toEqual({ deploy: false, telemetry: false });
});
