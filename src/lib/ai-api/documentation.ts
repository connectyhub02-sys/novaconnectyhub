import { publicAiModelDefinitions } from "./public-models";
import {resourceAiDocPages} from './resource-documentation';
import { aiStructuredExample, aiFunctionExample, aiFunctionReturnExample, aiNativeExample, aiEmbeddingExample, aiFileExample, aiFileContentExample } from "./advanced-examples";
import { aiOpenApiSpec } from "./openapi";
import { aiChatExample, aiContextExample, aiHistoryExample, aiImageExample, aiModelListExample, aiRequestExample, aiPendingRequestExample, aiResponseExample, aiSseExample, aiStreamExample, aiTextExample } from "./examples";

export type AiDocBlock =
  | { kind: "text"; text: string }
  | { kind: "note"; title: string; text: string }
  | { kind: "code"; title: string; language: string; code: string }
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "steps"; title: string; items: string[] };
export type AiDocPage = { id: string; label: string; group: string; title: string; description: string; method?: string; path?: string; blocks: AiDocBlock[] };
export const aiBaseUrl = aiOpenApiSpec.servers[0].url;
const text = (text: string): AiDocBlock => ({ kind: "text", text });
const note = (title: string, text: string): AiDocBlock => ({ kind: "note", title, text });
const code = (title: string, code: string, language = "json"): AiDocBlock => ({ kind: "code", title, code, language });
const json = (title: string, value: unknown) => code(title, JSON.stringify(value, null, 2));
const table = (title: string, columns: string[], rows: string[][]): AiDocBlock => ({ kind: "table", title, columns, rows });
const steps = (title: string, items: string[]): AiDocBlock => ({ kind: "steps", title, items });
export const aiCurlExample = `curl '${aiBaseUrl}/chat/completions' \\
  -H "Authorization: Bearer $CONNECTYHUB_AI_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: pedido-123-resposta-1' \\
  --data '${JSON.stringify(aiChatExample, null, 2)}'`;
const getCurl = (path: string) => `curl '${aiBaseUrl}${path}' \\
  -H "Authorization: Bearer $CONNECTYHUB_AI_API_KEY"`;

export const aiJavascriptExample = `// Node.js com fetch nativo. Configure a chave no ambiente do servidor.
const base = '${aiBaseUrl}';
const key = process.env.CONNECTYHUB_AI_API_KEY;
if (!key) throw new Error('Configure CONNECTYHUB_AI_API_KEY');

// Gere e salve esta identidade uma vez para cada operação do seu sistema.
// Preserve-a, junto com o corpo, caso precise recuperar a mesma operação.
const operationId = 'pedido-123-resposta-1';
const body = { messages: [{ role: 'user', content: 'Resuma: pedido separado, entrega amanhã.' }] };
const response = await fetch(base + '/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Idempotency-Key': operationId,
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(120_000),
});
const data = await response.json();
if (!response.ok) {
  const detail = typeof data.error === 'string' ? data.error : data.error?.message;
  const requestId = response.headers.get('x-request-id') || data.error?.request_id;
  console.error({ status: response.status, detail, requestId });
  // Consulte requestId; não repita com outra identidade sem conferir o estado.
  throw new Error(detail || 'Solicitação não concluída');
}
console.log(data.choices[0].message.content);
console.log({ credits: data.connectyhub.credits, requestId: data.connectyhub.request_id });`;

export const aiPythonExample = `# Python 3: somente biblioteca padrão. Execute no servidor.
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

base = '${aiBaseUrl}'
key = os.environ['CONNECTYHUB_AI_API_KEY']
# Salve esta identidade e o corpo por operação; use outra para uma nova operação.
operation_id = 'pedido-123-resposta-1'
body = {'messages': [{'role': 'user', 'content': 'Resuma: pedido separado, entrega amanhã.'}]}
request = Request(base + '/chat/completions',
    data=json.dumps(body).encode('utf-8'), method='POST', headers={
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Idempotency-Key': operation_id,
    })
try:
    with urlopen(request, timeout=120) as response:
        result = json.load(response)
    print(result['choices'][0]['message']['content'])
    print({'credits': result['connectyhub']['credits'], 'request_id': result['connectyhub']['request_id']})
except HTTPError as error:
    detail = error.read().decode('utf-8', errors='replace')
    print({'status': error.code, 'request_id': error.headers.get('X-Request-Id'), 'detail': detail})
    raise
except (URLError, TimeoutError):
    # A operação pode continuar. Consulte o UUID, se recebido, ou reenvie
    # posteriormente a mesma identidade e o mesmo corpo para recuperação.
    raise`;

export const aiDocPages: AiDocPage[] = [
  { id: "ia", label: "Começar com IA", group: "Começar", title: "Inteligência para seus projetos", description: "Referência da API de IA ConnectyHub: recursos, integração, mensagens, respostas e créditos em um só lugar.", blocks: [
    steps("Sua primeira integração", ["Entre no painel de API de IA, dê um nome ao projeto e escolha o modelo. Flash 3.5 é a opção recomendada.", "Copie a chave exibida e guarde-a no servidor do seu sistema.", "Envie messages para /chat/completions. Leia a resposta e acompanhe os créditos no painel."]),
    code("Endereço e autenticação", `Base URL: ${aiBaseUrl}\nAuthorization: Bearer SUA_CHAVE\nContent-Type: application/json`, "text"),
    code("Primeira solicitação · Bash", aiCurlExample, "bash"),
    text("Configure CONNECTYHUB_AI_API_KEY no ambiente do servidor. Troque a Idempotency-Key do exemplo por uma identidade própria para cada operação e preserve-a nos reenvios."),
    json("Resposta ilustrativa", aiResponseExample),
    table("Onde encontrar o resultado", ["Campo", "Uso"], [["choices[0].message.content", "Texto produzido pela IA."], ["connectyhub.credits", "Créditos utilizados na operação; o valor do exemplo é ilustrativo."], ["connectyhub.request_id", "Identificador para consultar a situação e recuperar a resposta."]]),
    note("Escolha o recurso", "Para conhecer tudo que esta versão oferece, abra Recursos disponíveis. Para implementar, siga os exemplos JavaScript ou Python e consulte os schemas no OpenAPI JSON."),
  ] },
  { id: "ia-recursos", label: "Recursos disponíveis", group: "Começar", title: "O que você pode construir", description: "A disponibilidade abaixo corresponde à API pública. Recursos do painel e dos agentes não criam automaticamente endpoints nesta API.", blocks: [
    table("Disponíveis nesta versão", ["Recurso", "Como usar"], [["Modelos por chave", "Escolha o modelo no painel; consulte IDs, capacidades e disponibilidade em GET /models."], ["Funções e JSON Schema", "Declare tools e response_format; seu sistema executa as funções autorizadas."], ["Arquivos, áudio, vídeo e PDF", "Análise com resposta textual em generateContent; upload e consulta em /files."], ["Vetores de texto e mídia", "Use /embeddings com uma chave de modelo Embedding."], ["Execução de código e contexto de URLs", "Ferramentas code_execution e url_context em modelos compatíveis."], ["Geração e transformação de texto", "Resumos, reescrita, tradução, classificação e respostas a perguntas em POST /chat/completions."], ["Conversa com contexto", "Envie mensagens system, user e assistant; inclua o histórico relevante em cada chamada."], ["Análise de imagens", "Envie PNG, JPEG ou WebP inline em image_url. A resposta é textual."], ["Respostas baseadas em seus dados", "Busque os dados no seu sistema e inclua os trechos relevantes na mensagem."], ["Variação da resposta", "Ajuste temperature quando precisar; o preenchimento é opcional."], ["Entrega por eventos SSE", "Use stream=true. Os eventos chegam após a conclusão da geração."], ["Recuperação de operações", "Use Idempotency-Key e GET /requests/{request_id}."], ["Acompanhamento de consumo", "Leia os créditos na resposta e acompanhe os gráficos no painel."]]),
    table("Operações por recurso", ["Recurso", "Integração"], [["Imagem e voz", "Geração de conteúdo com chave da família correspondente."], ["Vídeo, música e transcrição", "/videos ou /interactions, conforme modelo."], ["Pesquisa, mapas, funções, MCP e computador", "Ferramentas de /interactions com consumo por execução."], ["Lotes, cache e base de conhecimento", "/batches, /caches, /stores e /documents."], ["Tempo real", "/live e conexão WebSocket autenticada, conforme ativação do serviço."], ["Agentes especializados", "/agents, /environments e execuções cobradas em /interactions."]]),
    note("Contrato de integração", "Use os endpoints e recursos documentados. O catálogo de modelos inclui opções em preparação; somente available=true em GET /models representa liberação operacional. Nem todo modelo oferece todas as ferramentas."),
  ] },
  { id: "ia-autenticacao", label: "Autenticação e projetos", group: "Começar", title: "Uma chave para cada projeto", description: "Cada chave identifica o projeto e a conta responsável pelo consumo.", blocks: [
    steps("Configuração", ["Crie o projeto no painel /dashboard/api-ia. A chave completa aparece na criação; armazene-a em um local seguro.", "Configure CONNECTYHUB_AI_API_KEY no ambiente do seu servidor.", "Envie Authorization: Bearer SUA_CHAVE em todas as rotas de IA."]),
    table("Configuração do cliente HTTP", ["Campo", "Valor"], [["Base URL", aiBaseUrl], ["Authorization", "Bearer seguido da chave da API de IA"], ["Content-Type", "application/json nas solicitações com corpo"], ["model", "connectyhub-auto, se sua ferramenta exigir; pode ser omitido"], ["Execução", "Servidor do seu sistema, com projeto ativo, acesso da conta e créditos disponíveis"]]),
    text("A chave WhatsApp não autentica na API de IA. Chaves do mesmo projeto podem consultar as solicitações desse projeto; chaves de outro projeto não têm acesso a elas. Revogar uma chave impede seu uso futuro."),
    note("Aplicações web e móveis", "Mantenha a chave fora do navegador, aplicativo distribuído e repositório público. O frontend conversa com seu backend; o backend chama a ConnectyHub. Use diretamente o domínio com www para evitar redirecionamento entre hosts."),
  ] },
  { id: "ia-models", label: "Modelos e perfis", group: "Endpoints", method: "GET", path: "/models", title: "Modelos e perfis de inteligência", description: aiOpenApiSpec.paths["/models"].get.description, blocks: [
    code("Requisição", getCurl("/models"), "bash"), json("Resposta 200 · recorte ilustrativo", aiModelListExample),
    table("Como escolher", ["Perfil", "Indicação", "Consumo"], [["Flash Lite 3.5", "Tarefas simples, classificação, tradução e alto volume", "Menor consumo que Flash 3.5 para conteúdo equivalente."], ["Flash 3.5 · recomendado", "Equilíbrio para conversas, raciocínio e aplicações gerais", "Depende da entrada, resposta e recursos usados."], ["Flash 3.6 / 3.7 / 3.8", "Alternativas para uso geral, código e tarefas em várias etapas", "Consumo conforme a tarifa vigente de cada versão."], ["Pro 3.1 Preview", "Tarefas complexas, raciocínio e programação", "Maior consumo; contexto extenso pode usar tarifa diferente."], ["Embedding", "Busca por similaridade, classificação e recuperação de informação", "Cobrança pelo conteúdo processado; não gera uma resposta de conversa."]]),
    table("Catálogo de modelos", ["Modelo / ID", "Perfil", "Disponibilidade"], publicAiModelDefinitions.map(model => [model.name + " · " + model.id, model.profile, "Consulte available e capabilities em GET /models; acesso e tarifa precisam estar ativos."])),
    note("Disponibilidade e versões", "O catálogo foi revisado em 10/09/2026 e inclui variantes de teste e especializadas. Preview indica uma versão sujeita a mudanças. A marca de recomendado é uma escolha da plataforma; não significa que seja o modelo mais novo ou o mais barato. Cada tipo de tarefa exige avaliação com os seus próprios dados."),
    text("Cada nova chave usa o modelo escolhido na criação. Omita model nas chamadas para usar essa escolha, ou envie o mesmo ID. Outro ID retorna model_key_mismatch. Para trocar o modelo, crie outra chave. Chaves antigas sem vinculação mantêm a seleção automática. A disponibilidade depende do catálogo operacional, acesso e cobrança; listar modelos não comprova uma geração bem-sucedida."),
  ] },
  { id: "ia-chat", label: "Gerar resposta", group: "Endpoints", method: "POST", path: "/chat/completions", title: "Gerar uma resposta", description: aiOpenApiSpec.paths["/chat/completions"].post.description, blocks: [
    code("Requisição", aiCurlExample, "bash"),
    table("Campos do corpo", ["Campo", "Tipo e padrão", "Comportamento"], [["messages", "Lista obrigatória", "De 1 a 100 mensagens; inclua pelo menos uma user. Envie somente o histórico necessário."], ["model", "Texto opcional", "O ID do modelo escolhido; a omissão usa o modelo da chave."], ["temperature", "Número opcional; padrão 0.7", "De 0 a 2. Menor favorece consistência, maior amplia variação; não garante respostas idênticas."], ["stream", "Booleano opcional; padrão false", "true solicita entrega SSE após concluir a geração."], ["stream_options", "Objeto opcional", "Aceita include_usage booleano somente com stream=true. Os créditos continuam no evento final independentemente dessa opção."]]),
    table("Formato das mensagens", ["Papel", "Conteúdo", "Uso"], [["system", "Texto não vazio", "Orientações de comportamento. Múltiplas orientações são reunidas na ordem enviada."], ["user", "Texto ou lista de partes", "Pergunta, contexto e mídia. Partes podem ser text, image_url, file ou input_audio."], ["assistant", "Texto não vazio", "Respostas anteriores e tool_calls quando houver chamada de função."]]),
    note("Tamanho do conteúdo", "O JSON completo deve ter até 2.000.000 bytes, incluindo imagens codificadas. A codificação base64 aumenta o tamanho do arquivo. Conteúdo muito extenso pode exigir redução mesmo dentro desse tamanho de transporte."),
    json("Resposta 200", aiResponseExample),
    table("Campos da resposta", ["Campo", "Significado"], [["id", "Identificador da resposta, com prefixo chatcmpl-."], ["object", "chat.completion."], ["created", "Data Unix em segundos."], ["model", "Identificador público connectyhub-auto."], ["choices[0].message", "role=assistant e content com o texto."], ["choices[0].finish_reason", "stop: concluída; length: resposta parcial; content_filter: sem texto disponível."], ["connectyhub", "request_id, project_id e credits da operação."]]),
    table("Cabeçalhos da resposta", ["Cabeçalho", "Significado"], [["X-Request-Id", "UUID para consultar a operação; também pode aparecer em erros após o registro."], ["Idempotency-Replayed", "true quando o resultado foi recuperado sem nova execução; false em uma nova conclusão."], ["Cache-Control", "no-store."]]),
    text("Uma resposta parcial requer tratamento pela aplicação. Examine finish_reason antes de usar o resultado como documento completo. Quando não houver texto, não considere a resposta como conteúdo gerado válido."),
  ] },
  { id: "ia-texto", label: "Texto e instruções", group: "Guias de recursos", title: "Geração, resumos e classificação", description: "Use mensagens para definir a tarefa, fornecer informações e orientar o formato da resposta.", blocks: [
    json("Orientação e reescrita", aiTextExample),
    table("Tarefas comuns", ["Tarefa", "Exemplo de instrução"], [["Resumo", "Resuma o texto fornecido em três tópicos, preservando datas e valores."], ["Tradução", "Traduza para inglês mantendo nomes próprios e números."], ["Classificação", "Classifique a mensagem em venda, suporte ou financeiro. Responda com uma categoria."], ["Extração", "Liste produto, quantidade e prazo citados. Quando não houver informação, escreva não informado."], ["Código", "Explique o trecho de código e sugira uma correção; não execute nada."]]),
    steps("Uma solicitação clara", ["Coloque as regras gerais em system.", "Forneça em user a tarefa e os dados que ela precisa.", "Diga o idioma, o público e o formato desejado.", "Valide o resultado antes de usá-lo em decisões ou ações automáticas."]),
    note("Texto em JSON", "Use response_format com json_schema para definir uma estrutura, ou json_object para solicitar JSON. Valide o resultado e confira o encerramento antes de usá-lo. Consulte a seção Respostas estruturadas."),
  ] },
  { id: "ia-conversas", label: "Conversas e histórico", group: "Guias de recursos", title: "Conversas com continuidade", description: "A continuidade vem das mensagens que seu sistema inclui em cada solicitação.", blocks: [
    json("Segundo turno de uma conversa", aiHistoryExample),
    steps("Manter o contexto", ["Guarde as mensagens do usuário e as respostas da IA no seu sistema.", "Ao receber uma nova pergunta, monte messages com as orientações, o histórico relevante e a nova pergunta.", "Use uma nova Idempotency-Key para esse novo turno.", "Acrescente choices[0].message ao histórico depois da conclusão."]),
    text("O UUID de uma solicitação serve para recuperar aquela operação. Ele não é um identificador de conversa e não carrega automaticamente mensagens de chamadas anteriores. Não há campo conversation_id no corpo público."),
    note("Histórico extenso", "Selecione o contexto necessário ou gere um resumo no seu sistema antes do próximo turno. O histórico reenviado participa do processamento e do consumo de créditos."),
  ] },
  { id: "ia-imagens", label: "Análise de imagens", group: "Guias de recursos", title: "Faça perguntas sobre imagens", description: "Envie texto e imagem na mesma mensagem user para receber uma análise textual.", blocks: [
    json("Estrutura válida · PNG mínimo de demonstração", aiImageExample),
    text("A imagem desse JSON tem apenas um pixel e demonstra o formato do pedido. Para uma análise útil, substitua a data URL pela sua imagem completa."),
    code("Preparar sua imagem · Node.js", `import { readFile } from 'node:fs/promises';\nconst image = await readFile('./produto.jpg');\nconst body = { messages: [{ role: 'user', content: [\n  { type: 'text', text: 'Descreva o produto e informe o que não consegue identificar.' },\n  { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + image.toString('base64') } },\n] }] };\n// Envie body para POST /chat/completions com sua chave e identidade da operação.`, "javascript"),
    table("Regras do arquivo", ["Item", "Como enviar"], [["Formatos", "PNG, JPEG ou WebP. O tipo declarado deve corresponder ao arquivo."], ["Origem", "Data URL inline: data:image/jpeg;base64,... . URLs remotas não são aceitas."], ["Mensagem", "Partes image_url são aceitas em conteúdo de user; acompanhe com uma pergunta clara."], ["Várias imagens", "Use várias partes image_url na mesma mensagem e explique a ordem na pergunta."], ["Tamanho", "O JSON completo, com texto e base64, deve caber em 2.000.000 bytes."], ["Resultado", "Texto em choices[0].message.content. Não é geração nem edição de imagem."]]),
    note("Qualidade da análise", "Use imagens legíveis e faça perguntas específicas. Extração visual pode conter erros; confira valores e informações essenciais no documento original. Redimensione no seu servidor se o corpo ficar grande."),
  ] },
  { id: "ia-contexto", label: "Seus dados e documentos", group: "Guias de recursos", title: "Respostas com o contexto do seu sistema", description: "Inclua informações que a IA precisa consultar sem pressupor acesso à sua plataforma.", blocks: [
    json("Referência e pergunta", aiContextExample),
    steps("Integrar uma base de conhecimento", ["Consulte a sua base no servidor usando as permissões do usuário.", "Selecione os trechos necessários para responder à pergunta.", "Envie os trechos junto com a pergunta, identificando a origem e orientando como tratar informação ausente.", "Valide a resposta e mantenha as referências na interface do seu sistema."]),
    text("PDFs podem ser enviados inline ou por /files e usados em generateContent. A análise de um arquivo não cria um índice de busca; seu sistema administra a recuperação de documentos."),
    note("Informação externa", "Use funções para consultar seu sistema e URL context para analisar páginas indicadas no conteúdo, conforme capabilities. Execução de código está disponível nos modelos compatíveis. Busca aberta na web e mapas ainda aguardam liberação."),
  ] },
  { id: "ia-javascript", label: "JavaScript / Node.js", group: "Implementar", title: "Integração em JavaScript", description: "Exemplo de chamada HTTP no servidor com leitura da resposta, créditos e diagnóstico.", blocks: [
    code("Chamada completa", aiJavascriptExample, "javascript"),
    note("Falha de conexão", "Um timeout no cliente não comprova cancelamento. A operação pode continuar. Guarde o corpo e a identidade antes de enviar. Se recebeu o UUID, consulte a operação; caso contrário, reenvie o mesmo corpo com a mesma Idempotency-Key para recuperá-la."),
    code("Consultar uma operação", `const requestId = '00000000-0000-4000-8000-000000000001';\nconst response = await fetch('${aiBaseUrl}/requests/' + requestId, {\n  headers: { Authorization: 'Bearer ' + process.env.CONNECTYHUB_AI_API_KEY },\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error || 'Consulta não concluída');\nconsole.log(result.status, result.charged_credits, result.response);`, "javascript"),
    text("Ferramentas que usam Chat Completions podem configurar esta base e connectyhub-auto, desde que enviem somente os campos suportados. Não há promessa de compatibilidade integral com qualquer SDK. Desative repetições automáticas que criem uma nova identidade para a mesma operação."),
  ] },
  { id: "ia-python", label: "Python", group: "Implementar", title: "Integração em Python", description: "Use HTTP com a biblioteca padrão, sem depender de um SDK específico.", blocks: [
    code("Chamada completa", aiPythonExample, "python"),
    code("Preparar uma imagem", `import base64\nfrom pathlib import Path\nimage = base64.b64encode(Path('produto.png').read_bytes()).decode('ascii')\nbody = {'messages': [{'role': 'user', 'content': [\n    {'type': 'text', 'text': 'Descreva esta imagem.'},\n    {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + image}},\n]}]}\n# Use este body na chamada HTTP do exemplo anterior.`, "python"),
    text("Mantenha a chave e os registros de recuperação no servidor. Use uma nova identidade para uma nova pergunta; preserve a anterior ao tentar recuperar uma operação interrompida."),
  ] },
  { id: "ia-stream", label: "Eventos SSE", group: "Implementar", title: "Receber a resposta como eventos", description: "stream=true muda o formato da entrega. O processamento é concluído antes de os eventos serem enviados.", blocks: [
    json("Corpo da requisição", aiStreamExample),
    text("Use POST /chat/completions com os mesmos cabeçalhos de autenticação e idempotência. O retorno bem-sucedido usa Content-Type: text/event-stream. Uma falha anterior à entrega continua retornando JSON de erro."),
    code("Sequência real do protocolo · valores ilustrativos", aiSseExample, "text"),
    table("Eventos", ["Ordem", "Conteúdo", "Ação do cliente"], [["1", "choices[0].delta.role e delta.content", "Leia o texto completo."], ["2", "delta vazio, finish_reason e connectyhub", "Confira a conclusão e os créditos; guarde request_id."], ["3", "data: [DONE]", "Finalize a leitura."]]),
    note("Escolha do protocolo", "Chat Completions mantém a entrega SSE após concluir. Para geração incremental, use /models/{model}:streamGenerateContent. Para áudio bidirecional, use /live com um modelo compatível. Na geração incremental, o evento content.completed informa os créditos antes de data: [DONE]."),
    text("Implemente um leitor SSE que mantenha o buffer entre leituras: um bloco HTTP pode conter vários eventos ou apenas parte de um evento. Separe os eventos pela linha em branco e só faça JSON.parse no conteúdo de data quando ele não for [DONE]. Para ferramentas de terminal, curl -N permite visualizar os eventos."),
  ] },
  { id: "ia-requests", label: "Consultar solicitação", group: "Endpoints", method: "GET", path: "/requests/{request_id}", title: "Consultar situação e recuperar resposta", description: aiOpenApiSpec.paths["/requests/{request_id}"].get.description, blocks: [
    code("Requisição", getCurl(`/requests/${aiRequestExample.id}`), "bash"), json("Operação concluída", aiRequestExample), json("Operação em conferência · créditos ilustrativos", aiPendingRequestExample),
    table("Estados da operação", ["Estado", "O que significa", "Próximo passo"], [["preparing", "Operação registrada", "Aguarde e consulte novamente."], ["reserved", "Créditos separados para processamento", "Aguarde a execução."], ["processing", "Execução iniciada", "Aguarde; não crie uma operação equivalente."], ["completed", "Resposta e consumo confirmados", "Leia response e charged_credits."], ["uncertain", "Resultado ou consumo em conferência", "Preserve a identidade e consulte depois; não repita com outra chave."], ["failed", "Tentativa encerrada com falha", "Confira error_code e corrija a causa antes de uma nova tentativa."]]),
    table("Campos da consulta", ["Campo", "Descrição"], [["id", "UUID da operação, sem o prefixo chatcmpl-."], ["charged_credits", "Créditos confirmados para esta operação."], ["reserved_credits", "Valor separado durante o processamento."], ["response", "Resposta ChatCompletion quando disponível; null nos demais casos."], ["error_code", "Código de diagnóstico ou null."], ["created_at", "Data e hora ISO 8601."]]),
    text("A consulta exige chave ativa do mesmo projeto. Ela recupera uma operação existente; não inicia uma geração nova. Faça consultas espaçadas, interrompa quando houver conclusão e encaminhe o UUID ao suporte se a conferência persistir."),
  ] },
  { id: "ia-creditos", label: "Créditos e painel de uso", group: "Operação", title: "Tudo em créditos", description: "Acompanhe o consumo da API usando a carteira ConnectyHub compartilhada pela sua conta.", blocks: [
    steps("Como uma operação usa saldo", ["A conta precisa de acesso válido e créditos disponíveis.", "Ao iniciar, uma parte do saldo fica separada para processamento.", "Na conclusão, o consumo é confirmado e a diferença volta a ficar disponível.", "Falhas confirmadas são encerradas sem débito; resultados em conferência mantêm o valor separado até a definição."]),
    table("Onde acompanhar", ["Local", "Informação"], [["Resposta", "connectyhub.credits, em créditos ConnectyHub."], ["Consulta da operação", "charged_credits e reserved_credits."], ["Painel /dashboard/api-ia", "Consumo diário, solicitações, resultados e distribuição por projeto."], ["Filtros do painel", "Últimos 7, 30 ou 90 dias; um projeto ou todos."], ["Carteira", "Saldo compartilhado entre projetos, agentes e atendimentos da conta."]]),
    note("Valores ilustrativos", "Uma carteira com 1.000 créditos e uma operação concluída de 3 créditos fica com 997 créditos, desconsiderando outras atividades. O consumo real varia conforme o trabalho realizado. Não há um preço fixo por mensagem declarado neste exemplo."),
    text("Recuperar uma resposta concluída com a mesma Idempotency-Key e o mesmo corpo não inicia uma nova geração nem um novo débito. A recarga é feita no painel e fica disponível após confirmação do pagamento. Recarregar créditos e renovar o plano são operações distintas."),
  ] },
  { id: "ia-cobranca-recursos", label: "Recursos e créditos", group: "Operação", title: "Como cada recurso utiliza créditos", description: "A carteira da conta atende à API e aos agentes. Confira também a disponibilidade do recurso antes de integrar.", blocks: [
    table("Cobertura de consumo", ["Recurso", "Como o consumo é considerado", "Situação na API"], [
      ["Conversas, raciocínio e respostas estruturadas", "Modelo escolhido, conteúdo processado e resposta produzida, incluindo processamento de raciocínio.", "Implementado"],
      ["Leitura de imagem, áudio, vídeo e documentos", "Conteúdo analisado e resposta produzida pelo modelo compatível.", "Implementado"],
      ["Funções, execução de código e contexto de URLs", "Processamento realizado pela IA. Uma função executada pelo seu próprio sistema pode ter custos externos adicionais.", "Implementado"],
      ["Vetores de texto e mídia", "Conteúdo processado para produzir o vetor.", "Implementado"],
      ["Catálogo, consulta de solicitações e gestão de arquivos", "Não iniciam geração. O processamento de um arquivo ao usá-lo em uma chamada é considerado nessa chamada.", "Incluído, sem débito de geração separado"],
      ["Geração de imagem, voz, música e vídeo", "Processamento e mídia produzida, conforme modelo, resolução ou duração.", "Conforme modelo ativo"],
      ["Busca na web e mapas", "Consultas executadas e processamento da resposta.", "Ferramentas de Interações"],
      ["Sessões em tempo real", "Conteúdo da sessão, com reserva renovada e conferência no encerramento.", "Conforme ativação do serviço"],
      ["Lotes e cache gerenciado", "Conferência por item; leitura e tempo de armazenamento do cache.", "Rotas próprias"],
      ["Pesquisa em arquivos e recursos especializados", "Indexação, pesquisa e etapas de processamento.", "Coleções e Interações"],
    ]),
    text("A presença de um modelo no catálogo não libera automaticamente todas as suas funções. Use available e capabilities para conferir os recursos operacionais. Uma tarifa ausente impede a execução; o sistema não transforma um consumo sem preço em uma geração gratuita."),
    text("Na plataforma, respostas dos agentes, memória, análise de conteúdo, follow-up, interpretação de agenda e geração de voz utilizam a mesma carteira. O preço de uma geração pode variar entre modelos. A confirmação de consumo aparece em créditos, sem exigir configuração de medidas internas."),
    note("Conferência de consumo", "Uma falha de cobrança pode deixar uma operação pendente de conferência. Consulte a operação antes de repetir. Recuperar uma geração já concluída com a mesma identidade não produz novo débito."),
  ] },
  { id: "ia-falhas", label: "Erros e recuperação", group: "Operação", title: "Trate falhas sem duplicar operações", description: "Guarde a identidade, o conteúdo enviado e o UUID recebido para conseguir recuperar uma solicitação.", blocks: [
    steps("Idempotência", ["Crie uma identidade por operação do seu sistema, com 1 a 128 caracteres ASCII imprimíveis sem espaços.", "Salve a identidade e o corpo antes de chamar a API.", "Se precisar recuperar a operação, repita a mesma identidade e o mesmo corpo.", "Para uma nova pergunta ou corpo diferente, use outra identidade."]),
    table("Depois de uma falha", ["Situação", "Como agir"], [["Resposta concluída perdida", "Reenvie com a mesma identidade e corpo; a resposta será recuperada."], ["Conexão interrompida sem UUID", "Reenvie com a identidade e corpo originais para recuperação."], ["request_in_progress", "Consulte o UUID ou aguarde antes de recuperar com a mesma identidade."], ["ai_idempotency_conflict", "O corpo mudou. Recupere com o original; use outra identidade apenas para outra operação."], ["previous_request_failed", "A tentativa anterior terminou com falha. Corrija a causa antes de tentar novamente com uma nova identidade."], ["settlement_pending / uncertain", "Aguarde a conferência e consulte o UUID. Não crie outra operação equivalente."]]),
    json("Erro na geração", { error: { code: "request_in_progress", message: "Esta solicitação já está sendo processada ou conciliada.", request_id: aiRequestExample.id } }),
    json("Erro de consulta", { error: "Solicitação não encontrada." }),
    text("Na geração, error contém code e message; request_id e X-Request-Id aparecem quando a operação já foi registrada. Nas rotas de identificação e consulta, error é uma mensagem de texto. Não dependa do texto exato da mensagem para decidir a ação."),
    table("Diagnóstico do conteúdo", ["Código", "Correção"], [["invalid_json / body_too_large", "Envie JSON válido e reduza o corpo para até 2.000.000 bytes."], ["invalid_messages / missing_user_message / invalid_role", "Confira messages, os papéis e a presença de uma mensagem user."], ["empty_message / unsupported_content", "Envie texto não vazio ou partes de conteúdo documentadas."], ["invalid_image", "Envie data URL PNG, JPEG ou WebP completa e válida."], ["unsupported_parameter", "Remova os campos que não fazem parte deste contrato."], ["invalid_temperature / invalid_stream / invalid_stream_options", "Confira os tipos, valores e a dependência de stream_options."], ["invalid_idempotency_key", "Use de 1 a 128 caracteres ASCII imprimíveis sem espaços."], ["input_limit", "Reduza o contexto ou a imagem e prepare uma nova operação após conferir a tentativa anterior."], ["invalid_api_key / project_paused / ai_key_inactive", "Confira a chave e o projeto no painel."], ["ai_insufficient_credits / ai_contract_inactive", "Confira créditos disponíveis e acesso da conta."], ["service_unavailable / request_failed / access_or_service_unavailable", "Consulte a operação quando houver UUID; se persistir, informe esse identificador ao suporte."]]),
  ] },
  { id:"ia-estruturada",label:"Respostas estruturadas",group:"Recursos",title:"Extração com JSON Schema",description:"Defina os campos de saída da sua integração.",blocks:[
    json("POST /chat/completions",aiStructuredExample),
    text("A resposta continua em choices[0].message.content, como texto JSON. Faça JSON.parse, valide os campos e trate respostas interrompidas ou recusadas. Use json_object quando não precisar impor campos; use text para resposta livre."),
  ]},
  { id:"ia-funcoes",label:"Funções e ferramentas",group:"Recursos",title:"Conectar a IA às ações do seu sistema",description:"A IA propõe chamadas; seu servidor valida, executa e devolve os resultados.",blocks:[
    json("1. Declarar uma função",aiFunctionExample),
    steps("Fluxo de uma função",["Leia choices[0].message.tool_calls. Uma resposta pode conter várias chamadas.","Valide o nome, os argumentos JSON, as permissões e a ação no seu sistema antes de executá-la.","Inclua a mensagem assistant completa no histórico, preservando cada id e o campo context quando recebido.","Acrescente uma mensagem tool com tool_call_id e o resultado serializado. Envie o histórico com as mesmas declarações de funções em uma nova operação.","Use uma nova Idempotency-Key para a rodada com resultados; preserve a identidade apenas ao recuperar exatamente a mesma operação."]),
    json("2. Devolver o resultado · contexto ilustrativo",aiFunctionReturnExample),
    text("Os identificadores deste exemplo são ilustrativos. Na aplicação, reutilize a mensagem retornada pela API, incluindo context sem alterações. Nunca fabrique esse contexto. Cada rodada de geração usa créditos; as funções da sua aplicação não são executadas pela ConnectyHub."),
    table("Escolha da função",["tool_choice","Comportamento"],[["auto","O modelo decide se propõe uma função."],["none","Não chama funções nesta rodada."],["required","Exige uma das funções declaradas."],["{type: function, function: {name: ...}}","Escolhe uma função declarada pelo nome."]]),
    table("Ferramentas integradas",["Campo tools em chat","Função"],[["[{type: code_execution}]","Executa cálculos em ambiente isolado e devolve o resultado. Use generateContent para também ler o código e a saída de execução."],["[{type: url_context}]","Lê conteúdo das URLs fornecidas no texto. Não equivale a uma pesquisa aberta na web."]]),
  ]},
  { id:"ia-conteudo",label:"Conteúdo multimodal",group:"Endpoints",method:"POST",path:"/models/{model}:generateContent",title:"Conteúdo, mídia e configurações",description:"Use a estrutura contents/parts para controlar mensagens, mídia e ferramentas com uma resposta textual.",blocks:[
    json("Exemplo com código · Flash 3.5",aiNativeExample),
    code("Endpoint",aiBaseUrl+"/models/flash-3.5:generateContent","text"),
    table("Configurações",["Campo","Uso"],[["contents / parts","Texto, mídia inline, arquivo do projeto, functionCall e functionResponse."],["systemInstruction.parts[].text","Orientação de comportamento; somente texto."],["generationConfig.temperature / topP / topK","Variação da resposta, conforme suporte do modelo."],["generationConfig.responseMimeType / responseJsonSchema","Formato e estrutura da resposta."],["generationConfig.thinkingConfig","Ajustes de raciocínio próprios do modelo; podem alterar o consumo."],["generationConfig.mediaResolution","Resolução de análise da mídia, conforme o modelo."],["generationConfig.seed / stopSequences","Controle de geração, quando aceito pelo modelo."],["tools / toolConfig","Declarações de funções, codeExecution e urlContext."],["safetySettings","Categorias e níveis de filtragem aceitos pelo modelo."]]),
    text("Leia candidates[].content.parts: text é texto; functionCall é uma solicitação de função; executableCode e codeExecutionResult mostram código e resultado. Preserve thoughtSignature ao reenviar uma chamada. A cobrança aparece somente em connectyhub.credits."),
    text("Análise de áudio aceita WAV, MP3, MP4, AAC, OGG e FLAC. Vídeo aceita MP4, WebM e QuickTime. Imagens aceitam PNG, JPEG e WebP; documentos aceitam PDF ou texto simples. Use inlineData com mimeType e data base64 ou um arquivo do projeto. O JSON completo pode ter até 20 MB."),
    note("Entrega em eventos", "POST /models/{model}:streamGenerateContent devolve um evento SSE com a resposta completa e depois [DONE]. Esta entrega ocorre após a conclusão; não é uma sessão de áudio ou vídeo em tempo real."),
  ]},
  { id:"ia-arquivos",label:"Arquivos e PDF",group:"Endpoints",method:"POST",path:"/files",title:"Enviar e reutilizar arquivos",description:"Arquivos pertencem ao projeto; uma chave de outro projeto não pode consultá-los nem usá-los.",blocks:[
    json("POST /files · exemplo válido de texto em base64",aiFileExample),
    steps("Analisar um arquivo",["Envie data em base64 puro, mime_type e display_name. O arquivo pode ter até 20 MB.","Guarde id e name da resposta. Consulte GET /files/{id} até status=active; processing ainda não está pronto.","Envie name em fileData.fileUri junto com sua pergunta para generateContent.","Observe expires_at; arquivos expirados precisam ser enviados novamente. Exclua com DELETE /files/{id} quando terminar."]),
    json("POST /models/flash-3.5:generateContent · substitua o ID",aiFileContentExample),
    table("Endpoints",["Método / caminho","Uso"],[["POST /files","Envia um arquivo; cada envio cria um recurso novo."],["GET /files","Até 100 arquivos recentes do projeto."],["GET /files/{id}","Consulta e atualiza estado de processamento."],["DELETE /files/{id}","Exclui o arquivo do projeto."]]),
    text("Upload e consulta não geram conteúdo nem debitam créditos. A chamada de análise consome créditos. Chaves ativas do mesmo projeto compartilham os arquivos; remover o arquivo impede reutilização posterior, mas não apaga resultados de operações anteriores."),
  ]},
  { id:"ia-embeddings",label:"Vetores e similaridade",group:"Endpoints",method:"POST",path:"/embeddings",title:"Busca por significado",description:"Transforme texto ou mídia compatível em um vetor numérico usando uma chave vinculada a um modelo Embedding.",blocks:[
    json("POST /embeddings",aiEmbeddingExample),
    text("Leia data[0].embedding e armazene o vetor com o documento no seu sistema. Para busca, gere o vetor da pergunta com RETRIEVAL_QUERY e compare com os documentos. Use o mesmo modelo e a mesma dimensionalidade nos dois lados; modelos diferentes produzem espaços incompatíveis."),
    table("Campos",["Campo","Uso"],[["input","Texto não vazio ou lista de até 100 textos. Para mídia, use content.parts em um modelo multimodal compatível."],["content","Alternativa a input: partes inlineData ou fileData do projeto. document_ocr e audio_track_extraction são opcionais conforme suporte."],["dimensions","Dimensão de saída de 1 a 3072; o suporte final depende do modelo."],["task_type","RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT, SEMANTIC_SIMILARITY, CLASSIFICATION, CLUSTERING, QUESTION_ANSWERING, FACT_VERIFICATION ou CODE_RETRIEVAL_QUERY."],["title","Título do documento, somente com RETRIEVAL_DOCUMENT."],["model","Opcional: o mesmo modelo vinculado à chave."]]),
    note("Créditos e recuperação", "A operação usa o conteúdo processado e sua modalidade para calcular créditos. Preserve a Idempotency-Key e consulte /requests/{request_id} para recuperar. Esta rota gera vetores; não hospeda um banco vetorial ou índice de documentos."),
  ]},
  { id: "ia-schemas", label: "Schemas e downloads", group: "Referência", title: "Contrato completo em OpenAPI", description: "Use o arquivo JSON para consultar tipos, exemplos e respostas HTTP ou importar a referência no seu cliente de API.", blocks: [
    table("Schemas", ["Nome", "Uso"], [["ChatRequest", "Campos da solicitação, exemplos e dependência de stream_options."], ["Message / TextPart / ImagePart", "Papéis da conversa e partes de conteúdo."], ["ChatCompletion", "Resposta textual concluída."], ["ChatChunk", "Estrutura dos eventos SSE; o terminador [DONE] não é JSON."], ["CreditUsage", "Identificadores e consumo em créditos."], ["AiRequest", "Situação da operação, consumo e resposta recuperada."], ["ModelList", "Identificação pública da API."], ["AiError / SimpleError", "Os dois formatos de erro do contrato atual."]]),
    steps("Importar no cliente de API", ["Baixe o OpenAPI JSON de IA / LLM nesta página.", "Importe como especificação OpenAPI 3.1 no seu cliente HTTP.", "Configure a base de produção e a chave da API de IA em uma variável privada.", "Escolha um exemplo de messages e uma Idempotency-Key própria antes de enviar."]),
    note("Versão da referência", "OpenAPI 1.4.0: geração multimodal, Interações, recursos persistentes e tempo real com consumo em créditos. Confira a ativação operacional no catálogo antes de integrar."),
    text("Para compartilhar com outra equipe ou assistente de programação, baixe também o Guia de integração em Markdown. O guia e as páginas usam a mesma fonte de conteúdo."),
  ] },
  ...resourceAiDocPages,
];

export function aiEndpointResponses(page: AiDocPage): Array<[string, string]> {
  const operation = page.id === "ia-chat" || page.id === "ia-falhas" ? aiOpenApiSpec.paths["/chat/completions"].post
    : page.id === "ia-models" ? aiOpenApiSpec.paths["/models"].get
    : page.id === "ia-requests" ? aiOpenApiSpec.paths["/requests/{request_id}"].get : null;
  return operation ? Object.entries(operation.responses).map(([status, response]) => [status, String((response as {description?:string}).description??'')]) : [];
}
