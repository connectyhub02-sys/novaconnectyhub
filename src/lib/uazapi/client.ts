import { getUazapiOperation, type UazapiAuthMode } from "./operations";

export type JsonRecord = Record<string, unknown>;

export type UazapiConfig = {
  baseUrl: string;
  hasAdminToken: boolean;
  hasInstanceToken: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string | null;
};

export type UazapiCallInput = {
  operationId: string;
  payload?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  instanceTokenOverride?: string;
};

export class UazapiRequestError extends Error {
  status: number;
  data: unknown;
  operationId: string;

  constructor(message: string, status: number, operationId: string, data: unknown) {
    super(message);
    this.name = "UazapiRequestError";
    this.status = status;
    this.data = data;
    this.operationId = operationId;
  }
}

export function getUazapiConfig(): UazapiConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return {
    baseUrl: (process.env.UAZAPI_BASE_URL || "https://free.uazapi.com").replace(/\/$/, ""),
    hasAdminToken: Boolean(process.env.UAZAPI_ADMIN_TOKEN),
    hasInstanceToken: Boolean(process.env.UAZAPI_INSTANCE_TOKEN),
    hasWebhookSecret: Boolean(process.env.UAZAPI_WEBHOOK_SECRET),
    webhookUrl: appUrl ? `${appUrl}/api/webhooks/uazapi` : null,
  };
}

export async function callUazapiOperation(input: UazapiCallInput) {
  const operation = getUazapiOperation(input.operationId);

  if (!operation) {
    throw new UazapiRequestError("Operacao Uazapi nao encontrada", 404, input.operationId, null);
  }

  const config = getUazapiConfig();
  const token = resolveToken(operation.auth, input.instanceTokenOverride);

  if (!token) {
    throw new UazapiRequestError(
      operation.auth === "admin"
        ? "UAZAPI_ADMIN_TOKEN nao configurado"
        : "UAZAPI_INSTANCE_TOKEN nao configurado",
      500,
      operation.operationId,
      { missingAuth: operation.auth },
    );
  }

  const url = new URL(`${config.baseUrl}${operation.path}`);

  if (input.query) {
    Object.entries(input.query).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    [operation.auth === "admin" ? "admintoken" : "token"]: token,
  };

  const canSendBody = operation.method !== "GET";
  const body = canSendBody && input.payload !== undefined ? JSON.stringify(input.payload) : undefined;

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: operation.method,
    headers,
    body,
    cache: "no-store",
  });

  const data = await readUazapiResponse(response);

  if (!response.ok) {
    throw new UazapiRequestError(
      `Uazapi respondeu com status ${response.status}`,
      response.status,
      operation.operationId,
      data,
    );
  }

  return {
    ok: true,
    status: response.status,
    operation,
    data,
  };
}

function resolveToken(auth: UazapiAuthMode, instanceTokenOverride?: string) {
  if (auth === "admin") {
    return process.env.UAZAPI_ADMIN_TOKEN;
  }

  return instanceTokenOverride || process.env.UAZAPI_INSTANCE_TOKEN;
}

async function readUazapiResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
