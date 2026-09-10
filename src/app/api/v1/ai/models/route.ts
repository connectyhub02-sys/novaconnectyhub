import { NextResponse } from "next/server";
import { AiApiError, authenticateAi, listAiModels } from "@/lib/ai-api/gateway";
import { statusForAccessControlError } from "@/lib/billing/access-control";
export async function GET(request: Request) {
  try {
    await authenticateAi(request);
    await listAiModels();
    return NextResponse.json({ object: "list", data: [{ id: "connectyhub-auto", object: "model", owned_by: "connectyhub" }] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: "Não foi possível listar os modelos." }, { status: error instanceof AiApiError ? error.status : statusForAccessControlError(error,503) }); }
}
