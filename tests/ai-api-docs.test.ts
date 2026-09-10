import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiChatExample, aiOpenApiSpec } from "../src/lib/ai-api/openapi";
import { serverModuleHarness } from "./helpers/server-module-harness";

describe("Public AI OpenAPI contract", () => {
  it("documents only implemented public routes with an independent AI credential", () => {
    expect(aiOpenApiSpec.servers[0].url).toBe("https://www.connectyhub.com.br/api/v1/ai");
    expect(Object.keys(aiOpenApiSpec.paths)).toHaveLength(3);
    for (const path of Object.keys(aiOpenApiSpec.paths)) {
      const route = path.replace("{request_id}", "[requestId]");
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
    const gateway = serverModuleHarness<{ parseAiInput: (body: unknown, limit: number) => { maxTokens: number } }>("src/lib/ai-api/gateway.ts");
    expect(gateway.parseAiInput(aiChatExample, 2048).maxTokens).toBe(1024);
    expect(() => gateway.parseAiInput({ ...aiChatExample, tools: [] }, 2048)).toThrow();
    const request = aiOpenApiSpec.components.schemas.ChatRequest;
    expect(request.additionalProperties).toBe(false);
    expect(JSON.stringify(aiOpenApiSpec)).not.toMatch(/token|gemini|resolves_to|requests_per_minute/i);
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
});
