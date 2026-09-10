import { authenticateAi } from "@/lib/ai-api/gateway";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadAiFile, publicAiFile } from "@/lib/ai-api/files";
import { aiHttpFailure, readAiJson } from "@/lib/ai-api/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try { const client = createServiceClient(); const auth = await authenticateAi(request, client); return Response.json(await uploadAiFile(client, auth, await readAiJson(request)), { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return aiHttpFailure(error); }
}
export async function GET(request: Request) {
  try {
    const client = createServiceClient(); const auth = await authenticateAi(request, client);
    const { data, error } = await client.from("ai_resources").select("*").eq("project_id", auth.project.id).eq("kind", "file").neq("status", "deleted").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json({ object: "list", data: (data ?? []).map(publicAiFile) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return aiHttpFailure(error); }
}
