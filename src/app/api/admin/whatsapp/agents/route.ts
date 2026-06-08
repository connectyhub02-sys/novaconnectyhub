import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  createPlatformWhatsappAgent,
  createPlatformWhatsappSector,
  deletePlatformWhatsappAgent,
  deletePlatformWhatsappSector,
  getPlatformWhatsappAgentsWorkspace,
} from "@/lib/admin/platform-whatsapp-agents";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const data = await getPlatformWhatsappAgentsWorkspace(createServiceClient());
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<{
    action?: unknown;
    sectorId?: unknown;
    sectorName?: unknown;
    description?: unknown;
    name?: unknown;
    roleTitle?: unknown;
    prompt?: unknown;
  }>(request);

  const action = typeof body?.action === "string" ? body.action : "";
  const client = createServiceClient();

  try {
    if (action === "create_sector") {
      const sector = await createPlatformWhatsappSector({
        userId: auth.userId,
        name: typeof body?.sectorName === "string" ? body.sectorName : "",
        description: typeof body?.description === "string" ? body.description : undefined,
        client,
      });

      revalidateWhatsappAdmin();
      return NextResponse.json({ sector }, { status: 201 });
    }

    if (action === "create_agent") {
      const agent = await createPlatformWhatsappAgent({
        userId: auth.userId,
        sectorId: typeof body?.sectorId === "string" ? body.sectorId : "",
        name: typeof body?.name === "string" ? body.name : "",
        roleTitle: typeof body?.roleTitle === "string" ? body.roleTitle : undefined,
        prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
        client,
      });

      revalidateWhatsappAdmin();
      return NextResponse.json({ agent }, { status: 201 });
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<{ agentId?: unknown; sectorId?: unknown }>(request);
  const client = createServiceClient();

  try {
    if (typeof body?.sectorId === "string" && body.sectorId.trim()) {
      const sector = await deletePlatformWhatsappSector({
        sectorId: body.sectorId,
        client,
      });

      revalidateWhatsappAdmin();
      return NextResponse.json({ deletedSectorId: sector.id });
    }

    const agent = await deletePlatformWhatsappAgent({
      agentId: typeof body?.agentId === "string" ? body.agentId : "",
      client,
    });

    revalidateWhatsappAdmin();
    return NextResponse.json({ deletedAgentId: agent.id });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function revalidateWhatsappAdmin() {
  revalidatePath("/admin/whatsapp/atendimento");
  revalidatePath("/admin/whatsapp/agentes");
  revalidatePath("/admin/setores");
  revalidatePath("/admin/agentes");
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado.",
  };
}
