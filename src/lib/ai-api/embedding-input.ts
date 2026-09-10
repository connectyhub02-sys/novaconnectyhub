import { AiInputError } from "./advanced-input";
export function parseEmbeddingInput(raw: unknown) {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const fail = (message: string): never => { throw new AiInputError("invalid_embedding", message); };
  if (Object.keys(body).some(key => !["model", "input", "dimensions", "task_type", "title"].includes(key))) fail("Campo não suportado na criação de vetores.");
  if (typeof body.input !== "string" || !body.input.trim()) fail("Envie um texto não vazio em input.");
  if (body.dimensions !== undefined && (!Number.isInteger(body.dimensions) || Number(body.dimensions) < 1 || Number(body.dimensions) > 3072)) fail("dimensions deve ser um inteiro entre 1 e 3072.");
  const tasks = ["RETRIEVAL_QUERY", "RETRIEVAL_DOCUMENT", "SEMANTIC_SIMILARITY", "CLASSIFICATION", "CLUSTERING", "QUESTION_ANSWERING", "FACT_VERIFICATION", "CODE_RETRIEVAL_QUERY"];
  if (body.task_type !== undefined && !tasks.includes(String(body.task_type))) fail("Tipo de tarefa inválido.");
  if (body.title !== undefined && (typeof body.title !== "string" || body.task_type !== "RETRIEVAL_DOCUMENT")) fail("title exige a tarefa RETRIEVAL_DOCUMENT.");
  return { model: typeof body.model === "string" ? body.model : "connectyhub-auto", stream: false, maxTokens: 0, capabilities: ["embeddings"],
    providerBody: { contents: [{ role: "user", parts: [{ text: body.input as string }] }],
      embedContentConfig: { autoTruncate: false, ...(body.dimensions === undefined ? {} : { outputDimensionality: body.dimensions }), ...(body.task_type ? { taskType: body.task_type } : {}), ...(body.title ? { title: body.title } : {}) },
    },
  };
}
