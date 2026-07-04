import { NextResponse, type NextRequest } from "next/server";
import {
  deleteAdminCustomerWhatsappAgent,
  deleteAdminCustomerWhatsappInstance,
} from "@/lib/admin/customer-whatsapp";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody = {
  action?: unknown;
  instanceId?: unknown;
  agentId?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<ActionBody>(request);
  const action = asString(body?.action);
  const client = createServiceClient();

  try {
    if (action === "delete_instance") {
      const result = await deleteAdminCustomerWhatsappInstance({
        instanceId: asString(body?.instanceId) ?? "",
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, result });
    }

    if (action === "delete_agent") {
      const result = await deleteAdminCustomerWhatsappAgent({
        agentId: asString(body?.agentId) ?? "",
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: { message: "Acao invalida." } }, { status: 422 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Erro inesperado." } }, { status: 400 });
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
