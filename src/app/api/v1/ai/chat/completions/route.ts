import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { processWalletAlerts } from "@/lib/billing/wallet-alerts";
import { AiApiError, completeAi } from "@/lib/ai-api/gateway";
import { statusForAccessControlError } from "@/lib/billing/access-control";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    // Bound actual bytes, not just a caller-controlled Content-Length header.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    if (reader) while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 2_000_000) { await reader.cancel(); throw new AiApiError("body_too_large",413,"A solicitação deve ter até 2 MB."); } chunks.push(part.value); }
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AiApiError("invalid_json",400,"Envie um JSON válido."); }
    const result = await completeAi(request, body);
    after(async () => { await processWalletAlerts(createServiceClient(),result.organizationId).catch(() => undefined); });
    const headers = { "Cache-Control": "no-store", "X-Request-Id": result.requestId, "Idempotency-Replayed": String(result.replayed) };
    if (!result.stream) return NextResponse.json(result.response, { headers });
    // Buffered SSE: account for the complete provider result before delivering
    // chunks. Disconnects/replays cannot orphan a partially charged response.
    const response = result.response as { id: string; created: number; model: string; choices: Array<{ message: { content: string }; finish_reason: string }>; usage: unknown; connectyhub: unknown };
    const chunk = { id: response.id, object: "chat.completion.chunk", created: response.created, model: response.model };
    const stream = `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: response.choices[0].message.content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: response.choices[0].finish_reason }], usage: response.usage, connectyhub: response.connectyhub })}\n\ndata: [DONE]\n\n`;
    return new Response(stream, { headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8" } });
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : statusForAccessControlError(error, 503);
    const requestId=error instanceof AiApiError?error.requestId:undefined;
    return NextResponse.json({ error: { code: error instanceof AiApiError ? error.code : "access_or_service_unavailable", request_id:requestId, message: error instanceof AiApiError ? error.message : "Não foi possível concluir a solicitação. Verifique o acesso e o histórico no painel." } }, { status, headers: { "Cache-Control": "no-store",...(requestId?{"X-Request-Id":requestId}:{}) } });
  }
}
