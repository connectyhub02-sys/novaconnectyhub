import { AiApiError, authenticateAi } from "@/lib/ai-api/gateway";
import { completeExtendedContent } from '@/lib/ai-api/extended-content';
import { streamExtendedContent } from '@/lib/ai-api/streaming';
import { createServiceClient } from "@/lib/supabase/service";
import { loadPublicAiModels } from "@/lib/ai-api/model-service";
import {aiHttpFailure} from '@/lib/ai-api/http';

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ operation: string }> };
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request, context: Context) {
  try {
    const client = createServiceClient();
    const auth = await authenticateAi(request, client);
    const { operation } = await context.params;
    const models = await loadPublicAiModels(client, auth.billing.planCode);
    const model = models.find(model => model.id === operation && model.available);
    return model ? Response.json({ ...model, usable_with_key: !auth.key.model_id || model.id === auth.key.model_id }, { headers })
      : Response.json({ error: "Modelo não encontrado." }, { status: 404, headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { operation } = await context.params;
    const match = operation.match(/^([a-z0-9.-]+):(generateContent|streamGenerateContent)$/);
    if (!match) return Response.json({ error: "Operação não encontrada." }, { status: 404, headers });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 20_000_000) { await reader.cancel(); throw new AiApiError("body_too_large", 413, "O conteúdo deve ter até 20 MB."); } chunks.push(part.value); }
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AiApiError("invalid_json", 400, "Envie um JSON válido."); }
    if(match[2]==='streamGenerateContent')return streamExtendedContent(request,{...body,model:match[1]});
    const result = await completeExtendedContent(request, { ...body, model: match[1] });
    return Response.json(result, { headers });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  return aiHttpFailure(error);
}
