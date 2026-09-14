import type {AiDocPage} from './documentation';
export const aiReadinessPages:AiDocPage[]=[
  {id:'ia-gemini-compatibility',label:'Contrato Gemini',group:'Implementar',title:'Contrato Gemini versionado',description:'Base alternativa /api/v1beta, versão gemini-v1beta-2026-09-14. O contrato /api/v1/ai continua disponível.',blocks:[
    {kind:'text',text:'Use a chave ConnectyHub em Authorization: Bearer ou x-goog-api-key nesta base. Nunca envie uma chave Google. O modelo público é vinculado à chave. A resposta preserva usageMetadata, safetyRatings, citationMetadata, groundingMetadata, logprobs e thoughtSignature quando retornados pelo modelo, além de connectyhub com os créditos. Crédito não é token: entrada, saída, raciocínio e ferramentas podem ter tarifas diferentes.'},
    {kind:'table',title:'Compatibilidade por operação',columns:['Operação','Contrato entregue','Limite ou dependência'],rows:[
      ['models.list / models.get','GET /api/v1beta/models e /models/{model}','Catálogo autorizado, paginação pageSize/pageToken. Disponibilidade configurada não substitui teste do provedor.'],
      ['generateContent / streamGenerateContent','POST /api/v1beta/models/{model}:generateContent e :streamGenerateContent','Texto, mídia, funções e metadados conforme o modelo. SSE Gemini sem [DONE].'],
      ['countTokens','POST /api/v1beta/models/{model}:countTokens','contents ou generateContentRequest; não reserva nem debita créditos. Consome limite de requisições.'],
      ['embedContent / batchEmbedContents','POST /api/v1beta/models/{model}:embedContent e :batchEmbedContents','1 a 100 itens; autoTruncate=false. Quando não há usageMetadata, usa countTokens do mesmo conteúdo, identificado como provider_countTokens.'],
      ['files.list/get/delete; caches.create/list/get/update/delete','GET/DELETE /api/v1beta/files/{id}; /api/v1beta/cachedContents','Identificadores isolados por projeto. Cache aceita renovação de expiração; upload continua pelo transporte ConnectyHub.'],
      ['Lotes e Interações','Contrato ConnectyHub /api/v1/ai/batches e /interactions','Não são substituição transparente de todos os métodos do SDK Gemini.'],
      ['Live / música em tempo real','POST /api/v1/ai/live e WebSocket próprio','Exige implantação do relay e habilitação operacional. Retorna 503 enquanto indisponível. Não é o transporte Live do SDK Google.'],
      ['Grounding Search/Maps','Condicionado à autorização contratual aplicável','Não presuma que a disponibilidade técnica autorize redistribuir resultados em uma API revendida.'],
      ['Outros tiers e métodos não listados','Não anunciados como equivalência completa','PRIORITY/FLEX sem tarifa publicada são rejeitados; recursos do fornecedor ainda não homologados permanecem pendentes.'],
    ]},
    {kind:'code',title:'JavaScript · geração com o SDK Google',language:'javascript',code:`import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({
  apiKey: process.env.CONNECTYHUB_AI_API_KEY,
  httpOptions: {baseUrl:'https://www.connectyhub.com.br/api',apiVersion:'v1beta',
    headers:{'Idempotency-Key':'pedido-123-gemini-1'}},
});
const response = await ai.models.generateContent({model:'flash-3.5',contents:'Resuma o pedido.'});
console.log(response.text, response.usageMetadata);
// Preserve a mesma identidade e corpo ao recuperar esta operação.
// Para outra operação, crie outra identidade; não reutilize esta globalmente.`},
    {kind:'code',title:'Contagem sem geração',language:'bash',code:`curl 'https://www.connectyhub.com.br/api/v1beta/models/flash-3.5:countTokens' \\
  -H "Authorization: Bearer $CONNECTYHUB_AI_API_KEY" -H 'Content-Type: application/json' \\
  --data '{"contents":[{"role":"user","parts":[{"text":"Olá"}]}]}'`},
    {kind:'note',title:'Contexto e segurança',text:'Devolva thoughtSignature e resultados de função sem modificá-los. Isso não concede autorização para executar ferramentas: valide os argumentos no seu sistema. Arquivos e caches aceitam apenas identidades do próprio projeto. serviceTier STANDARD mantém a tarifa vigente; candidateCount de 1 a 8 depende do modelo e multiplica a reserva máxima de saída.'},
    {kind:'text',text:'OpenAPI separado do contrato Gemini: https://www.connectyhub.com.br/docs/api/ia/gemini-openapi.json. A referência oficial do fornecedor é https://ai.google.dev/api; restrições de Grounding: https://ai.google.dev/gemini-api/terms. O suporte documentado acima é o contrato ConnectyHub, não uma declaração de paridade total ou de homologação de todos os modelos.'},
  ]},
  {id:'ia-prices-limits',label:'Tarifas e limites',group:'Operação',title:'Consultar tarifas e controlar consumo',description:'GET /api/v1/ai/prices retorna tarifas vigentes em créditos, com versão verificável.',blocks:[
    {kind:'text',text:'Sem chave, /prices mostra a tabela base. Com chave ativa, aplica o plano da carteira responsável. Use ?model=flash-3.5 para filtrar. Cada item contém rates com meter, unit, credits_per_unit e version. A versão muda quando a tarifa pública muda. Os valores não são custo Google nem conversão de dólar; o valor efetivo de cada crédito depende do pacote ou plano contratado. Os preços comerciais existentes foram preservados.'},
    {kind:'text',text:'A operação reserva um orçamento antes do envio. Na liquidação, usa consumo confirmado e as tarifas registradas naquela operação; libera a diferença ou mantém a operação em conferência se não puder conciliá-la. O mínimo e o arredondamento são informados pela tabela. Recarga automática exige política e cartão autorizados, com pacote, limiar e teto próprios; consultar preços não autoriza recarga.'},
    {kind:'table',title:'Limites operacionais iniciais',columns:['Escopo','Controle','Como reagir'],rows:[
      ['Carteira responsável','30 requisições/minuto e 4 operações simultâneas, compartilhadas pelos projetos','429 com Retry-After. Não crie várias chaves para contornar a capacidade.'],
      ['Gateway','120 requisições/minuto e 16 operações simultâneas','Limites de proteção ajustáveis pela operação; não representam a quota garantida do Google.'],
      ['Corpo JSON','2 MB no Chat; até 4 MB nas demais rotas HTTP','Base64 aumenta o tamanho. Use transporte direto de arquivo quando estiver habilitado.'],
      ['Arquivos grandes','Até 20.000.000 bytes pelo relay privado','/files/uploads exige transporte habilitado e retorna 503 quando indisponível. Não envie 20 MB em JSON para a Vercel.'],
      ['Live','16 conexões no processo, até 15 minutos por conexão','Consulte disponibilidade; use novo ticket para nova sessão.'],
    ]},
    {kind:'note',title:'Repetição e falhas',text:'Após 429, aguarde Retry-After e aplique espera progressiva com variação. Preserve corpo e Idempotency-Key. Se existe request_id, consulte /requests/{id}: processing/uncertain não autoriza uma nova geração equivalente. Uma queda do cliente não cancela a contabilização. Erro dentro de SSE pode ocorrer após HTTP 200; o término do socket sozinho não comprova liquidação.'},
  ]},
];
