import { describe, expect, it } from "vitest";
import { publicAiCompletion, publicAiRequest, publicAiErrorCode } from "../src/lib/ai-api/public-response";
import { aiUsagePeriod, aiUsageStart } from "../src/lib/ai-api/usage";

const historical = { id:"chatcmpl-123",object:"chat.completion",created:1,model:"gemini-private",usage:{prompt_tokens:20,completion_tokens:30},choices:[{index:0,message:{role:"assistant",content:"Olá",provider_metadata:"private"},finish_reason:"stop"}],connectyhub:{credits:1.234567,request_id:"123",project_id:"project",provider_cost:0.5} };
describe("Credit-only public AI data",()=>{
  it("sanitizes old replays without changing text or credit precision",()=>{
    const response=publicAiCompletion(historical);
    expect(response.model).toBe("connectyhub-auto");
    expect(response.choices[0].message.content).toBe("Olá");
    expect(response.connectyhub.credits).toBe(1.234567);
    expect(JSON.stringify(response)).not.toMatch(/gemini|token|provider|usage/);
  });
  it("sanitizes stored requests and internal error codes",()=>{
    const response=publicAiRequest({id:"123",status:"completed",model_id:"gemini-private",response:historical,reserved_credits:0,charged_credits:1.234567,error_code:"token_count_failed",created_at:"2026-09-09"});
    expect(response.error_code).toBe("service_unavailable");
    expect(JSON.stringify(response)).not.toMatch(/gemini|token|provider|model_id/);
    expect(publicAiErrorCode("provider_rate_limited")).toBe("service_unavailable");
    expect(publicAiErrorCode("invalid_api_key")).toBe("invalid_api_key");
    expect(publicAiRequest({response:null}).response).toBeNull();
  });
  it("uses Brazilian calendar days and rejects unsupported periods",()=>{
    expect(aiUsageStart(7,new Date("2026-09-10T01:00:00Z"))).toBe("2026-09-03T03:00:00.000Z");
    expect(aiUsagePeriod(null)).toBe(30);
    expect(()=>aiUsagePeriod("100000")).toThrow();
  });
});
