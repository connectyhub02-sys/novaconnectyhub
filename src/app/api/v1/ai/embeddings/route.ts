import {completeExtendedEmbedding} from '@/lib/ai-api/extended-embeddings';
import { createServiceClient } from "@/lib/supabase/service";
import { aiHttpFailure, readAiJson } from "@/lib/ai-api/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const result = await completeExtendedEmbedding(createServiceClient(),request,await readAiJson(request,20_000_000));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return aiHttpFailure(error); }
}
