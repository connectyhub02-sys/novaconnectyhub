import { NextResponse } from "next/server";
import { AiApiError, authenticateAi } from "@/lib/ai-api/gateway";
import { statusForAccessControlError } from "@/lib/billing/access-control";
import { loadPublicAiModels } from "@/lib/ai-api/model-service";
export async function GET(request: Request) {
  try {
    const auth = await authenticateAi(request);
    const { createServiceClient } = await import("@/lib/supabase/service");
    const models = await loadPublicAiModels(createServiceClient(), auth.billing.planCode);
    return NextResponse.json({ object: "list", selected_model: auth.key.model_id ?? "connectyhub-auto", data: models.filter(model => model.available).map(model => ({ ...model, usable_with_key: !auth.key.model_id || model.id === auth.key.model_id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: "Não foi possível listar os modelos." }, { status: error instanceof AiApiError ? error.status : statusForAccessControlError(error,503) }); }
}
