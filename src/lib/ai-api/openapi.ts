const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const errorResponse = (description: string) => ({ description, content: json(ref("AiError")) });
const stringError = (description: string) => ({ description, content: json(ref("SimpleError")) });
export const aiChatExample = { messages: [{ role: "user", content: "Explique o que é uma API em uma frase." }] };
export const aiResponseExample = {
  id: "chatcmpl-00000000-0000-4000-8000-000000000001", object: "chat.completion", created: 1788883732, model: "connectyhub-auto",
  choices: [{ index: 0, message: { role: "assistant", content: "Uma API permite que sistemas troquem informações por regras definidas." }, finish_reason: "stop" }],
  connectyhub: { request_id: "00000000-0000-4000-8000-000000000001", credits: 1, project_id: "00000000-0000-4000-8000-000000000002" },
};
export const aiOpenApiSpec = {
  openapi: "3.1.0",
  info: { title: "ConnectyHub API de IA", version: "1.1.0", description: "Crie um projeto, copie a chave e conecte seu sistema. A API gera respostas e analisa imagens, com consumo em créditos ConnectyHub. Documentação e JSON públicos; uso requer projeto ativo, acesso e saldo disponível. Exemplos de créditos são ilustrativos. A resposta utiliza um subconjunto de Chat Completions e informa o consumo exclusivamente em connectyhub.credits." },
  servers: [{ url: "https://www.connectyhub.com.br/api/v1/ai", description: "Produção" }],
  externalDocs: { url: "https://www.connectyhub.com.br/docs/api#ia", description: "Documentação pública" },
  security: [{ AiBearerAuth: [] }], tags: [{ name: "IA", description: "Conectar e acompanhar solicitações" }],
  paths: {
    "/models": { get: { operationId: "listAiModels", tags: ["IA"], summary: "Identificação da API", description: "Retorna o identificador ConnectyHub para ferramentas que exigem o campo model. Use connectyhub-auto; nas chamadas diretas esse campo pode ser omitido.", responses: { "200": { description: "Identificação disponível", content: json(ref("ModelList")) }, "401": stringError("Chave inválida ou revogada"), "402": stringError("Acesso da conta indisponível"), "403": stringError("Projeto pausado ou acesso bloqueado"), "503": stringError("Serviço temporariamente indisponível") } } },
    "/chat/completions": { post: {
      operationId: "createAiChatCompletion", tags: ["IA"], summary: "Enviar uma solicitação", description: "Envie a mensagem e receba a resposta com os créditos utilizados. A conta precisa de saldo disponível. Preserve a Idempotency-Key e o corpo nos reenvios para evitar duplicação. A ConnectyHub administra o processamento automaticamente.",
      parameters: [{ name: "Idempotency-Key", in: "header", required: false, description: "Recomendado: identificador único da operação no projeto. Reenvie a mesma chave e o mesmo corpo para recuperar o resultado. Sem ele, cada envio representa uma nova operação.", schema: { type: "string", minLength: 1, maxLength: 128, pattern: "^[\\x21-\\x7e]{1,128}$" }, example: "pedido-123-resposta-1" }],
      requestBody: { required: true, content: { "application/json": { schema: ref("ChatRequest"), example: aiChatExample } } },
      responses: {
        "200": { description: "Resposta concluída ou recuperada. stream=true entrega SSE após a conclusão, com créditos no evento final e data: [DONE].", headers: { "X-Request-Id": { description: "UUID para consultar a solicitação", schema: { type: "string", format: "uuid" } }, "Idempotency-Replayed": { description: "Indica resultado recuperado sem nova execução", schema: { type: "string", enum: ["true","false"] } } }, content: { "application/json": { schema: ref("ChatCompletion"), example: aiResponseExample }, "text/event-stream": { schema: { type: "string" }, description: "Eventos chat.completion.chunk; connectyhub.credits no evento final, seguido de data: [DONE]." } } },
        "400": errorResponse("JSON inválido"), "401": errorResponse("Confira a chave do projeto"), "402": errorResponse("Confira o saldo disponível e o acesso da conta"), "403": errorResponse("Projeto pausado ou acesso bloqueado"), "409": errorResponse("Solicitação em andamento, em conferência, já falhou ou conflito de identidade"), "413": errorResponse("Envie um conteúdo menor"), "422": errorResponse("Confira o conteúdo e os campos enviados"), "499": errorResponse("Solicitação cancelada antes da execução"), "502": errorResponse("Não foi possível concluir; consulte a solicitação antes de repetir"), "503": errorResponse("Serviço temporariamente indisponível; confira o estado antes de repetir"),
      },
    } },
    "/requests/{request_id}": { get: { operationId: "getAiRequest", tags: ["IA"], summary: "Consultar solicitação", description: "Consulte o UUID recebido em connectyhub.request_id ou X-Request-Id. A chave deve pertencer ao mesmo projeto. Em uncertain, aguarde conferência sem iniciar outra operação equivalente.", parameters: [{ name: "request_id", in: "path", required: true, schema: { type: "string", format: "uuid" }, example: aiResponseExample.connectyhub.request_id }], responses: { "200": { description: "Estado, resposta e créditos", content: json(ref("AiRequest")) }, "401": stringError("Confira a chave"), "402": stringError("Acesso da conta indisponível"), "403": stringError("Acesso bloqueado"), "404": stringError("Solicitação não encontrada neste projeto"), "503": stringError("Serviço temporariamente indisponível") } } },
  },
  components: {
    securitySchemes: { AiBearerAuth: { type: "http", scheme: "bearer", description: "Chave criada junto com o projeto em /dashboard/api-ia. Guarde no servidor; não é a mesma chave da API WhatsApp." } },
    schemas: {
      ChatRequest: { type: "object", required: ["messages"], additionalProperties: false, properties: {
        messages: { type: "array", minItems: 1, description: "Conversa com ao menos uma mensagem user", items: ref("Message") },
        model: { type: "string", enum: ["connectyhub-auto"], default: "connectyhub-auto", description: "Opcional; identificador da API ConnectyHub para ferramentas de integração" },
        stream: { type: "boolean", default: false, description: "Opcional: entrega SSE após concluir. Não é entrega incremental." },
      } },
      Message: { oneOf: [
        { type: "object", required: ["role","content"], properties: { role: { type: "string", enum: ["system","assistant"] }, content: { type: "string", minLength: 1, pattern: "\\S" } } },
        { type: "object", required: ["role","content"], properties: { role: { type: "string", const: "user" }, content: { oneOf: [{ type: "string", minLength: 1, pattern: "\\S" },{ type: "array", minItems: 1, items: { oneOf: [ref("TextPart"),ref("ImagePart")] } }] } } },
      ] },
      TextPart: { type: "object", required: ["type","text"], properties: { type: { type: "string", const: "text" }, text: { type: "string" } } },
      ImagePart: { type: "object", required: ["type","image_url"], properties: { type: { type: "string", const: "image_url" }, image_url: { type: "object", required: ["url"], properties: { url: { type: "string", pattern: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$", description: "Imagem PNG/JPEG/WebP em data URL base64. Endereços remotos não são aceitos." } } } } },
      ModelList: { type: "object", required: ["object","data"], properties: { object: { type: "string", const: "list" }, data: { type: "array", items: { type: "object", required: ["id","object","owned_by"], properties: { id: { type: "string", const: "connectyhub-auto" }, object: { type: "string", const: "model" }, owned_by: { type: "string", const: "connectyhub" } } } } } },
      CreditUsage: { type: "object", required: ["request_id","credits","project_id"], properties: { request_id: { type: "string", format: "uuid" }, credits: { type: "number", minimum: 0, description: "Créditos ConnectyHub utilizados" }, project_id: { type: "string", format: "uuid" } } },
      ChatCompletion: { type: "object", required: ["id","object","created","model","choices","connectyhub"], properties: { id: { type: "string" }, object: { type: "string", const: "chat.completion" }, created: { type: "integer", description: "Data Unix em segundos" }, model: { type: "string", const: "connectyhub-auto" }, choices: { type: "array", items: { type: "object", required: ["index","message","finish_reason"], properties: { index: { type: "integer", const: 0 }, message: { type: "object", required: ["role","content"], properties: { role: { type: "string", const: "assistant" }, content: { type: "string" } } }, finish_reason: { type: "string", enum: ["stop","length","content_filter"], description: "stop: concluída; length: resposta parcial; content_filter: sem texto disponível" } } } }, connectyhub: ref("CreditUsage") } },
      AiRequest: { type: "object", required: ["id","status","charged_credits","reserved_credits","response","error_code","created_at"], properties: { id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["preparing","reserved","processing","completed","failed","uncertain"] }, charged_credits: { type: "number" }, reserved_credits: { type: "number", description: "Créditos em processamento" }, response: { oneOf: [ref("ChatCompletion"),{ type: "null" }] }, error_code: { type: ["string","null"] }, created_at: { type: "string", format: "date-time" } } },
      AiError: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code","message"], properties: { code: { type: "string" }, message: { type: "string" }, request_id: { type: "string", format: "uuid", description: "Quando a solicitação já foi registrada" } } } } },
      SimpleError: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
    },
  },
};