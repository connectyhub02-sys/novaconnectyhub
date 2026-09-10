import type {AiDocPage,AiDocBlock} from './documentation';
export type AiRecipe={id:string;name:string;path:string;body:Record<string,unknown>;family:string;result:string;notes:string;poll?:string};
export const aiRecipes:AiRecipe[]=[
  {id:'imagem',name:'Gerar uma imagem',path:'/models/connectyhub-auto:generateContent',family:'Imagem',body:{contents:[{parts:[{text:'Um café brasileiro em uma xícara branca, fotografia de produto.'}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}}},result:'candidates[0].content.parts: salve inlineData.data como base64 decodificado, usando inlineData.mimeType para escolher a extensão.',notes:'A chave deve usar um modelo de imagem liberado. Para editar, acrescente uma parte inlineData com a imagem original. Resoluções aceitas dependem do modelo.'},
  {id:'voz',name:'Transformar texto em voz',path:'/models/connectyhub-auto:generateContent',family:'Voz',body:{contents:[{parts:[{text:'Leia em português brasileiro: Seu pedido está pronto para retirada.'}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}}},result:'candidates[0].content.parts[].inlineData. Áudio PCM precisa de um contêiner WAV ou reprodução com a frequência e os canais corretos; não renomeie PCM para MP3.',notes:'Use uma chave da família Voz. Para duas vozes, configure multiSpeakerVoiceConfig e identifique os personagens no texto.'},
  {id:'video',name:'Gerar e acompanhar um vídeo',path:'/videos',poll:'/videos/',family:'Video',body:{prompt:'Uma câmera percorre uma cafeteria vazia ao amanhecer.',duration_seconds:8,resolution:'720p',aspect_ratio:'16:9'},result:'result.videos[].url. Baixe esse caminho com Authorization da mesma chave; ele não é um link público para compartilhar.',notes:'O envio retorna antes da conclusão. Cobrança depende da duração, resolução e saídas produzidas. Para extensão, envie video com o ID de um vídeo concluído e resolução 720p.'},
  {id:'pesquisa',name:'Pesquisar na web com fontes',path:'/interactions',poll:'/interactions/',family:'Conversas com pesquisa',body:{input:'Pesquise três tendências atuais de atendimento ao cliente e apresente as fontes.',tools:[{type:'web_search'}]},result:'result.steps: percorra as saídas textuais e os resultados da pesquisa. Preserve citações e atribuições.',notes:'Cada consulta executada entra no consumo além do processamento do conteúdo. O número de links da resposta não determina o número de consultas.'},
  {id:'mapas',name:'Pesquisar lugares por localização',path:'/interactions',poll:'/interactions/',family:'Conversas com mapas',body:{input:'Encontre cafeterias próximas e informe endereço e fontes.',tools:[{type:'maps',latitude:-23.5505,longitude:-46.6333}]},result:'result.steps. Preserve fontes, links e atribuições dos lugares retornados.',notes:'Localização precisa ser fornecida pelo seu sistema com autorização do usuário. Maps está disponível em Interações; a rota generateContent não aceita essa ferramenta nesta versão.'},
  {id:'codigo',name:'Executar um cálculo com código',path:'/interactions',poll:'/interactions/',family:'Conversas com execução de código',body:{input:'Calcule a média e o desvio padrão dos valores 10, 20, 30, 40 e explique o resultado.',tools:[{type:'code_execution'}]},result:'result.steps: saídas do modelo e resultados da execução.',notes:'O ambiente da ferramenta é separado do seu servidor. Conteúdo processado, etapas de raciocínio e resultados usados pelo modelo entram na geração cobrada.'},
  {id:'url',name:'Analisar o conteúdo de uma página',path:'/interactions',poll:'/interactions/',family:'Conversas com contexto de URLs',body:{input:'Leia https://www.connectyhub.com.br e resuma os serviços apresentados.',tools:[{type:'url_context'}]},result:'result.steps. Verifique a resposta antes de usá-la em decisões automáticas.',notes:'Uma URL na instrução é conteúdo para a ferramenta. O campo uri de mídia continua reservado aos arquivos enviados pelo projeto.'},
  {id:'musica',name:'Gerar uma música',path:'/interactions',poll:'/interactions/',family:'Music',body:{input:'Crie uma música instrumental suave com violão e piano para uma apresentação.'},result:'result.steps[].content: áudio pode vir em data ou em uri de download autenticado.',notes:'Selecione uma chave Music. A cobrança considera as músicas produzidas. A especialidade do modelo não muda ao escrever outro tipo de pedido.'},
  {id:'transcricao',name:'Transcrever um áudio enviado',path:'/interactions',poll:'/interactions/',family:'Transcrição',body:{input:[{type:'audio',uri:'files/00000000-0000-4000-8000-000000000001'}],generation_config:{transcription_config:{language_codes:['pt-BR'],mode:{type:'verbatim',diarization_mode:'speaker',timestamp_granularities:['word']}}}},result:'result.steps: texto reconhecido e anotações disponíveis conforme o modelo.',notes:'Antes de executar, envie o áudio por /files e substitua o ID do exemplo. Acompanhe o arquivo até active. A criação do arquivo não é a transcrição.'},
  {id:'lote',name:'Processar vários itens em lote',path:'/batches',poll:'/batches/',family:'Modelo com batch',body:{display_name:'Descrições',requests:[{key:'produto-a',request:{contents:[{parts:[{text:'Descreva uma camiseta azul.'}]}]}},{key:'produto-b',request:{contents:[{parts:[{text:'Descreva uma mochila verde.'}]}]}}]},result:'result.results[]: associe cada item pela key, nunca apenas pela posição.',notes:'Cada item bem-sucedido tem consumo apurado. Falhas parciais não anulam os itens concluídos. Cancelar não estorna processamento já realizado.'},
  {id:'cache',name:'Criar um contexto reutilizável',path:'/caches',family:'Modelo com cache',body:{display_name:'Manual',ttl_seconds:3600,contents:[{parts:[{text:'Substitua este texto pelo manual completo da sua empresa.'}]}]},result:'id e expires_at. Em uma geração, use cachedContent: "caches/ID" junto com a pergunta.',notes:'O exemplo curto mostra o formato; o modelo pode exigir um contexto mínimo. O armazenamento consome créditos enquanto ativo. PATCH altera a validade; DELETE encerra e calcula o período utilizado.'},
  {id:'vetores',name:'Criar vetores para busca semântica',path:'/embeddings',family:'Embedding',body:{input:['Entrega em até três dias úteis.','Troca gratuita em até sete dias.'],task_type:'RETRIEVAL_DOCUMENT',dimensions:768},result:'data[].embedding. Armazene o vetor e o texto no seu banco; use o mesmo modelo e dimensão para as perguntas.',notes:'A consulta deve usar RETRIEVAL_QUERY. Gerar o vetor é cobrado pelo conteúdo processado; essa rota não armazena um banco vetorial para o cliente.'},
];
export function recipeJavascript(recipe:AiRecipe) {
  return `// Node.js; execute no servidor. Use uma chave compatível com ${recipe.family}.
const base = 'https://www.connectyhub.com.br/api/v1/ai';
const key = process.env.CONNECTYHUB_AI_API_KEY;
const operationId = process.env.CONNECTYHUB_OPERATION_ID;
if (!key || !operationId) throw new Error('Configure a chave e uma identidade persistente para esta operação.');
const body = ${JSON.stringify(recipe.body,null,2)};
async function call(path, data) {
  const response = await fetch(base + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': operationId},
    ...(data === undefined ? {} : {body: JSON.stringify(data)}),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error({http: response.status, error: result.error, requestId: response.headers.get('x-request-id')});
    throw new Error('Confira a solicitação antes de iniciar outra execução.');
  }
  return result;
}
let result = await call('${recipe.path}', body);
console.log('Operação registrada:', result.id ?? result.connectyhub?.request_id);
${recipe.poll?`// O acompanhamento não gera outra cobrança. Se demorar, guarde o ID e consulte depois.
for (let attempt = 0; result.id && ['preparing','processing','cancelling','settling'].includes(result.status) && attempt < 30; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  result = await call('${recipe.poll}' + result.id);
}
`:''}console.log(JSON.stringify(result, null, 2));
// ${recipe.result}`;
}
export function recipePython(recipe:AiRecipe) {
  return `# Python 3, biblioteca padrão. Execute no servidor.
import json, os, time, urllib.request, urllib.error
base = 'https://www.connectyhub.com.br/api/v1/ai'
key = os.environ['CONNECTYHUB_AI_API_KEY']
operation_id = os.environ['CONNECTYHUB_OPERATION_ID']
body = json.loads(r'''${JSON.stringify(recipe.body,null,2)}''')
def call(path, data=None):
    request = urllib.request.Request(base + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': operation_id},
        method='GET' if data is None else 'POST')
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        print('HTTP', error.code, 'request_id', error.headers.get('x-request-id'))
        print(error.read().decode())
        raise
result = call('${recipe.path}', body)
print('Operação registrada:', result.get('id', result.get('connectyhub', {}).get('request_id')))
${recipe.poll?`for attempt in range(30):
    if not result.get('id') or result.get('status') not in ['preparing','processing','cancelling','settling']:
        break
    time.sleep(2)
    result = call('${recipe.poll}' + result['id'])
`:''}print(json.dumps(result, ensure_ascii=False, indent=2))
# ${recipe.result}`;
}
export const aiCookbookPages:AiDocPage[]=aiRecipes.map(recipe=>({id:'ia-exemplo-'+recipe.id,label:recipe.name,group:'Tutoriais completos',title:recipe.name,description:recipe.notes,blocks:[
  {kind:'note',title:'Antes de executar',text:`Modelo necessário: ${recipe.family}. Confira available, capabilities e usable_with_key em GET /models. Configure CONNECTYHUB_AI_API_KEY e CONNECTYHUB_OPERATION_ID. A identidade deve ser nova para uma nova execução e preservada ao recuperar a mesma operação. IDs e textos de referência precisam ser substituídos pelos seus dados.`},
  {kind:'code',title:'cURL · Bash',language:'bash',code:`curl --fail-with-body 'https://www.connectyhub.com.br/api/v1/ai${recipe.path}' \\\n+  -H "Authorization: Bearer $CONNECTYHUB_AI_API_KEY" \\\n+  -H 'Content-Type: application/json' \\\n+  -H "Idempotency-Key: $CONNECTYHUB_OPERATION_ID" \\\n+  --data '${JSON.stringify(recipe.body,null,2)}'`.replace(/\n\+/g,'\n')},
  {kind:'code',title:'JavaScript · Node.js',language:'javascript',code:recipeJavascript(recipe)},
  {kind:'code',title:'Python',language:'python',code:recipePython(recipe)},
  {kind:'text',text:'Onde ler o resultado: '+recipe.result},
  {kind:'note',title:'Créditos',text:'Uma geração concluída informa o consumo em connectyhub.credits; recursos assíncronos usam result.connectyhub.credits. Consulte também GET /requests/{request_id}. Não some o valor da consulta ao valor da resposta: ambos descrevem a mesma operação. Cache tem armazenamento contínuo, apurado ao encerrar ou expirar.'},
] as AiDocBlock[]}));
