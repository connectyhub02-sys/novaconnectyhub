import { AiApiError } from "./gateway";
import { publicAiErrorCode } from "./public-response";
import { statusForAccessControlError } from "@/lib/billing/access-control";
import { AiInputError } from './advanced-input';
export async function readAiJson(request: Request, maximum = 28_000_000) {
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maximum) { await reader.cancel(); throw new AiApiError("body_too_large", 413, "O conteúdo excede o tamanho aceito nesta operação."); } chunks.push(part.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new AiApiError("invalid_json", 400, "Envie um JSON válido."); }
}
export function aiHttpFailure(error: unknown) {
  if(error instanceof AiInputError)error=new AiApiError(error.code,422,error.message);
  const known = error instanceof AiApiError ? error : null;
  return Response.json({ error: { code: known ? publicAiErrorCode(known.code) : "service_unavailable", message: known ? known.message : "Não foi possível concluir a operação.", ...(known?.requestId ? { request_id: known.requestId } : {}) } }, { status: known ? known.status : statusForAccessControlError(error, 503), headers: { "Cache-Control": "no-store", ...(known?.requestId ? { "X-Request-Id": known.requestId } : {}) } });
}
