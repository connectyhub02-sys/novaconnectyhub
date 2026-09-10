import * as advancedInput from "../src/lib/ai-api/advanced-input";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { aiChatExample, aiOpenApiSpec } from "../src/lib/ai-api/openapi";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { aiRequestExamples, aiResponseExample, aiSseExample } from "../src/lib/ai-api/examples";
import { aiDocPages, aiJavascriptExample } from "../src/lib/ai-api/documentation";
import { renderAiGuide } from "../src/lib/ai-api/guide";

describe("Public AI OpenAPI contract", () => {
  it("documents only implemented public routes with an independent AI credential", () => {
    expect(aiOpenApiSpec.servers[0].url).toBe("https://www.connectyhub.com.br/api/v1/ai");
    expect(Object.keys(aiOpenApiSpec.paths)).toHaveLength(31);
    for (const path of Object.keys(aiOpenApiSpec.paths)) {
      const resource=['caches','batches','videos','stores','documents','interactions','agents','environments'].includes(path.split('/')[1]);
      const route = resource?'/[...resource]':path.startsWith("/models/") ? "/models/[operation]" : path.replace("{request_id}", "[requestId]").replace("{id}","[id]");
      expect(existsSync(`src/app/api/v1/ai${route}/route.ts`)).toBe(true);
    }
    expect(aiOpenApiSpec.security).toEqual([{ AiBearerAuth: [] }]);
    expect(aiOpenApiSpec.components.securitySchemes.AiBearerAuth.scheme).toBe("bearer");
  });

  it("resolves every schema reference in the downloadable JSON", () => {
    const spec = JSON.parse(JSON.stringify(aiOpenApiSpec));
    let references = 0;
    function walk(value: unknown) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "$ref") {
          references++;
          const resolved = String(child).slice(2).split("/").reduce((node, part) => node?.[part], spec);
          expect(resolved, String(child)).toBeDefined();
        } else walk(child);
      }
    }
    walk(spec);
    expect(references).toBeGreaterThan(10);
  });

  it("provides a request example accepted by the real gateway and documents its limits", () => {
    const gateway = serverModuleHarness<{ parseAiInput: (body: unknown, limit: number) => { maxTokens: number } }>("src/lib/ai-api/gateway.ts", {"./advanced-input":advancedInput});
    expect(gateway.parseAiInput(aiChatExample, 2048).maxTokens).toBe(1024);
    expect(() => gateway.parseAiInput({ ...aiChatExample, tools: [] }, 2048)).toThrow();
    const request = aiOpenApiSpec.components.schemas.ChatRequest;
    expect(request.additionalProperties).toBe(false);
    expect(JSON.stringify(aiOpenApiSpec)).not.toMatch(/\btokens?\b|gemini|resolves_to|requests_per_minute/i);
    expect(aiOpenApiSpec.paths["/chat/completions"].post.responses["200"].content).toHaveProperty("text/event-stream");
  });

  it("serves an anonymous JSON attachment without a session or provider dependency", async () => {
    const route = serverModuleHarness<{ GET: () => Promise<Response> }>("src/app/docs/api/ia/openapi.json/route.ts", {
      "next/server": { NextResponse: { json: Response.json.bind(Response) } },
      "@/lib/ai-api/openapi": { aiOpenApiSpec },
    });
    const response = await route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain('filename="connectyhub-ia-openapi.json"');
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual(aiOpenApiSpec);
  });

  it("validates every published payload with the actual gateway parser", () => {
    const gateway = serverModuleHarness<{ parseAiInput: (body: unknown, limit: number) => unknown }>("src/lib/ai-api/gateway.ts", {"./advanced-input":advancedInput});
    for (const example of Object.values(aiRequestExamples)) {
      expect(() => gateway.parseAiInput(example.value, 8192), example.summary).not.toThrow();
    }
    for (const field of ["tools", "tool_choice", "response_format", "conversation_id", "input", "files"]) {
      expect(() => gateway.parseAiInput({ ...aiChatExample, [field]: {} }, 8192)).toThrow();
    }
  });

  it("keeps the downloadable guide identical to the page source and local handoff", () => {
    const guide = renderAiGuide();
    expect(readFileSync("docs/guia-integracao-api-llm.md", "utf8")).toBe(guide);
    expect(new Set(aiDocPages.map(page => page.id)).size).toBe(aiDocPages.length);
    for (const page of aiDocPages) expect(guide).toContain(`## ${page.title}`);
    expect(guide).toContain("Operações por recurso");
    for(const resource of ['/interactions','/videos','/batches','/caches','/live'])expect(guide).toContain(resource);
    expect(guide + JSON.stringify(aiOpenApiSpec)).not.toMatch(/gemini|google|\btokens?\b|requests_per_minute/i);
  });

  it("publishes the actual buffered SSE wire format, including final credits", async () => {
    const route = serverModuleHarness<{ POST: (request: Request) => Promise<Response> }>("src/app/api/v1/ai/chat/completions/route.ts", {
      "next/server": { NextResponse: { json: Response.json.bind(Response) }, after: () => undefined },
      "@/lib/ai-api/gateway": {
        completeAi: async () => ({ response: aiResponseExample, requestId: aiResponseExample.connectyhub.request_id, stream: true, replayed: false }),
        AiApiError: class extends Error {},
      },
    }, [], { Response });
    const response = await route.POST(new Request("https://app.invalid/api/v1/ai/chat/completions", { method: "POST", body: JSON.stringify(aiRequestExamples.eventos.value) }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toBe(aiSseExample);
  });

  it("runs the documented JavaScript request without credentials in browser code", async () => {
    const requests: RequestInit[] = [];
    await runInNewContext(`(async () => { ${aiJavascriptExample} })()`, {
      process: { env: { CONNECTYHUB_AI_API_KEY: "test-key" } }, AbortSignal,
      console: { log: () => undefined, error: () => undefined },
      fetch: async (url: string, init: RequestInit) => {
        expect(url).toBe(`${aiOpenApiSpec.servers[0].url}/chat/completions`);
        requests.push(init);
        return Response.json(aiResponseExample);
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers).toMatchObject({ Authorization: "Bearer test-key", "Idempotency-Key": "pedido-123-resposta-1" });
    expect(JSON.parse(String(requests[0].body)).messages[0].role).toBe("user");
  });

  it("serves the complete Markdown guide anonymously", () => {
    const route = serverModuleHarness<{ GET: () => Response }>("src/app/docs/api/ia/guide.md/route.ts", {
      "@/lib/ai-api/guide": { renderAiGuide },
    }, [], { Response });
    const response = route.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("content-disposition")).toContain('filename="connectyhub-ia-guia.md"');
  });
});
