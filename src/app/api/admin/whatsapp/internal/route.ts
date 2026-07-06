import { NextResponse, type NextRequest } from "next/server";
import {
  connectPlatformWhatsappConsole,
  createPlatformWhatsappConsoleAgent,
  createPlatformWhatsappConsoleSectorAgent,
  disconnectPlatformWhatsappConsole,
  generatePlatformWhatsappCloneProfileFromHistory,
  getPlatformWhatsappMigrationCredential,
  getPlatformWhatsappConsoleState,
  refreshPlatformWhatsappConsoleStatus,
  resetPlatformWhatsappConsoleConnection,
  sendPlatformWhatsappHandoffNotificationTest,
  sendPlatformWhatsappConsoleTest,
  updatePlatformWhatsappConsoleSettings,
} from "@/lib/admin/platform-whatsapp-console";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActionBody = {
  action?: unknown;
  sectorId?: unknown;
  name?: unknown;
  roleTitle?: unknown;
  sectorName?: unknown;
  description?: unknown;
  prompt?: unknown;
  agentPrompt?: unknown;
  behavior?: unknown;
  cloneProfile?: unknown;
  qualificationConfig?: unknown;
  maxChats?: unknown;
  maxMessagesPerChat?: unknown;
  connectPhone?: unknown;
  phone?: unknown;
  text?: unknown;
  credential?: unknown;
};

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const state = await getPlatformWhatsappConsoleState({
      sectorId: asString(request.nextUrl.searchParams.get("sectorId")),
      userId: auth.userId,
      client: createServiceClient(),
    });

    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<ActionBody>(request);
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "create_agent") {
      const state = await createPlatformWhatsappConsoleAgent({
        sectorId: asString(body?.sectorId) ?? "",
        name: asString(body?.name) ?? "",
        roleTitle: asString(body?.roleTitle) ?? undefined,
        prompt: asString(body?.prompt) ?? undefined,
        userId: auth.userId,
        client: createServiceClient(),
      });

      return NextResponse.json({ state, notice: { tone: "success", message: "Agente criado. Agora configure prompt, arquivos, links e comportamento." } }, { status: 201 });
    }

    if (action === "create_sector_agent") {
      const state = await createPlatformWhatsappConsoleSectorAgent({
        sectorName: asString(body?.sectorName) ?? "",
        description: asString(body?.description) ?? undefined,
        name: asString(body?.name) ?? "",
        roleTitle: asString(body?.roleTitle) ?? undefined,
        userId: auth.userId,
        client: createServiceClient(),
      });

      return NextResponse.json({
        state,
        notice: { tone: "success", message: "Agente interno criado. Agora configure prompt, conexao e comportamento." },
      }, { status: 201 });
    }

    if (action === "connect") {
      const result = await connectPlatformWhatsappConsole({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        connectPhone: asString(body?.connectPhone),
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "refresh_status") {
      const result = await refreshPlatformWhatsappConsoleStatus({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "reset_connection") {
      const result = await resetPlatformWhatsappConsoleConnection({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        connectPhone: asString(body?.connectPhone),
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "disconnect") {
      const result = await disconnectPlatformWhatsappConsole({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "copy_migration_credential") {
      const credential = asMigrationCredentialKind(body?.credential);

      if (!credential) {
        return NextResponse.json({ error: "Credencial de migracao invalida." }, { status: 422 });
      }

      const result = await getPlatformWhatsappMigrationCredential({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        credential,
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "send_test") {
      const result = await sendPlatformWhatsappConsoleTest({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        phone: typeof body?.phone === "string" ? body.phone : "",
        text: typeof body?.text === "string" ? body.text : "",
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "send_handoff_test") {
      const result = await sendPlatformWhatsappHandoffNotificationTest({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        behavior: body?.behavior,
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    if (action === "generate_clone_profile_from_history") {
      const result = await generatePlatformWhatsappCloneProfileFromHistory({
        sectorId: asString(body?.sectorId) ?? "",
        userId: auth.userId,
        maxChats: asNumber(body?.maxChats),
        maxMessagesPerChat: asNumber(body?.maxMessagesPerChat),
        client: createServiceClient(),
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 422 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<ActionBody>(request);

  try {
    const state = await updatePlatformWhatsappConsoleSettings({
      sectorId: asString(body?.sectorId) ?? "",
      userId: auth.userId,
      agentPrompt: typeof body?.agentPrompt === "string"
        ? body.agentPrompt
        : typeof body?.prompt === "string"
          ? body.prompt
          : undefined,
      behavior: body?.behavior,
      cloneProfile: body?.cloneProfile,
      qualificationConfig: body?.qualificationConfig,
      client: createServiceClient(),
    });

    return NextResponse.json(state);
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

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function asMigrationCredentialKind(value: unknown) {
  return value === "serverUrl" || value === "instanceToken" ? value : null;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado no WhatsApp interno.",
  };
}
