import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type * as Route from "../src/app/api/public/commerce-agent/message/route";
import type { PublicWriteGuardResult } from "../src/lib/security/public-request-guard";
import { serverModuleHarness } from "./helpers/server-module-harness";

type SavedMessage = { id: string; role: string; content: string };

function fixture() {
  const context = { ok: true, commerceSessionId: "commerce-session" };
  const validate = vi.fn((): PublicWriteGuardResult => ({ ok: true }));
  const resolve = vi.fn(async () => context);
  const persist = vi.fn(async (input: { role: string; content: string }): Promise<SavedMessage | null> => ({
    id: `persisted-${input.role}`,
    role: input.role,
    content: input.content,
  }));
  const buildReply = vi.fn(async () => "A visita pode ser agendada pela pagina do imovel.");
  const recordAction = vi.fn(async () => undefined);
  const billingError = new Error("Saldo insuficiente para este atendimento.");
  const route = serverModuleHarness<typeof Route>("src/app/api/public/commerce-agent/message/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/security/public-request-guard": { validatePublicWriteRequest: validate },
    "@/lib/commerce-agent/server": {
      readCommerceAgentBody: (body: unknown) => body,
      readCommerceAgentMessage: (body: { message?: string } | null) => body?.message?.trim() || null,
      resolveCommerceAgentContext: resolve,
      persistCommerceAgentMessage: persist,
      buildCommerceAgentReply: buildReply,
      isCommerceAgentBillingError: (error: unknown) => error === billingError,
      recordCommerceAgentAction: recordAction,
    },
  }, [], { Error });
  const request = (message = "Quero visitar este imovel.") => new Request("https://store.example.test/api/public/commerce-agent/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://store.example.test" },
    body: JSON.stringify({ message }),
  }) as NextRequest;

  return { context, validate, resolve, persist, buildReply, recordAction, billingError, route, request };
}

describe("storefront message persistence", () => {
  it.each(["throws", "returns null"])("does not generate a billable reply if saving the lead message %s", async (failure) => {
    const f = fixture();
    if (failure === "throws") f.persist.mockRejectedValueOnce(new Error("private database details"));
    else f.persist.mockResolvedValueOnce(null);

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Nao foi possivel salvar sua mensagem. Tente novamente em instantes." });
    expect(f.persist).toHaveBeenCalledTimes(1);
    expect(f.buildReply).not.toHaveBeenCalled();
    expect(f.recordAction).not.toHaveBeenCalled();
  });

  it.each(["throws", "returns null"])("does not report success or invent a reply ID if saving the reply %s", async (failure) => {
    const f = fixture();
    f.persist.mockResolvedValueOnce({ id: "persisted-lead", role: "lead", content: "Quero visitar este imovel." });
    if (failure === "throws") f.persist.mockRejectedValueOnce(new Error("private database details"));
    else f.persist.mockResolvedValueOnce(null);

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Sua mensagem foi salva, mas nao foi possivel registrar a resposta. Tente novamente em instantes." });
    expect(f.persist).toHaveBeenCalledTimes(2);
    expect(f.buildReply).toHaveBeenCalledTimes(1);
    expect(f.recordAction).not.toHaveBeenCalled();
  });

  it("returns the persisted reply ID only after both messages are saved", async () => {
    const f = fixture();
    f.buildReply.mockImplementationOnce(async () => {
      expect(f.persist).toHaveBeenCalledTimes(1);
      expect(f.persist).toHaveBeenCalledWith({ context: f.context, role: "lead", content: "Quero visitar este imovel." });
      return "Resposta registrada.";
    });
    f.persist.mockResolvedValueOnce({ id: "lead-row-id", role: "lead", content: "Quero visitar este imovel." });
    f.persist.mockResolvedValueOnce({ id: "assistant-row-id", role: "assistant", content: "Resposta registrada." });

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      commerceSessionId: "commerce-session",
      message: { id: "assistant-row-id", role: "assistant", content: "Resposta registrada." },
    });
    expect(f.persist).toHaveBeenNthCalledWith(2, { context: f.context, role: "assistant", content: "Resposta registrada." });
    expect(f.recordAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: "message", status: "applied" }));
  });

  it("keeps a billing failure at 402 without a successful assistant message or action", async () => {
    const f = fixture();
    f.buildReply.mockRejectedValueOnce(f.billingError);

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: f.billingError.message });
    expect(f.persist).toHaveBeenCalledTimes(1);
    expect(f.recordAction).not.toHaveBeenCalled();
  });

  it("preserves generation errors without recording an assistant message", async () => {
    const f = fixture();
    f.buildReply.mockRejectedValueOnce(new Error("Atendimento indisponivel."));

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Atendimento indisponivel." });
    expect(f.persist).toHaveBeenCalledTimes(1);
    expect(f.recordAction).not.toHaveBeenCalled();
  });

  it("keeps the stored reply usable if only the optional action log fails", async () => {
    const f = fixture();
    f.recordAction.mockRejectedValueOnce(new Error("Action log unavailable"));

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: { id: "persisted-assistant" } });
    expect(f.persist).toHaveBeenCalledTimes(2);
  });

  it("preserves the public request guard and its retry header before resolving or writing", async () => {
    const f = fixture();
    f.validate.mockReturnValueOnce({ ok: false, status: 429, message: "Tente mais tarde.", retryAfterSeconds: 45 });

    const response = await f.route.POST(f.request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.buildReply).not.toHaveBeenCalled();
  });

  it("rejects an empty message before resolving context or writing", async () => {
    const f = fixture();

    const response = await f.route.POST(f.request("   "));

    expect(response.status).toBe(422);
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.buildReply).not.toHaveBeenCalled();
  });
});
