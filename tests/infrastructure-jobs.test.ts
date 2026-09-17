import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock("@/lib/infrastructure/server", () => ({ audit: mocks.audit }));
import { collectJobs, executeJobAction } from "@/lib/infrastructure/jobs";

const state = () => ({ project: "betel", revision: "revision-1", observedAt: new Date().toISOString(), actions: ["inngest_pause", "inngest_resume", "inngest_retry", "inngest_resend"], snapshot: { functions: [{ id: "daily-job", status: "active" }], events: [{ id: "failed-run", status: "failed", retries: 1 }, { id: "done-run", status: "completed", retries: 0 }], failures: 1, retries: 1, queued: 0, delaySeconds: null, workers: 1 } });
const token = "t".repeat(48);
beforeEach(() => { mocks.audit.mockReset(); mocks.audit.mockResolvedValue(undefined); vi.stubEnv("INFRA_JOB_ADAPTERS_JSON", JSON.stringify({ betel: { url: "https://jobs.example/admin/jobs", token } })); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("isolates configuration, rejects insecure URLs and describes the missing project configuration", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(await collectJobs("vision")).toMatchObject({ status: "blocked", reason: expect.stringContaining("INFRA_JOB_ADAPTERS_JSON.vision") });
  vi.stubEnv("INFRA_JOB_ADAPTERS_JSON", JSON.stringify({ betel: { url: "http://jobs.example", token } }));
  expect((await collectJobs("betel")).status).toBe("blocked");
  expect(fetch).not.toHaveBeenCalled();
});
it("reads bounded authenticated jobs with project scope and no redirects", async () => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal("fetch", fetch);
  const result = await collectJobs("betel");
  expect(result).toMatchObject({ status: "ready", snapshot: { failures: 1, workers: 1 } });
  expect(fetch).toHaveBeenCalledWith(new URL("https://jobs.example/admin/jobs"), expect.objectContaining({ redirect: "error", cache: "no-store", headers: { Authorization: `Bearer ${token}`, "X-Infra-Project": "betel" } }));
  expect(JSON.stringify(result)).not.toContain(token);
});
it.each(["foreign", "stale", "secret", "oversize"])("blocks invalid job observations: %s", async mode => {
  const data = { ...state(), ...(mode === "foreign" ? { project: "vision" } : mode === "stale" ? { observedAt: "2020-01-01" } : mode === "secret" ? { privateToken: token } : {}) };
  vi.stubGlobal("fetch", vi.fn(async () => mode === "oversize" ? new Response("x".repeat(65537)) : Response.json(data)));
  const result = await collectJobs("betel");
  expect(result.status).toBe("error"); expect(result.actions).toEqual([]); expect(JSON.stringify(result)).not.toContain(token);
});
it("audits before sending a real adapter request and binds receipt/idempotency to project, action, target and revision", async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (!init?.method) return Response.json(state());
    const body = JSON.parse(String(init.body));
    expect(mocks.audit).toHaveBeenCalledWith("admin", "betel", "inngest_pause", "running", "job_action_started", "daily-job", expect.any(Object));
    expect(body).toMatchObject({ actor: "admin", project: "betel", action: "inngest_pause", target: "daily-job", revision: "revision-1" });
    expect(init.headers).toMatchObject({ "Idempotency-Key": body.operationId });
    return Response.json({ project: "betel", operationId: body.operationId, status: "completed" });
  }); vi.stubGlobal("fetch", fetch);
  const first = await executeJobAction("betel", "admin", "inngest_pause", "daily-job", "revision-1");
  const second = await executeJobAction("betel", "admin", "inngest_pause", "daily-job", "revision-1");
  expect(first.status).toBe("completed"); expect(second.operationId).toBe(first.operationId);
  expect(mocks.audit).toHaveBeenLastCalledWith("admin", "betel", "inngest_pause", "completed", "job_adapter_receipt", "daily-job", expect.objectContaining({ operationId: first.operationId }));
});
it("rejects stale confirmation, foreign target, unsupported action and replay of a completed run without POST", async () => {
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal("fetch", fetch);
  for (const [action, target, revision] of [["inngest_pause", "daily-job", "old"], ["inngest_pause", "foreign-job", "revision-1"], ["inngest_resume", "daily-job", "revision-1"], ["inngest_retry", "done-run", "revision-1"]] as const) {
    expect((await executeJobAction("betel", "admin", action, target, revision)).status).toBe("blocked");
  }
  expect(fetch.mock.calls.every(call => !((call as unknown[])[1] as RequestInit | undefined)?.method)).toBe(true);
});
it("does not dispatch if the durable audit fails", async () => {
  mocks.audit.mockRejectedValue(new Error("audit unavailable"));
  const fetch = vi.fn(async () => Response.json(state())); vi.stubGlobal("fetch", fetch);
  await expect(executeJobAction("betel", "admin", "inngest_retry", "failed-run", "revision-1")).rejects.toThrow("audit unavailable");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("records unknown outcome on timeout without retrying or leaking provider errors", async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => { if (!init?.method) return Response.json(state()); throw new Error("PRIVATE_TOKEN_PROVIDER_ERROR"); }); vi.stubGlobal("fetch", fetch);
  const result = await executeJobAction("betel", "admin", "inngest_retry", "failed-run", "revision-1");
  expect(result.status).toBe("unknown"); expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify([result, mocks.audit.mock.calls])).not.toContain("PRIVATE_TOKEN");
});
