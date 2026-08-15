import { NextResponse, type NextRequest } from "next/server";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import { createClientCompany, deleteClientCompany, listClientCompanies, updateClientCompany } from "@/lib/client-os/companies";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    await assertAccountComplete({ userId: workspace.user.id, client: createServiceClient() });

    const companies = await listClientCompanies(workspace.user.id);
    return NextResponse.json({ companies });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{ name?: unknown }>(request);

  try {
    const company = await createClientCompany({
      userId: workspace.user.id,
      name: typeof body?.name === "string" ? body.name : "",
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

export async function PATCH(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{ companyId?: unknown; name?: unknown }>(request);

  try {
    await assertAccountComplete({ userId: workspace.user.id, client: createServiceClient() });

    const company = await updateClientCompany({
      userId: workspace.user.id,
      companyId: typeof body?.companyId === "string" ? body.companyId : "",
      name: typeof body?.name === "string" ? body.name : "",
    });

    return NextResponse.json({ company });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

export async function DELETE(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{ companyId?: unknown }>(request);

  try {
    const company = await deleteClientCompany({
      userId: workspace.user.id,
      companyId: typeof body?.companyId === "string" ? body.companyId : "",
    });

    return NextResponse.json({ deletedCompanyId: company.id });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function formatError(error: unknown) {
  return formatAccountCompletionError(error);
}

function statusForError(error: unknown, fallback: number) {
  return statusForAccountCompletionError(error, fallback);
}
