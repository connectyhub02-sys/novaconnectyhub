type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export class AiInputError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const invalid = (code: string, message: string): never => { throw new AiInputError(code, message); };
const namePattern = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;
export function parseAdvancedAiOptions(body: Json) {
  const config: Json = {};
  const tools: Json[] = [];
  const capabilities: string[] = [];
  if (body.response_format !== undefined) {
    const format = record(body.response_format);
    if (format.type === "json_object") config.responseMimeType = "application/json";
    else if (format.type === "json_schema") {
      const schema = record(record(format.json_schema).schema);
      if (!Object.keys(schema).length) invalid("invalid_response_format", "Informe json_schema.schema como um objeto JSON Schema.");
      config.responseMimeType = "application/json";
      config.responseJsonSchema = schema;
    } else if (format.type !== "text") invalid("invalid_response_format", "Use text, json_object ou json_schema.");
    capabilities.push("structured_output");
  }
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length < 1 || body.tools.length > 64) invalid("invalid_tools", "Envie de 1 a 64 ferramentas.");
    const declarations: Json[] = [];
    const names = new Set<string>();
    for (const raw of body.tools as unknown[]) {
      const tool = record(raw);
      if (tool.type === "function") {
        const fn = record(tool.function);
        if (typeof fn.name !== "string" || !namePattern.test(fn.name) || names.has(fn.name)) invalid("invalid_tools", "Cada função precisa de um nome válido e único.");
        names.add(fn.name as string);
        const parameters = fn.parameters === undefined ? { type: "object", properties: {} } : record(fn.parameters);
        if (!Object.keys(parameters).length) invalid("invalid_tools", "Informe o schema de parâmetros da função.");
        declarations.push({ name: fn.name, ...(typeof fn.description === "string" ? { description: fn.description } : {}), parametersJsonSchema: parameters });
        capabilities.push("functions");
      } else {
        const builtins: Record<string, string> = { code_execution: "codeExecution", web_search: "googleSearch", url_context: "urlContext", maps: "googleMaps" };
        const providerType = builtins[String(tool.type)];
        if (!providerType || Object.keys(tool).some(key => key !== "type")) invalid("invalid_tools", "Ferramenta não suportada ou configuração inválida.");
        tools.push({ [providerType]: {} }); capabilities.push(String(tool.type));
      }
    }
    if (declarations.length) tools.push({ functionDeclarations: declarations });
  }
  let toolConfig: Json | undefined;
  if (body.tool_choice !== undefined) {
    if (!capabilities.includes("functions")) invalid("invalid_tool_choice", "Declare funções antes de escolher uma delas.");
    const choice = body.tool_choice;
    const modes: Record<string, string> = { auto: "AUTO", none: "NONE", required: "ANY" };
    if (typeof choice === "string" && modes[choice]) toolConfig = { functionCallingConfig: { mode: modes[choice] } };
    else {
      const fn = record(record(choice).function).name;
      const declarations = tools.flatMap(tool => Array.isArray(tool.functionDeclarations) ? tool.functionDeclarations as Json[] : []);
      if (record(choice).type !== "function" || !declarations.some(item => item.name === fn)) invalid("invalid_tool_choice", "Selecione uma função declarada nesta solicitação.");
      toolConfig = { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [fn] } };
    }
  }
  return { config, tools, toolConfig, capabilities: [...new Set(capabilities)] };
}

export function parseAiMessages(messages: unknown[]) {
  const systems: string[] = [];
  const contents: Array<{ role: string; parts: Json[] }> = [];
  const calls = new Map<string, string>();
  const capabilities: string[] = [];
  for (const raw of messages) {
    const message = record(raw);
    if (!["system", "user", "assistant", "tool"].includes(String(message.role))) invalid("invalid_role", "Use system, user, assistant ou tool.");
    const parts: Json[] = [];
    if (message.role === "tool") {
      const id = String(message.tool_call_id ?? "");
      const name = calls.get(id);
      if (!name || typeof message.content !== "string") invalid("invalid_tool_result", "Informe tool_call_id de uma chamada anterior e o resultado em content.");
      let response: unknown; try { response = JSON.parse(message.content as string); } catch { response = { result: message.content }; }
      parts.push({ functionResponse: { id, name, response: response && typeof response === "object" && !Array.isArray(response) ? response : { result: response } } });
      calls.delete(id); capabilities.push("functions");
    } else if (typeof message.content === "string" && message.content.trim()) parts.push({ text: message.content });
    else if (Array.isArray(message.content) && message.role === "user") {
      for (const item of message.content) {
        const part = record(item);
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) parts.push({ text: part.text });
        else if (part.type === "image_url" || part.type === "file" || part.type === "input_audio") {
          const audio = record(part.input_audio);
          const url = part.type === "image_url" ? record(part.image_url).url : part.type === "file" ? record(part.file).file_data
            : typeof audio.data === "string" && ["wav", "mp3"].includes(String(audio.format)) ? `data:audio/${audio.format === "mp3" ? "mpeg" : "wav"};base64,${audio.data}` : null;
          const match = typeof url === "string" ? url.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/) : null;
          const mime = match?.[1];
          const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf", "audio/wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/flac", "video/mp4", "video/webm", "video/quicktime"];
          if (!match || !mime || !allowed.includes(mime) || (part.type === "image_url" && !mime.startsWith("image/"))) invalid("invalid_image", "Envie uma data URL de imagem, PDF, áudio ou vídeo em formato aceito. URLs remotas não são aceitas.");
          parts.push({ inlineData: { mimeType: mime, data: match![2] } });
          capabilities.push(mime!.startsWith("image/") ? "image_input" : mime!.startsWith("audio/") ? "audio_input" : mime!.startsWith("video/") ? "video_input" : "pdf_input");
        } else invalid("unsupported_content", "Parte de conteúdo não suportada.");
      }
    }
    if (message.role === "assistant" && message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls) || !message.tool_calls.length) invalid("invalid_tool_calls", "Informe as chamadas retornadas pela API.");
      for (const rawCall of message.tool_calls as unknown[]) {
        const call = record(rawCall), fn = record(call.function);
        if (call.type !== "function" || typeof call.id !== "string" || !call.id || calls.has(call.id) || typeof fn.name !== "string" || !namePattern.test(fn.name) || typeof fn.arguments !== "string") invalid("invalid_tool_calls", "Chamada de função inválida.");
        let args: Json; try { args = JSON.parse(fn.arguments as string); } catch { invalid("invalid_tool_calls", "function.arguments precisa conter JSON válido."); }
        if (!args! || typeof args !== "object" || Array.isArray(args)) invalid("invalid_tool_calls", "Os argumentos precisam ser um objeto.");
        if (call.context !== undefined && (typeof call.context !== "string" || call.context.length > 65536)) invalid("invalid_tool_calls", "Contexto da chamada inválido.");
        calls.set(call.id as string, fn.name as string);
        parts.push({ functionCall: { id: call.id, name: fn.name, args: args! }, ...(call.context ? { thoughtSignature: call.context } : {}) });
        capabilities.push("functions");
      }
    }
    if (!parts.length) invalid("empty_message", "A mensagem não pode estar vazia.");
    if (message.role === "system") systems.push(String(parts[0].text));
    else contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
  }
  if (!messages.some(message => record(message).role === "user")) invalid("missing_user_message", "Inclua uma mensagem do usuário.");
  return { systems, contents, capabilities: [...new Set(capabilities)] };
}
