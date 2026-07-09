import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const sourcePath =
  process.env.SOURCE_OPENAPI_SPEC ||
  path.resolve("uazapi-openapi-spec.yaml");
const outputPath = path.resolve("src/lib/connectyhub-api/openapi.generated.json");
const yamlOutputPath = path.resolve("docs/connectyhub-openapi-spec.yaml");

const rawSpec = yaml.load(fs.readFileSync(sourcePath, "utf8"));

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const CONNECTYHUB_BASE_URL = "https://www.connectyhub.com.br/api/v1";
const PROVIDER_PREFIX = "/provider";
const EXAMPLE_INSTANCE_ID = "ch-api-atendimento-01";
const CONNECTYHUB_WEBHOOK_EVENTS = [
  "messages",
  "messages_update",
  "connection",
  "chats",
  "contacts",
  "history",
  "presence",
  "groups",
  "labels",
  "chat_labels",
  "newsletter_messages",
  "call",
  "blocks",
  "sender",
];

const INTENTIONALLY_BLOCKED_PROVIDER_PATHS = {
  "/instance/create": "Use POST /instances. Raw provider creation requires admintoken and bypasses ConnectyHub ownership, billing and webhook setup.",
  "/instance/all": "Use GET /instances or admin-only internal inventory. Raw provider listing exposes instances across tenants.",
  "/instance/updateAdminFields": "Provider admin metadata is platform-owned and must not be writable by customer API keys.",
  "/globalwebhook": "ConnectyHub exposes tenant-scoped /webhooks instead of provider-global webhooks.",
  "/globalwebhook/errors": "Use /webhooks/deliveries for tenant-scoped delivery diagnostics.",
  "/admin/restart": "Provider process control is platform-only.",
  "/admin/token/rotate": "Provider admin-token rotation is platform-only.",
};

const NATIVE_PROMOTION_ROADMAP = [
  {
    group: "message-actions",
    priority: "P1",
    sourcePaths: ["/message/history-sync", "/message/download", "/message/markread", "/message/react", "/message/delete", "/message/edit", "/message/pin"],
    reason: "High-value customer workflows currently require provider proxy payloads instead of stable ConnectyHub contracts.",
  },
  {
    group: "chat-operations",
    priority: "P1",
    sourcePaths: ["/chat/read", "/chat/archive", "/chat/mute", "/chat/pin", "/chat/block", "/chat/labels", "/chat/notes", "/chat/notes/edit"],
    reason: "Common inbox and CRM operations should be first-class ConnectyHub resources.",
  },
  {
    group: "groups",
    priority: "P2",
    sourcePaths: ["/group/create", "/group/list", "/group/info", "/group/updateParticipants", "/group/updateDescription", "/group/updateImage"],
    reason: "Group support unlocks communities and team operations while preserving tenant permissions.",
  },
  {
    group: "sender-campaigns",
    priority: "P2",
    sourcePaths: ["/sender/simple", "/sender/advanced", "/sender/listfolders", "/sender/listmessages", "/sender/cleardone"],
    reason: "Campaign execution needs ConnectyHub billing, rate limits, audit logs and safer UX.",
  },
  {
    group: "newsletters",
    priority: "P3",
    sourcePaths: ["/newsletter/list", "/newsletter/messages", "/newsletter/updates", "/newsletter/search", "/newsletter/follow", "/newsletter/mute"],
    reason: "Channels are valuable after core inbox and campaign operations are stable.",
  },
  {
    group: "business-catalog",
    priority: "P3",
    sourcePaths: ["/business/get/profile", "/business/update/profile", "/business/catalog/list", "/business/catalog/info", "/business/catalog/show", "/business/catalog/hide"],
    reason: "Catalog APIs should be aligned with ConnectyHub product/catalog data before broad exposure.",
  },
];

const PASSKEY_PAIRING_GUIDE = [
  "## Contas com chave de acesso/passkey",
  "",
  "Algumas contas do WhatsApp leem o QR inicial, mas exigem uma verificacao extra por chave de acesso antes de concluir a sessao. Quando isso acontecer, a API retorna sinais de diagnostico para o painel do cliente tratar o caso sem acionar suporte:",
  "",
  "- `connectionDiagnostics.latestAttempt.finalStatus = passkey_blocked`",
  "- `lastDisconnectReason = Passkey pairing not supported`",
  "",
  "Esse caso nao indica token invalido, webhook quebrado ou QR renderizado errado. O QR inicial foi lido, mas o WhatsApp exigiu uma etapa de seguranca que ainda nao retorna o segundo QR pela API.",
  "",
  "No painel do seu produto, detecte esse status, pare de insistir no QR atual e mostre uma mensagem amigavel: `Esta conta pediu uma verificacao extra por chave de acesso. Esse tipo de verificacao ainda nao pode ser concluido diretamente pelo QR Code do painel.`",
  "",
  "Voce pode oferecer reset e nova tentativa de QR. Se a conta voltar ao mesmo status, use um fluxo de migracao assistida de sessao apos concluir a validacao no WhatsApp Web oficial.",
].join("\n");

const tagNames = {
  "Admininstração": "Administracao",
  "Administração": "Administracao",
  Instancia: "Instancias",
  Proxy: "Avancado",
  Perfil: "Perfil",
  Business: "Business",
  Chamadas: "Chamadas",
  "Webhooks e SSE": "Webhooks e SSE",
  "Enviar Mensagem": "Enviar Mensagem",
  "Mensagem Async": "Mensagem Async",
  "Ações na mensagem e Buscar": "Acoes na mensagem e Buscar",
  Chats: "Chats",
  Contatos: "Contatos",
  Bloqueios: "Bloqueios",
  Etiquetas: "Etiquetas",
  "Grupos e Comunidades": "Grupos e Comunidades",
  "Newsletters e Canais": "Newsletters e Canais",
  "Respostas Rápidas": "Respostas Rapidas",
  CRM: "CRM",
  "Mensagem em massa": "Mensagem em massa",
  "Integração Chatwoot": "Integracao Chatwoot",
};

const tagDescriptions = {
  "Nativo ConnectyHub": "Rotas principais da ConnectyHub para clientes da API.",
  Instancias: "Ciclo de vida da instancia WhatsApp: conectar, status, limites, perfil e privacidade.",
  "Enviar Mensagem": "Envio de texto, midia, contatos, localizacao, status e mensagens interativas.",
  "Mensagem Async": "Envio e acompanhamento de mensagens assicronas.",
  "Acoes na mensagem e Buscar": "Busca, historico, leitura, reacao, edicao, fixacao e download de mensagens.",
  Chats: "Operacoes de conversa: detalhes, etiquetas, arquivamento, silenciar, leitura e notas.",
  Contatos: "Consulta, criacao e remocao de contatos.",
  Bloqueios: "Lista e controle de contatos bloqueados.",
  Etiquetas: "Gerenciamento de etiquetas e vinculos com chats.",
  "Grupos e Comunidades": "Criacao e administracao de grupos, comunidades e participantes.",
  "Newsletters e Canais": "Criacao, mensagens, seguidores, configuracoes e busca de canais.",
  Business: "Perfil comercial, categorias e catalogo de produtos.",
  Chamadas: "Chamadas de voz e rejeicao de chamadas.",
  "Webhooks e SSE": "Webhooks por instancia, erros recentes e stream de eventos.",
  "Respostas Rapidas": "Respostas rapidas salvas na conta.",
  CRM: "Campos de lead e dados auxiliares de relacionamento.",
  "Mensagem em massa": "Pastas, filas e disparos controlados.",
  "Integracao Chatwoot": "Configuracao de integracao com Chatwoot para atendimento.",
  Avancado: "Recursos avancados roteados pela ConnectyHub com controle de instancia.",
  Perfil: "Nome e imagem de perfil da conta conectada.",
};

const nativePaths = {
  "/instances": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Listar instancias",
      description:
        "Retorna as instancias WhatsApp vinculadas ao cliente API autenticado. Use o id retornado aqui em todas as chamadas de mensagens, consultas e recursos avancados.",
      operationId: "connectyhubListInstances",
      responses: {
        "200": { description: "Instancias do cliente API" },
        "401": { description: "Chave ausente, invalida ou expirada" },
      },
    },
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Criar instancia",
      description:
        "Cria uma nova instancia controlada pela ConnectyHub, vinculada ao cliente API autenticado e pronta para iniciar conexao por QR Code ou codigo de pareamento.",
      operationId: "connectyhubCreateInstance",
      requestBody: jsonBody({
        type: "object",
        properties: {
          name: { type: "string", description: "Nome interno da instancia", example: "Atendimento Loja Centro" },
          webhookUrl: { type: "string", format: "uri", description: "Webhook inicial do cliente", example: "https://cliente.com/webhooks/connectyhub" },
          metadata: { type: "object", description: "Metadados livres do cliente" },
        },
      }),
      responses: {
        "201": { description: "Instancia criada" },
        "401": { description: "Chave ausente, invalida ou expirada" },
        "403": { description: "Cliente pausado ou sem permissao" },
      },
    },
  },
  "/instances/{instanceId}": {
    delete: {
      tags: ["Nativo ConnectyHub"],
      summary: "Excluir instancia",
      description:
        "Exclui uma instancia do cliente API autenticado. A ConnectyHub tenta remover a instancia no provedor WhatsApp e arquiva o registro local para bloquear novas conexoes, mensagens e webhooks. Quando o provedor nao confirma a exclusao, a resposta retorna providerDeleted=false e status HTTP 202 para indicar limpeza pendente no provedor.",
      operationId: "connectyhubDeleteInstance",
      parameters: [instanceIdParam("ID publico da instancia ConnectyHub")],
      responses: {
        "200": { description: "Instancia excluida na ConnectyHub e no provedor" },
        "202": { description: "Instancia arquivada na ConnectyHub, mas exclusao no provedor ficou pendente" },
        "401": { description: "Chave ausente, invalida ou expirada" },
        "404": { description: "Instancia nao encontrada para este cliente" },
      },
    },
  },
  "/instances/{instanceId}/connect": {
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Conectar instancia",
      description:
        `Inicia ou atualiza o fluxo de conexao da instancia. Sem phone, solicita QR Code. Com phone em formato internacional, solicita codigo de pareamento. Quando o WhatsApp retornar lastDisconnectReason=Passkey pairing not supported, o provedor ainda nao disponibiliza o segundo QR de chave de acesso pela API; o fluxo por phone pode ser testado, mas nao e garantido. A alternativa operacional e concluir a validacao no WhatsApp Web oficial e migrar a sessao autenticada pelo Session Migration Connector.\n\n${PASSKEY_PAIRING_GUIDE}`,
      operationId: "connectyhubConnectInstance",
      parameters: [instanceIdParam("ID publico da instancia ConnectyHub")],
      requestBody: jsonBody({
        type: "object",
        properties: {
          phone: { type: "string", description: "Numero em formato internacional para gerar codigo de pareamento", example: "5511999999999" },
          browser: { type: "string", enum: ["auto", "safari", "firefox", "edge", "chrome"], description: "Perfil de navegador usado no pareamento. Use auto como padrao.", default: "auto", example: "auto" },
          systemName: { type: "string", description: "Nome exibido no WhatsApp em aparelhos conectados. Envie vazio para usar o padrao do provedor.", example: "ViralCheck" },
          proxyManagedCountry: { type: "string", description: "Pais do proxy regional gerenciado. Alias aceito: proxy_managed_country.", example: "br" },
          proxyManagedState: { type: "string", description: "Estado/subdivisao do proxy regional. Alias aceito: proxy_managed_state.", example: "sp" },
          proxyManagedCity: { type: "string", description: "Cidade do proxy regional. Alias aceito: proxy_managed_city.", example: "campinas" },
        },
      }),
      responses: {
        "200": {
          description: "Status de conexao atualizado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean", example: true },
                  instanceId: { type: "string", example: EXAMPLE_INSTANCE_ID },
                  status: { type: "string", enum: ["draft", "qr_pending", "connected", "disconnected", "blocked", "error"], example: "qr_pending" },
                  qrCode: { type: ["string", "null"], description: "Data URL do QR Code quando o fluxo por QR estiver ativo." },
                  pairCode: { type: ["string", "null"], description: "Codigo de pareamento quando phone for informado." },
                  lastDisconnectReason: {
                    type: ["string", "null"],
                    description:
                      "Ultimo motivo informado pelo provedor. Passkey pairing not supported indica que a conta exigiu WebAuthn/chave de acesso e que o segundo QR nao e retornado pela API.",
                    example: "Passkey pairing not supported",
                  },
                  connectionDiagnostics: { $ref: "#/components/schemas/ConnectionDiagnostics" },
                  provider: { type: "object", description: "Resposta sanitizada do provedor WhatsApp." },
                },
              },
            },
          },
        },
        "404": { description: "Instancia nao encontrada para este cliente" },
        "429": { description: "Limite de conexoes simultaneas atingido" },
        "503": { description: "Capacidade de conexao temporariamente indisponivel" },
      },
    },
  },
  "/instances/{instanceId}/reset": {
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Resetar runtime da instancia",
      description:
        "Solicita um reset controlado do runtime da instancia no provedor WhatsApp. Use antes de gerar uma nova tentativa de conexao quando a sessao ficou presa, mas sem apagar o registro da instancia.",
      operationId: "connectyhubResetInstance",
      parameters: [instanceIdParam("ID publico da instancia ConnectyHub")],
      responses: {
        "200": { description: "Reset aceito pelo provedor" },
        "404": { description: "Instancia nao encontrada para este cliente" },
        "409": { description: "Sessao atual nao e reconectavel por reset" },
      },
    },
  },
  "/instances/{instanceId}/status": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Atualizar status da instancia",
      description:
        `Consulta o status atual, sincroniza o registro da ConnectyHub e retorna informacoes de conexao, perfil, numero, foto, QR Code ou codigo de pareamento quando o provedor ainda mantiver o fluxo em andamento.\n\n${PASSKEY_PAIRING_GUIDE}`,
      operationId: "connectyhubRefreshInstanceStatus",
      parameters: [instanceIdParam("ID publico da instancia ConnectyHub")],
      responses: {
        "200": {
          description: "Status atualizado",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok: { type: "boolean", example: true },
                  instance: { $ref: "#/components/schemas/ConnectyHubInstance" },
                },
              },
            },
          },
        },
        "404": { description: "Instancia nao encontrada para este cliente" },
      },
    },
  },
  "/messages/text": {
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Enviar texto",
      description:
        "Envia mensagem de texto por uma instancia controlada pela chave API. Use Idempotency-Key para evitar duplicidade em tentativas repetidas.",
      operationId: "connectyhubSendText",
      parameters: [headerParam("Idempotency-Key", "Chave opcional para evitar envio duplicado")],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["instanceId", "number", "text"],
          properties: {
            instanceId: { type: "string", example: EXAMPLE_INSTANCE_ID },
            number: { type: "string", description: "Numero em formato internacional", example: "5511999999999" },
            text: { type: "string", description: "Texto da mensagem", example: "Ola! Sua conversa foi iniciada pela ConnectyHub API." },
            linkPreview: { type: "boolean", description: "Ativa preview de link quando aplicavel", example: true },
            trackId: { type: "string", description: "ID externo para conciliacao no seu sistema", example: "pedido-123" },
          },
        },
        true,
      ),
      responses: {
        "200": { description: "Mensagem enviada" },
        "409": { description: "Conflito de idempotencia" },
        "429": { description: "Limite mensal atingido" },
      },
    },
  },
  "/messages/media": {
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Enviar midia",
      description:
        "Envia imagem, video, audio, documento, PTT/PTV ou sticker por URL ou base64. O arquivo e processado pela instancia informada.",
      operationId: "connectyhubSendMedia",
      parameters: [headerParam("Idempotency-Key", "Chave opcional para evitar envio duplicado")],
      requestBody: jsonBody(
        {
          type: "object",
          required: ["instanceId", "number", "type", "file"],
          properties: {
            instanceId: { type: "string", example: EXAMPLE_INSTANCE_ID },
            number: { type: "string", example: "5511999999999" },
            type: { type: "string", enum: ["image", "video", "videoplay", "document", "audio", "myaudio", "ptt", "ptv", "sticker"], example: "image" },
            file: { type: "string", description: "URL publica ou conteudo base64", example: "https://exemplo.com/foto.jpg" },
            text: { type: "string", description: "Legenda opcional" },
            docName: { type: "string", description: "Nome do documento quando type=document" },
            trackId: { type: "string", description: "ID externo para conciliacao" },
          },
        },
        true,
      ),
      responses: {
        "200": { description: "Midia enviada" },
        "429": { description: "Limite mensal atingido" },
      },
    },
  },
  "/messages": {
    get: queryOperation("connectyhubFindMessages", "Buscar mensagens", "Consulta mensagens sincronizadas da instancia com paginacao e filtro por chat.", "Nativo ConnectyHub"),
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Buscar mensagens com filtros",
      description: "Consulta historico de mensagens com filtros avancados no corpo da requisicao.",
      operationId: "connectyhubFindMessagesWithFilters",
      requestBody: jsonBody({
        type: "object",
        required: ["instanceId"],
        properties: {
          instanceId: { type: "string", example: EXAMPLE_INSTANCE_ID },
          limit: { type: "integer", example: 50 },
          offset: { type: "integer", example: 0 },
          chatId: { type: "string", example: "5511999999999@s.whatsapp.net" },
        },
      }),
      responses: { "200": { description: "Mensagens encontradas" } },
    },
  },
  "/chats": {
    get: queryOperation("connectyhubFindChats", "Buscar chats", "Lista conversas com filtros, ordenacao e paginacao.", "Nativo ConnectyHub"),
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Buscar chats com filtros",
      description: "Lista conversas usando filtros avancados no corpo da requisicao.",
      operationId: "connectyhubFindChatsWithFilters",
      requestBody: jsonBody({
        type: "object",
        required: ["instanceId"],
        properties: {
          instanceId: { type: "string", example: EXAMPLE_INSTANCE_ID },
          limit: { type: "integer", example: 50 },
          offset: { type: "integer", example: 0 },
        },
      }),
      responses: { "200": { description: "Chats encontrados" } },
    },
  },
  "/chats/details": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Detalhes do chat",
      description: "Retorna dados completos do contato, grupo ou chat, incluindo imagem quando disponivel.",
      operationId: "connectyhubChatDetails",
      parameters: [
        queryParam("instanceId", "ID publico da instancia ConnectyHub", true),
        queryParam("number", "Numero ou identificador do chat", true),
        queryParam("preview", "Inclui dados resumidos para preview", false, "boolean"),
      ],
      responses: { "200": { description: "Detalhes do chat" } },
    },
  },
  "/contacts": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Listar contatos",
      description: "Lista contatos da conta conectada com paginacao e escopo de agenda.",
      operationId: "connectyhubListContacts",
      parameters: [
        queryParam("instanceId", "ID publico da instancia ConnectyHub", true),
        queryParam("limit", "Quantidade maxima de contatos", false, "integer"),
        queryParam("offset", "Deslocamento da paginacao", false, "integer"),
        {
          name: "contactScope",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["address_book", "outside_address_book", "all"] },
          description: "Escopo da agenda consultada",
        },
      ],
      responses: { "200": { description: "Contatos encontrados" } },
    },
  },
  "/webhooks": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Listar webhooks",
      description: "Lista endpoints de webhook cadastrados para o cliente API.",
      operationId: "connectyhubListWebhooks",
      responses: { "200": { description: "Webhooks do cliente" } },
    },
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Criar webhook",
      description: "Cria um endpoint de webhook assinado. O secret e retornado apenas uma vez.",
      operationId: "connectyhubCreateWebhook",
      requestBody: jsonBody({
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri", example: "https://cliente.com/webhooks/connectyhub" },
          description: { type: "string", example: "Webhook principal" },
          events: { type: "array", items: { type: "string", enum: CONNECTYHUB_WEBHOOK_EVENTS }, example: ["messages", "connection"] },
        },
      }),
      responses: { "201": { description: "Webhook criado" } },
    },
  },
  "/webhooks/{webhookId}": {
    get: webhookById("Detalhar webhook", "connectyhubGetWebhook"),
    patch: {
      ...webhookById("Atualizar webhook", "connectyhubUpdateWebhook"),
      requestBody: jsonBody({
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          description: { type: "string" },
          events: { type: "array", items: { type: "string", enum: CONNECTYHUB_WEBHOOK_EVENTS } },
          status: { type: "string", enum: ["active", "paused", "archived"] },
        },
      }),
    },
    delete: webhookById("Arquivar webhook", "connectyhubArchiveWebhook"),
  },
  "/webhooks/{webhookId}/test": {
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Testar webhook",
      description: "Dispara um evento de teste assinado para validar a URL do cliente.",
      operationId: "connectyhubTestWebhook",
      parameters: [pathParam("webhookId", "ID do webhook")],
      responses: { "200": { description: "Evento de teste entregue" } },
    },
  },
  "/webhooks/deliveries": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Listar entregas de webhook",
      description: "Audita tentativas de entrega, status HTTP, payload resumido e resposta do endpoint.",
      operationId: "connectyhubListWebhookDeliveries",
      responses: { "200": { description: "Entregas recentes" } },
    },
  },
  "/webhooks/deliveries/{deliveryId}/retry": {
    post: {
      tags: ["Nativo ConnectyHub"],
      summary: "Reenviar entrega de webhook",
      description: "Executa retry manual de uma entrega de webhook do cliente.",
      operationId: "connectyhubRetryWebhookDelivery",
      parameters: [pathParam("deliveryId", "ID da entrega")],
      responses: { "200": { description: "Retry executado" } },
    },
  },
  "/usage": {
    get: {
      tags: ["Nativo ConnectyHub"],
      summary: "Consultar uso e limite",
      description: "Retorna consumo do periodo, limite mensal, mensagens usadas e eventos recentes.",
      operationId: "connectyhubGetUsage",
      responses: { "200": { description: "Resumo de consumo do cliente API" } },
    },
  },
};

const sourceSchemas = sanitizeSchemas(rawSpec.components?.schemas || {});
const providerPaths = buildProviderPaths(rawSpec.paths || {});
const tags = buildTags(nativePaths, providerPaths);
const coverageSummary = buildCoverageSummary(rawSpec.paths || {}, nativePaths, providerPaths);

const publicSpec = {
  openapi: "3.1.0",
  info: {
    title: "ConnectyHub WhatsApp API",
    version: "1.0.0",
    description: buildInfoDescription(coverageSummary),
  },
  servers: [
    {
      url: CONNECTYHUB_BASE_URL,
      description: "Producao ConnectyHub",
    },
  ],
  tags,
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "ConnectyHub API key",
        description: "Use Authorization: Bearer ch_live_...",
      },
      apiKeyHeader: {
        type: "apiKey",
        in: "header",
        name: "x-connectyhub-api-key",
        description: "Header alternativo para enviar a chave ConnectyHub.",
      },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: false },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
          },
        },
        required: ["ok", "error"],
      },
      ConnectionDiagnosticEvent: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "connect_requested",
              "connect_response",
              "qr_received",
              "qr_updated",
              "pair_code_received",
              "pair_code_updated",
              "status_poll",
              "status_connected",
              "status_disconnected",
              "passkey_blocked",
              "timeout",
              "provider_error",
              "reset_requested",
            ],
          },
          at: { type: "string", format: "date-time" },
          providerStatus: { type: ["integer", "null"] },
          status: { type: ["string", "null"] },
          connected: { type: ["boolean", "null"] },
          loggedIn: { type: ["boolean", "null"] },
          hasQrCode: { type: "boolean", description: "Indica que o provedor retornou QR, sem expor o conteudo do QR." },
          qrCodeLength: { type: ["integer", "null"], description: "Tamanho do QR retornado, usado para identificar atualizacoes sem armazenar o QR." },
          hasPairCode: { type: "boolean", description: "Indica que o provedor retornou codigo de pareamento, sem expor o codigo." },
          pairCodeLength: { type: ["integer", "null"], description: "Tamanho do codigo retornado, sem armazenar o codigo." },
          lastDisconnectReason: {
            type: ["string", "null"],
            description:
              "Ultimo motivo informado pelo provedor. Passkey pairing not supported indica que a conta exigiu WebAuthn/chave de acesso e que o segundo QR nao e retornado pela API.",
            example: "Passkey pairing not supported",
          },
          message: { type: ["string", "null"] },
        },
      },
      ConnectionAttemptDiagnostic: {
        type: "object",
        properties: {
          id: { type: "string" },
          mode: { type: "string", enum: ["qr", "phone"] },
          phonePreview: { type: ["string", "null"], description: "Telefone mascarado quando a tentativa usa codigo de pareamento." },
          startedAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          finishedAt: { type: ["string", "null"], format: "date-time" },
          finalStatus: {
            type: "string",
            enum: ["pending", "success", "passkey_blocked", "qr_timeout", "disconnected", "provider_error", "reset", "unknown"],
          },
          finalReason: { type: ["string", "null"] },
          lastDisconnectReason: {
            type: ["string", "null"],
            description:
              "Ultimo motivo informado pelo provedor. Em passkey_blocked, indica a barreira de chave de acesso exigida pelo WhatsApp.",
          },
          qrReceivedCount: { type: "integer" },
          pairCodeReceivedCount: { type: "integer" },
          statusPollCount: { type: "integer" },
          scanDetected: { type: ["boolean", "null"], description: "Sinal inferido quando o provedor confirma conexao ou retorna bloqueio por passkey." },
          events: {
            type: "array",
            items: { $ref: "#/components/schemas/ConnectionDiagnosticEvent" },
          },
        },
      },
      ConnectionDiagnostics: {
        type: "object",
        description:
          "Historico resumido e sanitizado das ultimas tentativas de conexao por QR ou codigo de pareamento. Use latestAttempt.finalStatus=passkey_blocked para detectar contas que exigiram chave de acesso/passkey apos a leitura do QR inicial.",
        properties: {
          activeAttemptId: { type: ["string", "null"] },
          latestAttempt: {
            $ref: "#/components/schemas/ConnectionAttemptDiagnostic",
            type: ["object", "null"],
          },
          attempts: {
            type: "array",
            items: { $ref: "#/components/schemas/ConnectionAttemptDiagnostic" },
          },
        },
      },
      ConnectyHubInstance: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          provider: { type: "string", example: "connectyhub" },
          phoneNumber: { type: ["string", "null"] },
          displayName: { type: ["string", "null"] },
          profileImageUrl: { type: ["string", "null"] },
          status: { type: "string", enum: ["draft", "qr_pending", "connected", "disconnected", "blocked", "error", "archived"] },
          webhookConfigured: { type: "boolean" },
          qrCode: { type: ["string", "null"], description: "Data URL do QR Code atualizado quando disponivel no status do provedor." },
          pairCode: { type: ["string", "null"], description: "Codigo de pareamento atualizado quando disponivel no status do provedor." },
          lastDisconnectReason: { type: ["string", "null"], description: "Ultimo motivo de desconexao reportado pelo provedor, quando disponivel." },
          connectionDiagnostics: { $ref: "#/components/schemas/ConnectionDiagnostics" },
        },
      },
      ...sourceSchemas,
    },
  },
  paths: {
    ...nativePaths,
    ...providerPaths,
  },
  "x-connectyhub-uazapi-coverage": coverageSummary,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(publicSpec, null, 2)}\n`);
fs.mkdirSync(path.dirname(yamlOutputPath), { recursive: true });
fs.writeFileSync(
  yamlOutputPath,
  yaml.dump(publicSpec, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  }),
);

const endpointCount = Object.values(publicSpec.paths).reduce((total, item) => {
  return total + HTTP_METHODS.filter((method) => item?.[method]).length;
}, 0);

console.log(`Generated ${outputPath}`);
console.log(`Generated ${yamlOutputPath}`);
console.log(`${endpointCount} public endpoints, ${Object.keys(publicSpec.components.schemas).length} schemas`);

function buildInfoDescription(coverage) {
  return [
    "API publica da ConnectyHub para instancias WhatsApp, envio de mensagens, consultas, webhooks assinados e recursos avancados controlados.",
    "",
    "## Cobertura Uazapi",
    "",
    `A ConnectyHub usa a documentacao Uazapi ${coverage.source.version} como uma das bases do gateway WhatsApp, mas entrega uma fronteira propria de produto: autenticacao por chave ConnectyHub, isolamento por cliente, auditoria de uso, webhooks por tenant e sanitizacao de dados sensiveis.`,
    "",
    `Cobertura atual: ${coverage.counts.sourcePaths} paths Uazapi analisados, ${coverage.counts.providerProxyPaths} paths expostos em /provider/*, ${coverage.counts.nativePaths} paths nativos ConnectyHub e ${coverage.counts.intentionallyBlockedPaths} paths bloqueados por seguranca/administracao.`,
    "",
    "Use as rotas nativas sempre que existirem. Use /provider/* para recursos avancados ainda nao promovidos para contrato ConnectyHub estavel. Rotas de admintoken, webhook global e controle de processo do provedor nao sao expostas a clientes.",
  ].join("\n");
}

function buildCoverageSummary(sourcePaths, nativePathMap, providerPathMap) {
  const providerSourcePaths = new Set(
    Object.keys(providerPathMap)
      .filter((item) => item.startsWith(PROVIDER_PREFIX))
      .map((item) => item.slice(PROVIDER_PREFIX.length)),
  );
  const missingBlocked = [];
  const missingUnexpected = [];
  const providerMethodGaps = [];

  for (const [sourcePath, pathItem] of Object.entries(sourcePaths)) {
    const sourceMethods = collectPathMethods(pathItem);
    const exposedPath = providerSourcePaths.has(sourcePath);

    if (!exposedPath) {
      const reason = INTENTIONALLY_BLOCKED_PROVIDER_PATHS[sourcePath];
      const item = {
        path: sourcePath,
        methods: sourceMethods,
        reason: reason || "Missing from ConnectyHub provider proxy.",
      };

      if (reason) {
        missingBlocked.push(item);
      } else {
        missingUnexpected.push(item);
      }
      continue;
    }

    const providerMethods = collectPathMethods(providerPathMap[`${PROVIDER_PREFIX}${sourcePath}`] || {});
    const missingMethods = sourceMethods.filter((method) => !providerMethods.includes(method));
    if (missingMethods.length) {
      providerMethodGaps.push({
        path: sourcePath,
        missingMethods,
        sourceMethods,
        connectyHubMethods: providerMethods,
      });
    }
  }

  return {
    source: {
      title: rawSpec.info?.title ?? "Uazapi OpenAPI",
      version: rawSpec.info?.version ?? "unknown",
    },
    counts: {
      sourcePaths: Object.keys(sourcePaths).length,
      nativePaths: Object.keys(nativePathMap).length,
      providerProxyPaths: Object.keys(providerPathMap).length,
      intentionallyBlockedPaths: missingBlocked.length,
      unexpectedMissingPaths: missingUnexpected.length,
      providerMethodGaps: providerMethodGaps.length,
    },
    nativePromotionRoadmap: NATIVE_PROMOTION_ROADMAP,
    intentionallyBlockedPaths: missingBlocked,
    unexpectedMissingPaths: missingUnexpected,
    providerMethodGaps,
  };
}

function collectPathMethods(pathItem) {
  return HTTP_METHODS.filter((method) => Boolean(pathItem?.[method])).map((method) => method.toUpperCase());
}

function buildProviderPaths(paths) {
  const result = {};

  for (const [sourcePathKey, pathItem] of Object.entries(paths)) {
    const publicPath = `${PROVIDER_PREFIX}${sourcePathKey}`;
    const publicItem = {};

    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation || !isPublicProviderOperation(sourcePathKey, operation)) continue;
      publicItem[method] = buildProviderOperation(sourcePathKey, method, operation);
    }

    if (Object.keys(publicItem).length > 0) {
      result[publicPath] = publicItem;
    }
  }

  return result;
}

function buildProviderOperation(sourcePathKey, method, operation) {
  const sanitized = scrubDeep(operation);
  const originalSchema = getJsonRequestSchema(sanitized.requestBody);
  const hasOriginalBody = Boolean(originalSchema);
  const queryParameters = [
    {
      name: "instanceId",
      in: "query",
      required: method === "get",
      schema: { type: "string" },
      description:
        method === "get"
          ? "ID publico da instancia ConnectyHub. Obrigatorio em chamadas GET."
          : "ID publico da instancia ConnectyHub. Em metodos com body, tambem pode ser enviado no corpo.",
      example: EXAMPLE_INSTANCE_ID,
    },
    ...sanitizeParameters(sanitized.parameters || []),
  ];

  const providerOperation = {
    ...sanitized,
    tags: (sanitized.tags || []).map(normalizeTag).filter((tag) => tag !== "Administracao"),
    summary: sanitized.summary || titleFromPath(sourcePathKey),
    description: buildProviderDescription(sanitized.description, method, hasOriginalBody),
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    parameters: queryParameters,
    responses: scrubDeep(sanitized.responses || { "200": { description: "Sucesso" } }),
  };

  if (!providerOperation.tags.length) {
    providerOperation.tags = ["Avancado"];
  }

  if (method !== "get") {
    providerOperation.requestBody = buildProviderRequestBody(originalSchema, sanitized.requestBody?.required);
  } else {
    delete providerOperation.requestBody;
  }

  delete providerOperation.operationId;
  providerOperation.operationId = `provider${pascalCase(method)}${pascalCase(sourcePathKey)}`;
  return rewriteRefs(scrubDeep(providerOperation));
}

function buildProviderDescription(description, method, hasOriginalBody) {
  const intro =
    "Rota avancada exposta pela ConnectyHub. A autenticacao e feita pela chave ConnectyHub; a plataforma localiza a instancia pelo instanceId e aplica as permissoes do cliente antes de encaminhar a operacao.";
  const bodyNote =
    method === "get"
      ? "Envie instanceId como query string."
      : hasOriginalBody
        ? "Envie instanceId no corpo ou query string e coloque os campos especificos da operacao dentro de payload."
        : "Envie instanceId no corpo ou query string. Esta operacao nao exige payload especifico.";

  return [intro, bodyNote, description].filter(Boolean).join("\n\n");
}

function buildProviderRequestBody(originalSchema, originalRequired) {
  const payloadSchema = originalSchema
    ? rewriteRefs(scrubDeep(originalSchema))
    : {
        type: "object",
        additionalProperties: true,
        description: "Payload especifico da operacao, quando aplicavel.",
      };

  return jsonBody(
    {
      type: "object",
      required: ["instanceId", ...(originalRequired && originalSchema ? ["payload"] : [])],
      properties: {
        instanceId: {
          type: "string",
          description: "ID publico da instancia ConnectyHub.",
          example: EXAMPLE_INSTANCE_ID,
        },
        payload: payloadSchema,
      },
    },
    Boolean(originalRequired),
  );
}

function isPublicProviderOperation(pathKey, operation) {
  const normalizedPath = pathKey.toLowerCase();
  const tags = (operation.tags || []).join(" ").toLowerCase();
  const security = JSON.stringify(operation.security || "").toLowerCase();
  const blockedPrefixes = [
    "/admin",
    "/globalwebhook",
    "/instance/all",
    "/instance/create",
    "/instance/updateadminfields",
  ];

  if (blockedPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) return false;
  if (tags.includes("admin")) return false;
  if (security.includes("admintoken")) return false;
  return true;
}

function sanitizeSchemas(schemas) {
  const result = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const cleanSchema = removeSensitiveProperties(rewriteRefs(scrubDeep(schema)));
    result[name] = cleanSchema;
  }
  return result;
}

function removeSensitiveProperties(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(removeSensitiveProperties);

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (["token", "admintoken", "admin_token", "adminfield01", "adminfield02"].includes(normalized)) {
      continue;
    }
    if (normalized === "required" && Array.isArray(entry)) {
      result[key] = entry.filter((item) => !["token", "admintoken", "admin_token", "adminField01", "adminField02"].includes(item));
      continue;
    }
    result[key] = removeSensitiveProperties(entry);
  }
  return result;
}

function sanitizeParameters(parameters) {
  return parameters
    .filter((parameter) => {
      const name = String(parameter.name || "").toLowerCase();
      return !["token", "admintoken", "authorization"].includes(name);
    })
    .map((parameter) => rewriteRefs(scrubDeep(parameter)));
}

function buildTags(...pathCollections) {
  const names = new Set(["Nativo ConnectyHub"]);
  for (const paths of pathCollections) {
    for (const pathItem of Object.values(paths)) {
      for (const method of HTTP_METHODS) {
        const operation = pathItem?.[method];
        for (const tag of operation?.tags || []) {
          names.add(normalizeTag(tag));
        }
      }
    }
  }

  return [...names]
    .filter((name) => name !== "Administracao")
    .map((name) => ({
      name,
      description: tagDescriptions[name] || `Operacoes de ${name}.`,
    }));
}

function normalizeTag(tag) {
  return toAscii(tagNames[tag] || tag || "Avancado");
}

function scrubDeep(value) {
  if (typeof value === "string") return scrubString(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrubDeep);

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = scrubDeep(entry);
  }
  return result;
}

function scrubString(input) {
  let text = input
    .replace(/https?:\/\/\{subdomain\}\.uazapi\.com/gi, CONNECTYHUB_BASE_URL)
    .replace(/https?:\/\/free\.uazapi\.com/gi, CONNECTYHUB_BASE_URL)
    .replace(/\{subdomain\}\.uazapi\.com/gi, "www.connectyhub.com.br")
    .replace(/\bfree\.uazapi\.com\b/gi, "www.connectyhub.com.br")
    .replace(/\/uazapi-logo\.png/gi, "/connectyhub-logo.png")
    .replace(/\buazapiGO\b/gi, "ConnectyHub")
    .replace(/\buazapi\b/gi, "ConnectyHub")
    .replace(/\badmintoken\b/gi, "credencial interna")
    .replace(/\badmin token\b/gi, "credencial interna")
    .replace(/\bAdminToken\b/g, "credencial interna")
    .replace(/token de autenticacao da instancia/gi, "instanceId da ConnectyHub")
    .replace(/token da instancia/gi, "instanceId da ConnectyHub")
    .replace(/Token invalido\/expirado/gi, "Chave invalida ou expirada")
    .replace(/Token invalido ou expirado/gi, "Chave invalida ou expirada")
    .replace(/Token de autenticacao invalido/gi, "Chave de autenticacao invalida");

  return toAscii(text);
}

function toAscii(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function rewriteRefs(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(rewriteRefs);

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref" && typeof entry === "string") {
      result[key] = mapRef(entry);
    } else {
      result[key] = rewriteRefs(entry);
    }
  }
  return result;
}

function mapRef(ref) {
  const lower = ref.toLowerCase();
  const map = {
    "instance.yaml#/instance": "#/components/schemas/Instance",
    "message.yaml#/message": "#/components/schemas/Message",
    "group.yaml#/group": "#/components/schemas/Group",
    "chat.yaml#/chat": "#/components/schemas/Chat",
    "webhook.yaml#/webhook": "#/components/schemas/Webhook",
    "message_queue_folder.yaml#/messagequeuefolder": "#/components/schemas/MessageQueueFolder",
    "label.yaml#/label": "#/components/schemas/Label",
    "quick_reply.yaml#/quickreply": "#/components/schemas/QuickReply",
  };

  for (const [needle, replacement] of Object.entries(map)) {
    if (lower.includes(needle)) return replacement;
  }

  const fallbackName = ref.split("#/").pop()?.split("/").pop();
  return fallbackName ? `#/components/schemas/${fallbackName}` : ref;
}

function getJsonRequestSchema(requestBody) {
  if (!requestBody) return null;
  return (
    requestBody.content?.["application/json"]?.schema ||
    requestBody.content?.["multipart/form-data"]?.schema ||
    requestBody.content?.["application/x-www-form-urlencoded"]?.schema ||
    null
  );
}

function jsonBody(schema, required = false) {
  return {
    required,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function queryOperation(operationId, summary, description, tag) {
  return {
    tags: [tag],
    summary,
    description,
    operationId,
    parameters: [
      queryParam("instanceId", "ID publico da instancia ConnectyHub", true),
      queryParam("limit", "Quantidade maxima de registros", false, "integer"),
      queryParam("offset", "Deslocamento da paginacao", false, "integer"),
    ],
    responses: { "200": { description: "Consulta executada com sucesso" } },
  };
}

function pathParam(name, description) {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
    description,
  };
}

function instanceIdParam(description) {
  return {
    name: "instanceId",
    in: "path",
    required: true,
    schema: { type: "string" },
    description,
    example: EXAMPLE_INSTANCE_ID,
  };
}

function queryParam(name, description, required = false, type = "string") {
  return {
    name,
    in: "query",
    required,
    schema: { type },
    description,
  };
}

function headerParam(name, description) {
  return {
    name,
    in: "header",
    required: false,
    schema: { type: "string" },
    description,
  };
}

function webhookById(summary, operationId) {
  return {
    tags: ["Nativo ConnectyHub"],
    summary,
    description: `${summary} cadastrado para o cliente API autenticado.`,
    operationId,
    parameters: [pathParam("webhookId", "ID do webhook")],
    responses: { "200": { description: summary } },
  };
}

function pascalCase(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function titleFromPath(pathKey) {
  return pathKey
    .split("/")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
