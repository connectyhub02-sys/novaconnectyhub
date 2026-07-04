import "server-only";

import type { UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

export type UazapiProviderInstanceDeleteResult = {
  providerDeleted: boolean;
  providerStatus: number | null;
  providerResponse: unknown;
  refreshedTokenUsed: boolean;
  skipped: boolean;
};

export async function deleteUazapiProviderInstance(input: {
  credentials: UazapiCredentials;
  providerInstanceId: string | null;
  token: string | null;
}): Promise<UazapiProviderInstanceDeleteResult> {
  let deleteResult: Awaited<ReturnType<typeof callUazapiCleanup>> | null = null;
  let refreshedTokenUsed = false;

  if (input.token) {
    deleteResult = await callUazapiCleanup(input.credentials, "/instance", {
      method: "DELETE",
      token: input.token,
    });
  }

  if ((!deleteResult?.ok || !input.token) && input.providerInstanceId) {
    const providerInstance = await findProviderInstance(input.credentials, input.providerInstanceId);

    if (!providerInstance) {
      return {
        providerDeleted: true,
        providerStatus: deleteResult?.status ?? 404,
        providerResponse: sanitizeProviderData(deleteResult?.data ?? { message: "provider_instance_not_found" }),
        refreshedTokenUsed,
        skipped: false,
      };
    }

    const refreshedToken = findString(providerInstance, ["token", "instanceToken", "instance_token"]);

    if (refreshedToken && refreshedToken !== input.token) {
      refreshedTokenUsed = true;
      deleteResult = await callUazapiCleanup(input.credentials, "/instance", {
        method: "DELETE",
        token: refreshedToken,
      });
    }
  }

  if (!deleteResult) {
    return {
      providerDeleted: !input.providerInstanceId,
      providerStatus: null,
      providerResponse: input.providerInstanceId ? { message: "missing_instance_token" } : { message: "provider_instance_not_configured" },
      refreshedTokenUsed,
      skipped: !input.providerInstanceId,
    };
  }

  return {
    providerDeleted: deleteResult.ok,
    providerStatus: deleteResult.status,
    providerResponse: sanitizeProviderData(deleteResult.data),
    refreshedTokenUsed,
    skipped: false,
  };
}

async function findProviderInstance(credentials: UazapiCredentials, providerInstanceId: string) {
  const result = await callUazapiCleanup(credentials, "/instance/all", {
    method: "GET",
    admin: true,
  });

  if (!result.ok || !result.data) {
    return null;
  }

  const instances = Array.isArray(result.data)
    ? result.data
    : Array.isArray((result.data as JsonRecord).instances)
      ? (result.data as JsonRecord).instances as unknown[]
      : [];

  const match = instances.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as JsonRecord;
    const id = record.id ?? record.instance_id ?? record.instanceId;
    return typeof id === "string" && id === providerInstanceId;
  });

  return match && typeof match === "object" ? match as JsonRecord : null;
}

async function callUazapiCleanup(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "DELETE";
    token?: string;
    admin?: boolean;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.admin ? { admintoken: credentials.adminToken } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    cache: "no-store",
  });
  const data = await readResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => {
    return lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0;
  });

  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }

    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) {
      return item;
    }

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function sanitizeProviderData(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeProviderData);
  }

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      const normalized = key.toLowerCase();

      if (normalized.includes("token") || normalized.includes("secret") || normalized.includes("qrcode")) {
        return [key, "[redacted]"];
      }

      if (typeof item === "string" && item.length > 500 && (normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture"))) {
        return [key, "[redacted-image]"];
      }

      return [key, sanitizeProviderData(item)];
    }),
  );
}
