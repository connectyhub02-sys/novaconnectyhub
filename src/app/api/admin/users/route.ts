import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { deleteAdminPlatformUser, getAdminPlatformUsers } from "@/lib/admin/users";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const snapshot = await getAdminPlatformUsers();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar os usuarios." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<{
    confirmation?: unknown;
    deleteOrganization?: unknown;
    organizationId?: unknown;
    reason?: unknown;
    userId?: unknown;
  }>(request);

  try {
    const result = await deleteAdminPlatformUser({
      actorUserId: auth.userId,
      confirmation: readString(body?.confirmation),
      deleteOrganization: body?.deleteOrganization === true,
      organizationId: readString(body?.organizationId),
      reason: readString(body?.reason),
      userId: readString(body?.userId) ?? "",
    });

    revalidatePath("/admin/clientes");

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível excluir o usuário." },
      { status: statusForDeleteError(error) },
    );
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusForDeleteError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("não pode")
    || message.includes("não podem")
    || message.includes("Digite EXCLUIR")
    || message.includes("usuários vinculados")
    || message.includes("dono do workspace")
  ) {
    return 422;
  }

  if (message.includes("não encontrado") || message.includes("não possui")) {
    return 404;
  }

  return 500;
}
