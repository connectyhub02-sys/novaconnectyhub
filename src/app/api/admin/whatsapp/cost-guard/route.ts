import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  getUazapiCostGuardAdminState,
  runUazapiInstanceCostGuard,
  updateUazapiCostGuardSettings,
} from "@/lib/whatsapp/uazapi-cost-guard";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ActionBody = {
  action?: unknown;
  enabled?: unknown;
  runTimeLocal?: unknown;
  trialGraceDays?: unknown;
  maxDeletionsPerRun?: unknown;
};

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const state = await getUazapiCostGuardAdminState();
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null) as ActionBody | null;
  const action = readString(body?.action);
  const client = createServiceClient();

  try {
    if (action === "update_settings") {
      const state = await updateUazapiCostGuardSettings({
        actorId: auth.userId,
        client,
        settings: {
          enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
          runTimeLocal: readString(body?.runTimeLocal) ?? undefined,
          trialGraceDays: readNumber(body?.trialGraceDays),
          maxDeletionsPerRun: readNumber(body?.maxDeletionsPerRun),
        },
      });

      revalidatePath("/admin/clientes/whatsapp");
      revalidatePath("/admin/api-whatsapp");

      return NextResponse.json({ ok: true, state });
    }

    if (action === "run_dry_run") {
      const summary = await runUazapiInstanceCostGuard({
        actorId: auth.userId,
        client,
        mode: "dry_run",
        triggerSource: "admin_panel",
      });
      const state = await getUazapiCostGuardAdminState(client);

      revalidatePath("/admin/clientes/whatsapp");
      revalidatePath("/admin/api-whatsapp");

      return NextResponse.json({ ok: true, state, summary });
    }

    return NextResponse.json({ ok: false, error: { message: "Acao invalida." } }, { status: 422 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: error instanceof Error ? error.message : "Erro inesperado." } },
      { status: 400 },
    );
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : undefined;
}
