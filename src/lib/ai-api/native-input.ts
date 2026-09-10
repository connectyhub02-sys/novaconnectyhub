import { AiInputError } from "./advanced-input";
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const fail = (message: string): never => { throw new AiInputError("invalid_content_request", message); };
export function parseNativeAiInput(raw: unknown, outputLimit: number) {
  const body = object(raw);
  const accepted = ["model", "contents", "systemInstruction", "generationConfig", "tools", "toolConfig", "safetySettings", "cachedContent"];
  if (Object.keys(body).some(key => !accepted.includes(key))) fail("Campo não suportado na geração de conteúdo.");
  if (!Array.isArray(body.contents) || !body.contents.length) fail("Informe contents com pelo menos uma mensagem.");
  const capabilities: string[] = [];
  if (body.systemInstruction !== undefined) {
    const instruction = object(body.systemInstruction);
    if (Object.keys(instruction).some(key => key !== "parts" && key !== "role") || !Array.isArray(instruction.parts) || !instruction.parts.length || instruction.parts.some(part => typeof object(part).text !== "string" || Object.keys(object(part)).some(key => key !== "text"))) fail("systemInstruction aceita somente partes de texto.");
  }
  const contents = (body.contents as unknown[]).map(rawContent => {
    const content = object(rawContent);
    if (!Array.isArray(content.parts) || !content.parts.length || (content.role !== undefined && !["user", "model"].includes(String(content.role)))) fail("Mensagem de conteúdo inválida.");
    const parts = (content.parts as unknown[]).map(rawPart => {
      const part = object(rawPart);
      if (Object.keys(part).some(key => !["text", "inlineData", "fileData", "functionCall", "functionResponse", "thoughtSignature", "videoMetadata"].includes(key))) fail("Parte de conteúdo inválida.");
      const keys = ["text", "inlineData", "fileData", "functionCall", "functionResponse"].filter(key => part[key] !== undefined);
      if (keys.length !== 1) fail("Informe um único tipo de conteúdo em cada parte.");
      if (part.text !== undefined && typeof part.text !== "string") fail("text precisa ser uma string.");
      if (part.inlineData) {
        const data = object(part.inlineData);
        if (typeof data.mimeType !== "string" || !/^(image\/(png|jpeg|webp)|audio\/(wav|mpeg|mp4|aac|ogg|flac)|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/.test(data.mimeType) || typeof data.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data)) fail("Mídia inline inválida.");
        capabilities.push(String(data.mimeType).startsWith("image/") ? "image_input" : String(data.mimeType).startsWith("audio/") ? "audio_input" : String(data.mimeType).startsWith("video/") ? "video_input" : "pdf_input");
      }
      if (part.fileData) {
        const data = object(part.fileData);
        if (typeof data.fileUri !== "string" || !/^files\/[a-f0-9-]{36}$/.test(data.fileUri)) fail("Use um arquivo enviado pela API deste projeto.");
      }
      if (part.functionCall || part.functionResponse) {
        const fn = object(part.functionCall ?? part.functionResponse);
        const payloadKey = part.functionCall ? "args" : "response";
        if (typeof fn.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/.test(fn.name) || Object.keys(fn).some(key => !["name", "id", payloadKey].includes(key)) || (fn[payloadKey] !== undefined && (typeof fn[payloadKey] !== "object" || !fn[payloadKey] || Array.isArray(fn[payloadKey])))) fail("Chamada ou resultado de função inválido.");
        capabilities.push("functions");
      }
      return part;
    });
    return { role: String(content.role ?? "user"), parts };
  });
  const generationConfig = object(body.generationConfig);
  if (body.generationConfig !== undefined && (typeof body.generationConfig !== "object" || !body.generationConfig || Array.isArray(body.generationConfig))) fail("generationConfig precisa ser um objeto.");
  const allowedConfig = ["temperature", "topP", "topK", "candidateCount", "maxOutputTokens", "stopSequences", "responseMimeType", "responseSchema", "responseJsonSchema", "responseModalities", "speechConfig", "imageConfig", "thinkingConfig", "mediaResolution", "seed", "presencePenalty", "frequencyPenalty", "responseLogprobs", "logprobs"];
  if (Object.keys(generationConfig).some(key => !allowedConfig.includes(key))) fail("Configuração de geração não suportada.");
  const maxTokens = Number(generationConfig.maxOutputTokens ?? Math.min(8192, outputLimit));
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > outputLimit) fail("Configuração de tamanho de resposta inválida para esta operação.");
  if (generationConfig.candidateCount !== undefined && generationConfig.candidateCount !== 1) fail("Esta operação retorna uma alternativa por solicitação.");
  if (generationConfig.responseSchema || generationConfig.responseJsonSchema || generationConfig.responseMimeType === "application/json") capabilities.push("structured_output");
  if (Array.isArray(generationConfig.responseModalities)) for (const modality of generationConfig.responseModalities) {
    if (!["TEXT", "IMAGE", "AUDIO"].includes(String(modality))) fail("Modalidade de saída inválida.");
    if (modality === "IMAGE") capabilities.push("image_output");
    if (modality === "AUDIO") capabilities.push("audio_output");
  }
  const tools: Json[] = [];
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) fail("tools precisa ser uma lista.");
    for (const rawTool of body.tools as unknown[]) {
      const tool = object(rawTool);
      const types: Record<string, [string, string]> = { functionDeclarations: ["functionDeclarations", "functions"], codeExecution: ["codeExecution", "code_execution"], webSearch: ["googleSearch", "web_search"], urlContext: ["urlContext", "url_context"], maps: ["googleMaps", "maps"], computerUse: ["computerUse", "computer_use"], fileSearch: ["fileSearch", "file_search"] };
      if (Object.keys(tool).length !== 1) fail("Declare um tipo por ferramenta.");
      const type = Object.keys(tool)[0]; if (!types[type]) fail("Ferramenta não suportada.");
      tools.push({ [types[type][0]]: tool[type] }); capabilities.push(types[type][1]);
    }
  }
  if (body.cachedContent !== undefined) {
    if (typeof body.cachedContent !== "string" || !/^caches\/[a-f0-9-]{36}$/.test(body.cachedContent)) fail("Use um cache criado neste projeto.");
    capabilities.push("cache");
  }
  return { model: typeof body.model === "string" ? body.model : "connectyhub-auto", stream: false, maxTokens,
    capabilities: [...new Set(capabilities)], providerBody: {
      contents, generationConfig: { ...generationConfig, maxOutputTokens: maxTokens, candidateCount: 1 },
      ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
      ...(tools.length ? { tools } : {}), ...(body.toolConfig ? { toolConfig: body.toolConfig } : {}),
      ...(body.safetySettings ? { safetySettings: body.safetySettings } : {}), ...(body.cachedContent ? { cachedContent: body.cachedContent } : {}),
    },
  };
}
