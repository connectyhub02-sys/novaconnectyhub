import { authenticateAi } from "@/lib/ai-api/gateway";
import { createServiceClient } from "@/lib/supabase/service";
import { refreshAiFile } from "@/lib/ai-api/files";
import { aiHttpFailure } from "@/lib/ai-api/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return execute(request, context, false); }
export async function DELETE(request: Request, context: Context) { return execute(request, context, true); }
async function execute(request: Request, context: Context, remove: boolean) {
  try { const client = createServiceClient(); const auth = await authenticateAi(request, client); return Response.json(await refreshAiFile(client, auth, (await context.params).id, remove), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return aiHttpFailure(error); }
}
