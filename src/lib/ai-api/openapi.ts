import { advancedAiPaths, advancedAiSchemas } from "./advanced-openapi";
import {resourceAiPaths,resourceAiSchemas} from './resource-openapi';
import {aiAutomationPaths,aiAutomationSchemas} from './automation-openapi';
import {detailedAiSchemas} from './detailed-schemas';
import { aiResponseExample, aiRequestExamples, aiRequestExample, aiPendingRequestExample, aiModelListExample, aiSseExample } from "./examples";
export { aiChatExample, aiResponseExample } from "./examples";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const errorResponse = (description: string) => ({ description, content: json(ref("AiError")) });
const stringError = (description: string) => ({ description, content: json(ref("SimpleError")) });
export const aiOpenApiSpec = {
  openapi: "3.1.0",
  info: { title: "ConnectyHub API de IA", version: "1.5.0", description: "Crie um projeto, copie a chave e conecte seu sistema. Escolha o modelo por chave. A API gera respostas, analisa arquivos e produz vetores, com consumo em créditos ConnectyHub. Documentação e JSON públicos; uso requer projeto ativo, acesso e saldo disponível. Exemplos de créditos são ilustrativos. A resposta utiliza um subconjunto de Chat Completions e informa o consumo exclusivamente em connectyhub.credits." },
  servers: [{ url: "https://www.connectyhub.com.br/api/v1/ai", description: "Produção" }],
  externalDocs: { url: "https://www.connectyhub.com.br/docs/api#ia", description: "Documentação pública" },
  security: [{ AiBearerAuth: [] }], tags: [{ name: "Geração", description: "Texto, conversas, análise de imagens e entrega SSE" }, { name: "Solicitações", description: "Consultar situação, resposta e créditos de uma operação" }, { name: "Identificação", description: "Identificador público para integração" }],
  paths: {
    ...aiAutomationPaths,
    ...resourceAiPaths,
    ...advancedAiPaths,
    "/models": { get: { operationId: "listAiModels", tags: ["Identificação"], summary: "Modelos disponíveis", description: "Lista modelos liberados, perfis, recursos e compatibilidade com a chave. Omita model para usar o modelo vinculado à chave. connectyhub-auto mantém compatibilidade com integrações anteriores.", responses: { "200": { description: "Identificação disponível", content: { "application/json": { schema: ref("ModelList"), example: aiModelListExample } } }, "401": stringError("Chave inválida ou revogada"), "402": stringError("Acesso da conta indisponível"), "403": stringError("Projeto pausado ou acesso bloqueado"), "503": stringError("Serviço temporariamente indisponível") } } },
    "/chat/completions": { post: {
      operationId: "createAiChatCompletion", tags: ["Geração"], summary: "Enviar uma solicitação", description: "Envie texto, histórico ou imagens PNG/JPEG/WebP inline e receba uma resposta textual com os créditos utilizados. Corpo completo de até 2.000.000 bytes. Não há sessão automática: envie o contexto em cada chamada. A conta precisa de saldo disponível. Preserve a Idempotency-Key e o corpo nos reenvios para evitar duplicação. A ConnectyHub administra o processamento automaticamente.",
      parameters: [{ name: "Idempotency-Key", in: "header", required: false, description: "Recomendado: identificador único da operação no projeto. Reenvie a mesma chave e o mesmo corpo para recuperar o resultado. Sem ele, cada envio representa uma nova operação.", schema: { type: "string", minLength: 1, maxLength: 128, pattern: "^[\\x21-\\x7e]{1,128}$" }, example: "pedido-123-resposta-1" }],
      requestBody: { required: true, content: { "application/json": { schema: ref("ChatRequest"), examples: aiRequestExamples } } },
      responses: {
        "200": { description: "Resposta concluída ou recuperada. stream=true entrega SSE após a conclusão, com créditos no evento final e data: [DONE].", headers: { "X-Request-Id": { description: "UUID para consultar a solicitação", schema: { type: "string", format: "uuid" } }, "Idempotency-Replayed": { description: "Indica resultado recuperado sem nova execução", schema: { type: "string", enum: ["true","false"] } } }, content: { "application/json": { schema: ref("ChatCompletion"), example: aiResponseExample }, "text/event-stream": { schema: { type: "string" }, example: aiSseExample, "x-event-schema": ref("ChatChunk"), description: "Dois eventos chat.completion.chunk: texto completo e encerramento com connectyhub.credits. Seguidos de data: [DONE]. Entrega após concluir; não é geração incremental." } } },
        "400": errorResponse("JSON inválido"), "401": errorResponse("Confira a chave do projeto"), "402": errorResponse("Confira o saldo disponível e o acesso da conta"), "403": errorResponse("Projeto pausado ou acesso bloqueado"), "409": errorResponse("Solicitação em andamento, em conferência, já falhou ou conflito de identidade"), "413": errorResponse("Envie um conteúdo menor"), "422": errorResponse("Confira o conteúdo e os campos enviados"), "499": errorResponse("Solicitação cancelada antes da execução"), "502": errorResponse("Não foi possível concluir; consulte a solicitação antes de repetir"), "503": errorResponse("Serviço temporariamente indisponível; confira o estado antes de repetir"),
      },
    } },
    "/requests/{request_id}": { get: { operationId: "getAiRequest", tags: ["Solicitações"], summary: "Consultar solicitação", description: "Consulte o UUID recebido em connectyhub.request_id ou X-Request-Id. A chave deve pertencer ao mesmo projeto. Em uncertain, aguarde conferência sem iniciar outra operação equivalente.", parameters: [{ name: "request_id", in: "path", required: true, schema: { type: "string", format: "uuid" }, example: aiResponseExample.connectyhub.request_id }], responses: { "200": { description: "Estado, resposta e créditos", content: { "application/json": { schema: ref("AiRequest"), examples: { concluida: { value: aiRequestExample }, emConferencia: { value: aiPendingRequestExample } } } } }, "401": stringError("Confira a chave"), "402": stringError("Acesso da conta indisponível"), "403": stringError("Acesso bloqueado"), "404": stringError("Solicitação não encontrada neste projeto"), "503": stringError("Serviço temporariamente indisponível") } } },
  },
  components: {
    securitySchemes: { AiBearerAuth: { type: "http", scheme: "bearer", description: "Chave criada junto com o projeto em /dashboard/api-ia. Guarde no servidor; não é a mesma chave da API WhatsApp." } },
    schemas: {
      ...resourceAiSchemas,
      ...advancedAiSchemas,
      ...detailedAiSchemas,
      ...aiAutomationSchemas,
      AiResource:{...resourceAiSchemas.AiResource,properties:{...resourceAiSchemas.AiResource.properties,result:{description:'Resultado após a conferência de consumo, conforme kind.',oneOf:[ref('InteractionResult'),ref('VideoResult'),ref('BatchResult'),{type:'object',properties:{id:{type:'string'},object:{enum:['cache','document']},status:{type:'string'},store:{type:'string'},connectyhub:ref('CreditUsage')}}]}}},
      ContentRequest:{...advancedAiSchemas.ContentRequest,properties:{...advancedAiSchemas.ContentRequest.properties,generationConfig:{...advancedAiSchemas.ContentRequest.properties.generationConfig,properties:{...advancedAiSchemas.ContentRequest.properties.generationConfig.properties,speechConfig:ref('SpeechConfig'),imageConfig:ref('ImageConfig'),thinkingConfig:ref('ThinkingConfig')}}}},
      ChatRequest: { type: "object", description: "Corpo JSON de até 2.000.000 bytes, incluindo imagens em base64. Referência dos campos públicos recomendados. Não envie parâmetros de outros contratos.", required: ["messages"], additionalProperties: false, allOf: [{ if: { required: ["stream_options"] }, then: { required: ["stream"], properties: { stream: { const: true } } } }], properties: {
        messages: { type: "array", minItems: 1, maxItems: 100, description: "Conversa com ao menos uma mensagem user. Envie o histórico relevante em cada chamada; a API não mantém uma sessão de conversa automaticamente.", items: ref("Message") },
        model: { type: "string", default: "connectyhub-auto", description: "Opcional; use o ID do modelo da chave ou omita. Um ID diferente é recusado." },
        tools: { type:"array", minItems:1, maxItems:64, items:ref("AiTool") },
        tool_choice: { oneOf:[{enum:["auto","none","required"]},{type:"object",required:["type","function"],properties:{type:{const:"function"},function:{type:"object",required:["name"],properties:{name:{type:"string"}}}}}] },
        response_format: ref("ResponseFormat"),
        temperature: { type: "number", minimum: 0, maximum: 2, default: 0.7, description: "Variação da resposta. Valores menores favorecem respostas mais consistentes; valores maiores permitem maior diversidade. Não garante determinismo." },
        stream: { type: "boolean", default: false, description: "Opcional: entrega SSE após concluir. Não é entrega incremental." },
        stream_options: { type: "object", additionalProperties: false, description: "Compatibilidade com clientes SSE. Use somente com stream=true. Os créditos são sempre informados no evento final, independentemente de include_usage.", properties: { include_usage: { type: "boolean" } } },
      } },
      Message: { oneOf: [
        {type:"object",required:["role"],properties:{role:{const:"assistant"},content:{type:["string","null"]},tool_calls:{type:"array",items:ref("FunctionCall")}}},
        {type:"object",required:["role","tool_call_id","content"],properties:{role:{const:"tool"},tool_call_id:{type:"string"},content:{type:"string"}}},
        { type: "object", required: ["role","content"], properties: { role: { type: "string", enum: ["system"] }, content: { type: "string", minLength: 1, pattern: "\\S" } } },
        { type: "object", required: ["role","content"], properties: { role: { type: "string", const: "user" }, content: { oneOf: [{ type: "string", minLength: 1, pattern: "\\S" },{ type: "array", minItems: 1, items: { oneOf: [ref("TextPart"),ref("ImagePart"),ref("FilePart"),ref("AudioPart")] } }] } } },
      ] },
      TextPart: { type: "object", required: ["type","text"], properties: { type: { type: "string", const: "text" }, text: { type: "string" } } },
      ImagePart: { type: "object", required: ["type","image_url"], properties: { type: { type: "string", const: "image_url" }, image_url: { type: "object", required: ["url"], properties: { url: { type: "string", pattern: "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$", description: "Imagem PNG/JPEG/WebP em data URL base64. Endereços remotos não são aceitos." } } } } },
      ModelList: { type:"object",required:["object","data","selected_model"],properties:{object:{const:"list"},selected_model:{type:"string"},data:{type:"array",items:ref("PublicModel")}}},
      CreditUsage: { type: "object", required: ["request_id","credits","project_id"], properties: { request_id: { type: "string", format: "uuid" }, credits: { type: "number", minimum: 0, description: "Créditos ConnectyHub utilizados" }, project_id: { type: "string", format: "uuid" } } },
      ChatCompletion: { type: "object", required: ["id","object","created","model","choices","connectyhub"], properties: { id: { type: "string" }, object: { type: "string", const: "chat.completion" }, created: { type: "integer", description: "Data Unix em segundos" }, model: { type: "string" }, choices: { type: "array", items: { type: "object", required: ["index","message","finish_reason"], properties: { index: { type: "integer", const: 0 }, message: { type: "object", required: ["role","content"], properties: { role: { type: "string", const: "assistant" }, content: { type: "string" }, tool_calls: {type:"array",items:ref("FunctionCall")} } }, finish_reason: { type: "string", enum: ["stop","length","content_filter","tool_calls"], description: "stop: concluída; length: resposta parcial; content_filter: sem texto disponível" } } } }, connectyhub: ref("CreditUsage") } },
      ChatChunk: { type: "object", required: ["id", "object", "created", "model", "choices"], properties: {
        id: { type: "string" }, object: { type: "string", const: "chat.completion.chunk" }, created: { type: "integer" }, model: { type: "string" },
        choices: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", required: ["index", "delta", "finish_reason"], properties: {
          index: { type: "integer", const: 0 }, delta: { type: "object", properties: { role: { type: "string", const: "assistant" }, content: { type: "string" },tool_calls:{type:"array",items:ref("FunctionCall")} } },
          finish_reason: { type: ["string", "null"], enum: [null, "stop", "length", "content_filter", "tool_calls"] },
        } } }, connectyhub: { ...ref("CreditUsage"), description: "Presente no evento final." },
      } },
      AiRequest: { type: "object", required: ["id","status","charged_credits","reserved_credits","response","error_code","created_at"], properties: { id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["preparing","reserved","processing","completed","failed","uncertain"] }, charged_credits: { type: "number" }, reserved_credits: { type: "number", description: "Créditos em processamento" }, response: { oneOf: [ref("ChatCompletion"),ref("ContentResponse"),ref("EmbeddingResponse"),{ type: "null" }] }, error_code: { type: ["string","null"] }, created_at: { type: "string", format: "date-time" } } },
      AiError: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code","message"], properties: { code: { type: "string", description: "Código estável de diagnóstico. Exemplos: invalid_api_key, invalid_messages, invalid_image, unsupported_parameter, invalid_temperature, invalid_stream_options, invalid_idempotency_key, request_in_progress, previous_request_failed, ai_idempotency_conflict, ai_insufficient_credits, settlement_pending, service_unavailable." }, message: { type: "string" }, request_id: { type: "string", format: "uuid", description: "Quando a solicitação já foi registrada" } } } } },
      SimpleError: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
    },
  },
};
