import { NextRequest } from "next/server";
import { callUazapiOperation, getUazapiConfig, UazapiRequestError } from "@/lib/uazapi/client";
import { getUazapiCategories, getUazapiOperation, uazapiOperations } from "@/lib/uazapi/operations";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";

export const dynamic = "force-dynamic";

type ExecuteBody = {
  operationId?: unknown;
  payload?: unknown;
  query?: unknown;
  instanceTokenOverride?: unknown;
  whatsappInstanceId?: unknown;
};

export async function GET() {
  const config = getUazapiConfig();

  return Response.json({
    config,
    categories: getUazapiCategories(),
    operations: uazapiOperations,
  });
}

export async function POST(request: NextRequest) {
  let body: ExecuteBody;

  try {
    body = (await request.json()) as ExecuteBody;
  } catch {
    return Response.json({ ok: false, error: "JSON invalido" }, { status: 400 });
  }

  if (typeof body.operationId !== "string" || body.operationId.length === 0) {
    return Response.json({ ok: false, error: "operationId e obrigatorio" }, { status: 400 });
  }

  const operation = getUazapiOperation(body.operationId);

  if (!operation) {
    return Response.json({ ok: false, error: "Operacao Uazapi nao encontrada" }, { status: 404 });
  }

  const sendsMessage = operation.path.startsWith("/send/") || ["/sender/simple", "/sender/advanced"].includes(operation.path);
  if ((sendsMessage || requiresInternalKey(operation.auth)) && !isAuthorizedInternalRequest(request)) {
    return Response.json(
      {
        ok: false,
        error:
          "Chave interna obrigatoria para esta operacao. Configure CONNECTYHUB_INTERNAL_API_KEY e envie x-connectyhub-internal-key.",
      },
      { status: 401 },
    );
  }

  try {
    // A caller-supplied token cannot establish which organization's lead file to use.
    let instanceTokenOverride = typeof body.instanceTokenOverride === "string" ? body.instanceTokenOverride : undefined;
    let outbound;
    if (sendsMessage) {
      if (typeof body.whatsappInstanceId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.whatsappInstanceId)) {
        return Response.json({ ok: false, error: "whatsappInstanceId é obrigatório para registrar o envio no arquivo do lead." }, { status: 400 });
      }
      const client = createServiceClient();
      const { data: instance, error } = await client.from("whatsapp_instances")
        .select("id, instance_token_encrypted").eq("id", body.whatsappInstanceId).maybeSingle();
      if (error || !instance?.instance_token_encrypted) {
        return Response.json({ ok: false, error: "Instância cadastrada com credencial segura não encontrada." }, { status: 400 });
      }
      const savedToken = decryptCredentialValue(instance.instance_token_encrypted);
      if (instanceTokenOverride && instanceTokenOverride !== savedToken) {
        return Response.json({ ok: false, error: "A credencial não corresponde à instância informada." }, { status: 400 });
      }
      instanceTokenOverride = savedToken;
      outbound = { instanceId: instance.id, client, source: "internal-operation" };
    }
    const result = await callUazapiOperation({
      operationId: body.operationId,
      payload: body.payload,
      query: isPlainRecord(body.query) ? normalizeQuery(body.query) : undefined,
      instanceTokenOverride,
      outbound,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof UazapiRequestError) {
      return Response.json(
        {
          ok: false,
          error: error.message,
          operationId: error.operationId,
          data: error.data,
        },
        { status: error.status },
      );
    }

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido ao chamar Uazapi",
      },
      { status: 500 },
    );
  }
}

function isAuthorizedInternalRequest(request: NextRequest) {
  const expected = process.env.CONNECTYHUB_INTERNAL_API_KEY;

  if (!expected) {
    return false;
  }

  return request.headers.get("x-connectyhub-internal-key") === expected;
}

function requiresInternalKey(auth: "admin" | "instance") {
  return process.env.NODE_ENV === "production" || auth === "admin";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeQuery(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => {
      return ["string", "number", "boolean"].includes(typeof value) || value === null || value === undefined;
    }),
  ) as Record<string, string | number | boolean | null | undefined>;
}
