const BASE_URL = "https://www.connectyhub.com.br/api/v1";
const EXAMPLE_INSTANCE_ID = "ea36f5db-c8dd-48ca-9e28-73ca3f015d78";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type ApiDocMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiDocField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
  enumValues?: string[];
};

export type ApiDocResponse = {
  status: string;
  description: string;
};

export type ApiDocEndpoint = {
  id: string;
  tag: string;
  method: ApiDocMethod;
  path: string;
  summary: string;
  description: string;
  parameters: ApiDocField[];
  bodyFields: ApiDocField[];
  payloadFields: ApiDocField[];
  responses: ApiDocResponse[];
  requestExample: string | null;
  curlExample: string;
};

export type ApiDocGroup = {
  name: string;
  description: string;
  endpoints: ApiDocEndpoint[];
};

export type ApiDocSchema = {
  name: string;
  description: string;
  fields: ApiDocField[];
};

export type ApiDocsCatalog = {
  baseUrl: string;
  stats: {
    endpoints: number;
    groups: number;
    schemas: number;
    nativeEndpoints: number;
    advancedEndpoints: number;
  };
  groups: ApiDocGroup[];
  schemas: ApiDocSchema[];
  webhookEvents: string[];
  gettingStarted: {
    title: string;
    description: string;
    curl: string;
    response: string;
  }[];
};

type OpenApiSpec = {
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  responses?: Record<string, { description?: string }>;
};

type OpenApiParameter = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
  example?: unknown;
};

type OpenApiSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  example?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  additionalProperties?: unknown;
};

export function buildConnectyhubDocsCatalog(spec: OpenApiSpec): ApiDocsCatalog {
  const tagDescriptions = new Map((spec.tags ?? []).map((tag) => [tag.name ?? "Avancado", tag.description ?? ""]));
  const endpoints = collectEndpoints(spec);
  const groups = buildGroups(endpoints, tagDescriptions);
  const schemas = buildSchemas(spec.components?.schemas ?? {});

  return {
    baseUrl: BASE_URL,
    stats: {
      endpoints: endpoints.length,
      groups: groups.length,
      schemas: schemas.length,
      nativeEndpoints: endpoints.filter((endpoint) => !endpoint.path.startsWith("/provider/")).length,
      advancedEndpoints: endpoints.filter((endpoint) => endpoint.path.startsWith("/provider/")).length,
    },
    groups,
    schemas,
    webhookEvents: [
      "messages",
      "messages_update",
      "connection",
      "history",
      "presence",
      "chats",
      "contacts",
      "groups",
      "labels",
      "chat_labels",
      "newsletter_messages",
    ],
    gettingStarted: [
      {
        title: "Listar instancias",
        description: "Confirme quais instancias pertencem ao cliente autenticado.",
        curl: `curl "${BASE_URL}/instances" \\\n  -H "Authorization: Bearer ch_live_SEU_TOKEN"`,
        response: `{\n  "ok": true,\n  "instances": [\n    {\n      "id": "${EXAMPLE_INSTANCE_ID}",\n      "provider": "connectyhub",\n      "phoneNumber": "5511915834033",\n      "displayName": "Atendimento",\n      "profileImageUrl": "https://pps.whatsapp.net/...",\n      "status": "connected"\n    }\n  ]\n}`,
      },
      {
        title: "Enviar mensagem",
        description: "Use o id publico da instancia para enviar texto com controle de idempotencia.",
        curl: `curl "${BASE_URL}/messages/text" \\\n  -X POST \\\n  -H "Authorization: Bearer ch_live_SEU_TOKEN" \\\n  -H "Idempotency-Key: pedido-123" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "instanceId": "${EXAMPLE_INSTANCE_ID}",\n    "number": "5511999999999",\n    "text": "Ola! Mensagem enviada pela ConnectyHub API."\n  }'`,
        response: `{\n  "ok": true,\n  "messageId": "msg_...",\n  "status": "sent",\n  "provider": "connectyhub"\n}`,
      },
      {
        title: "Usar recurso avancado",
        description: "Para rotas avancadas, coloque o corpo real dentro de payload.",
        curl: `curl "${BASE_URL}/provider/chat/details" \\\n  -X POST \\\n  -H "Authorization: Bearer ch_live_SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "instanceId": "${EXAMPLE_INSTANCE_ID}",\n    "payload": {\n      "number": "5511999999999",\n      "preview": true\n    }\n  }'`,
        response: `{\n  "id": "5511999999999@s.whatsapp.net",\n  "name": "Cliente",\n  "profileImageUrl": "https://pps.whatsapp.net/..."\n}`,
      },
    ],
  };
}

function collectEndpoints(spec: OpenApiSpec): ApiDocEndpoint[] {
  const endpoints: ApiDocEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, OpenApiOperation>)[method];
      if (!operation || typeof operation !== "object") continue;
      endpoints.push(buildEndpoint(path, method.toUpperCase() as ApiDocMethod, operation));
    }
  }

  return endpoints.sort((a, b) => {
    const groupDiff = groupOrder(a.tag) - groupOrder(b.tag);
    if (groupDiff !== 0) return groupDiff;
    const pathDiff = a.path.localeCompare(b.path);
    if (pathDiff !== 0) return pathDiff;
    return methodOrder(a.method) - methodOrder(b.method);
  });
}

function buildEndpoint(path: string, method: ApiDocMethod, operation: OpenApiOperation): ApiDocEndpoint {
  const schema = getJsonBodySchema(operation.requestBody);
  const topLevelFields = schemaToFields(schema);
  const payloadSchema = schema?.properties?.payload;
  const payloadFields = schemaToFields(payloadSchema);
  const requestExample = method === "GET" ? null : JSON.stringify(exampleFromSchema(schema), null, 2);
  const endpoint: ApiDocEndpoint = {
    id: `${method}:${path}`,
    tag: operation.tags?.[0] ?? "Avancado",
    method,
    path,
    summary: operation.summary ?? titleFromPath(path),
    description: operation.description ?? "",
    parameters: (operation.parameters ?? []).map(parameterToField),
    bodyFields: topLevelFields,
    payloadFields,
    responses: Object.entries(operation.responses ?? {}).map(([status, response]) => ({
      status,
      description: response.description ?? "Resposta da API",
    })),
    requestExample,
    curlExample: "",
  };

  endpoint.curlExample = buildCurlExample(endpoint);
  return endpoint;
}

function buildGroups(endpoints: ApiDocEndpoint[], tagDescriptions: Map<string, string>): ApiDocGroup[] {
  const groups = new Map<string, ApiDocEndpoint[]>();

  for (const endpoint of endpoints) {
    const current = groups.get(endpoint.tag) ?? [];
    current.push(endpoint);
    groups.set(endpoint.tag, current);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b))
    .map(([name, groupEndpoints]) => ({
      name,
      description: tagDescriptions.get(name) || `Operacoes de ${name}.`,
      endpoints: groupEndpoints,
    }));
}

function buildSchemas(schemas: Record<string, OpenApiSchema>): ApiDocSchema[] {
  return Object.entries(schemas).map(([name, schema]) => ({
    name,
    description: schema.description ?? "",
    fields: schemaToFields(schema),
  }));
}

function parameterToField(parameter: OpenApiParameter): ApiDocField {
  return {
    name: `${parameter.in ?? "param"}:${parameter.name ?? "campo"}`,
    type: schemaType(parameter.schema),
    required: Boolean(parameter.required),
    description: parameter.description ?? "",
    example: stringifyExample(parameter.example ?? parameter.schema?.example),
    enumValues: enumValues(parameter.schema),
  };
}

function schemaToFields(schema?: OpenApiSchema | null): ApiDocField[] {
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);

  return Object.entries(schema.properties).map(([name, property]) => ({
    name,
    type: schemaType(property),
    required: required.has(name),
    description: property.description ?? "",
    example: stringifyExample(property.example),
    enumValues: enumValues(property),
  }));
}

function getJsonBodySchema(requestBody?: OpenApiOperation["requestBody"]) {
  return (
    requestBody?.content?.["application/json"]?.schema ??
    requestBody?.content?.["multipart/form-data"]?.schema ??
    requestBody?.content?.["application/x-www-form-urlencoded"]?.schema ??
    null
  );
}

function buildCurlExample(endpoint: ApiDocEndpoint) {
  const url = new URL(`${BASE_URL}${replacePathParams(endpoint.path)}`);
  const requiredQuery = endpoint.parameters.filter((parameter) => parameter.name.startsWith("query:") && parameter.required);

  for (const parameter of requiredQuery) {
    const name = parameter.name.replace("query:", "");
    url.searchParams.set(name, parameter.example ?? exampleForField(parameter));
  }

  const lines = [`curl "${url.toString()}"`];
  if (endpoint.method !== "GET") lines.push(`  -X ${endpoint.method}`);
  lines.push(`  -H "Authorization: Bearer ch_live_SEU_TOKEN"`);

  if (endpoint.parameters.some((parameter) => parameter.name === "header:Idempotency-Key")) {
    lines.push(`  -H "Idempotency-Key: pedido-123"`);
  }

  if (endpoint.requestExample) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${endpoint.requestExample}'`);
  }

  return lines.join(" \\\n");
}

function replacePathParams(path: string) {
  return path
    .replace("{instanceId}", EXAMPLE_INSTANCE_ID)
    .replace("{webhookId}", "whk_7d6a2cb2")
    .replace("{deliveryId}", "del_2ff7b1")
    .replace("{path}", "chat/details");
}

function exampleForField(field: ApiDocField) {
  if (field.name.includes("instanceId")) return EXAMPLE_INSTANCE_ID;
  if (field.name.includes("limit")) return "50";
  if (field.name.includes("offset")) return "0";
  if (field.name.includes("number")) return "5511999999999";
  return field.example ?? "valor";
}

function exampleFromSchema(schema?: OpenApiSchema | null, depth = 0): unknown {
  if (!schema || depth > 3) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.$ref) return {};

  const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type;
  if (type === "array") return [exampleFromSchema(schema.items, depth + 1)];
  if (type === "boolean") return true;
  if (type === "integer" || type === "number") return 1;
  if (type === "string") {
    if (schema.format === "uuid") return EXAMPLE_INSTANCE_ID;
    if (schema.format === "uri") return "https://cliente.com/webhooks/connectyhub";
    return "string";
  }

  if (schema.properties) {
    const value: Record<string, unknown> = {};
    const required = new Set(schema.required ?? []);
    const entries = Object.entries(schema.properties);
    for (const [name, property] of entries) {
      if (required.size === 0 || required.has(name) || ["instanceId", "payload", "number", "text", "file", "type"].includes(name)) {
        value[name] = name === "instanceId" ? EXAMPLE_INSTANCE_ID : exampleFromSchema(property, depth + 1);
      }
    }
    return value;
  }

  return {};
}

function schemaType(schema?: OpenApiSchema | null): string {
  if (!schema) return "any";
  if (schema.$ref) return schema.$ref.replace("#/components/schemas/", "");
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type === "array") return `${schemaType(schema.items)}[]`;
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  if (schema.additionalProperties) return "object";
  return "any";
}

function enumValues(schema?: OpenApiSchema | null) {
  return schema?.enum?.map((value) => String(value));
}

function stringifyExample(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function titleFromPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[{}]/g, ""))
    .join(" ");
}

function methodOrder(method: ApiDocMethod) {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].indexOf(method);
}

function groupOrder(tag: string) {
  const order = [
    "Nativo ConnectyHub",
    "Instancias",
    "Perfil",
    "Business",
    "Chamadas",
    "Webhooks e SSE",
    "Enviar Mensagem",
    "Mensagem Async",
    "Acoes na mensagem e Buscar",
    "Chats",
    "Contatos",
    "Bloqueios",
    "Etiquetas",
    "Grupos e Comunidades",
    "Newsletters e Canais",
    "Respostas Rapidas",
    "CRM",
    "Mensagem em massa",
    "Integracao Chatwoot",
    "Avancado",
  ];
  const index = order.indexOf(tag);
  return index === -1 ? 999 : index;
}
