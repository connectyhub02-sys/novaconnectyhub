import type {AiDocPage,AiDocBlock} from './documentation';
const code=(title:string,value:unknown):AiDocBlock=>({kind:'code',title,language:'json',code:JSON.stringify(value,null,2)});
const text=(text:string):AiDocBlock=>({kind:'text',text});
export const resourceAiDocPages:AiDocPage[]=[
  {id:'ia-midia',label:'Imagem e voz',group:'Recursos',title:'Gerar imagens e voz',description:'Escolha uma chave com um modelo da família correspondente.',method:'POST',path:'/models/{model}:generateContent',blocks:[
    code('Imagem',{contents:[{parts:[{text:'Crie uma foto de um tênis azul em um estúdio.'}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}}}),
    code('Voz',{contents:[{parts:[{text:'Diga com entusiasmo: seu pedido chegou!'}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}}}),
    text('O resultado contém inlineData com mimeType e data em base64. Salve conforme o tipo retornado; áudio PCM precisa ser reproduzido ou encapsulado com sua frequência e canais. Imagens, voz e processamento usam créditos conforme o modelo e a mídia produzida.'),
  ]},
  {id:'ia-interactions',label:'Interações e ferramentas',group:'Recursos',method:'POST',path:'/interactions',title:'Interações, pesquisa, mapas e uso de computador',description:'Execute ferramentas, mantenha continuidade e consulte tarefas em segundo plano.',blocks:[
    code('Pesquisa e mapas',{input:'Encontre cafés abertos perto desta localização.',tools:[{type:'maps',latitude:-23.55,longitude:-46.63}]}),
    code('Busca na web',{input:'Pesquise os anúncios mais recentes deste setor e cite as fontes.',tools:[{type:'web_search'}]}),
    code('Uso de computador',{input:'Localize o botão de confirmar nesta captura.',tools:[{type:'computer_use',environment:'browser'}]}),
    text('Guarde id e consulte GET /interactions/{id}. Em completed, leia result.steps e result.connectyhub. Em requires_action, execute a função no seu sistema e crie outra interação com previous_interaction_id e o resultado. Uma continuação é uma nova execução cobrada.'),
    text('Cada consulta efetivamente executada por pesquisa ou mapas entra no consumo. Preserve citações, links e atribuições retornadas pelas fontes. Ferramentas externas e MCP podem ter cobranças próprias fora da ConnectyHub.'),
  ]},
  {id:'ia-video',label:'Vídeos',group:'Recursos',method:'POST',path:'/videos',title:'Vídeos e extensão de cenas',description:'Use uma chave da família Video. Modelos Omni usam /interactions.',blocks:[
    code('Criar vídeo',{prompt:'Um café sendo servido, em câmera lenta.',duration_seconds:8,resolution:'720p',aspect_ratio:'16:9'}),
    text('Consulte GET /videos/{id}. Quando concluído, baixe result.videos[0].url com a mesma autenticação. O processamento usa créditos conforme a duração e a resolução. A disponibilidade de 4k depende do modelo. Imagem inicial, imagem final e referências são opcionais conforme suporte.'),
    code('Vídeo com modelo Omni',{input:'Um passeio por uma cidade futurista.',response_format:{type:'video',aspect_ratio:'16:9',resolution:'720p'}}),
  ]},
  {id:'ia-musica',label:'Música e transcrição',group:'Recursos',method:'POST',path:'/interactions',title:'Música, transcrição e mídia em interações',description:'A chave determina a especialidade da geração.',blocks:[
    code('Música',{input:'Uma música instrumental brasileira suave, com violão e piano.'}),
    text('Com uma chave Music, a saída de áudio aparece em result.steps. O consumo considera as músicas produzidas. Com uma chave de transcrição, envie conteúdo audio em input, usando data em base64 ou uri de um arquivo deste projeto. A transcrição e a mídia produzida são cobradas conforme o modelo.'),
  ]},
  {id:'ia-batches',label:'Lotes',group:'Recursos',method:'POST',path:'/batches',title:'Processamento em lote',description:'Até 100 solicitações por lote, com conferência individual do consumo.',blocks:[
    code('Criar lote',{display_name:'Descrições de produtos',requests:[{key:'produto-1',request:{contents:[{parts:[{text:'Descreva um tênis azul.'}]}]}},{key:'produto-2',request:{contents:[{parts:[{text:'Descreva uma camisa branca.'}]}]}}]}),
    text('Consulte GET /batches/{id}; os resultados preservam key. POST /batches/{id}/cancel solicita cancelamento. Com uma chave Embedding, use request.input ou request.content em cada item para produzir vetores. Itens processados continuam cobrados mesmo quando outros itens falham ou são cancelados. A tarifa de lote é separada da geração imediata.'),
  ]},
  {id:'ia-caches',label:'Cache de contexto',group:'Recursos',method:'POST',path:'/caches',title:'Reutilizar contexto',description:'Armazene um contexto extenso por um período definido e reutilize-o nas gerações.',blocks:[
    code('Criar cache',{display_name:'Manual do produto',ttl_seconds:3600,contents:[{role:'user',parts:[{text:'Cole aqui o manual completo.'}]}]}),
    code('Usar cache na geração',{cachedContent:'caches/00000000-0000-4000-8000-000000000001',contents:[{parts:[{text:'Resuma a garantia.'}]}]}),
    text('O modelo pode exigir um conteúdo mínimo para criar cache. O armazenamento usa créditos pelo tamanho e tempo ativo; leituras usam a tarifa de contexto reutilizado. PATCH /caches/{id} com ttl_seconds altera a validade e ajusta a reserva. DELETE /caches/{id} encerra o armazenamento antecipadamente e confere o período utilizado. O cache pertence ao projeto e ao modelo que o criou.'),
  ]},
  {id:'ia-search-files',label:'Pesquisa em arquivos',group:'Recursos',method:'POST',path:'/documents',title:'Coleções e pesquisa em arquivos',description:'Organize documentos do projeto e use sua base de conhecimento nas respostas.',blocks:[
    code('1. Criar coleção em POST /stores',{display_name:'Base de conhecimento'}),
    code('2. Indexar arquivo enviado por /files',{store:'00000000-0000-4000-8000-000000000001',file:'00000000-0000-4000-8000-000000000002'}),
    code('3. Consultar em POST /interactions',{input:'Qual é a política de garantia?',tools:[{type:'file_search',stores:['00000000-0000-4000-8000-000000000001']}]}),
    text('Aguarde a indexação antes de pesquisar. A indexação considera o conteúdo processado na importação; a geração considera a consulta e o contexto recuperado. Criar, listar e remover coleções não inicia uma geração adicional. Chaves de outros projetos não acessam seus arquivos.'),
  ]},
  {id:'ia-managed',label:'Agentes e ambientes',group:'Recursos',method:'POST',path:'/agents',title:'Agentes especializados e ambientes',description:'Configure instruções e ferramentas; cada execução usa a carteira do projeto.',blocks:[
    code('Criar agente',{display_name:'Analista de relatórios',system_instruction:'Analise os arquivos e explique suas conclusões.',tools:[{type:'code_execution'},{type:'web_search'}]}),
    code('Executar em POST /interactions',{agent_id:'00000000-0000-4000-8000-000000000001',input:'Prepare um relatório sobre este assunto.'}),
    text('O agente utiliza o modelo da chave. Ambientes podem ser criados em POST /environments com fontes inline e regras de rede. Use environment_id para reutilizar um ambiente do projeto. Consulte os arquivos em GET /environments/{id}/files?path=workspace; acrescente download=true para baixar um arquivo. A inferência e as ferramentas de cada etapa entram no consumo; configurar um recurso não inicia a execução.'),
    text('Modelos de pesquisa especializada também usam /interactions. Confira available no catálogo: acesso operacional e configuração de preço são necessários antes da execução.'),
  ]},
  {id:'ia-live',label:'Tempo real',group:'Recursos',method:'POST',path:'/live',title:'Conversa em tempo real',description:'Sessão WebSocket com modelo da chave e consumo acompanhado pela carteira.',blocks:[
    code('Criar sessão',{config:{generationConfig:{responseModalities:['AUDIO']}}}),
    text('Conecte ao url retornado e envie {id, access_key} como primeira mensagem. Esse acesso é descartável e expira em 60 segundos. Aguarde setupComplete antes de enviar clientContent, realtimeInput ou toolResponse. Configurações, transcrição e tradução dependem do modelo.'),
    text('A sessão reserva créditos e acompanha o conteúdo processado. Quando não houver saldo para continuar, a conexão é encerrada. Consulte /requests/{id} para conferir a conclusão. Quedas com consumo ainda não confirmado mantêm a operação em conferência.'),
    text('Para música em tempo real, use uma chave compatível e envie clientContent, musicGenerationConfig e playbackControl. A ativação do serviço de tempo real e a tarifa do modelo são verificadas no catálogo.'),
  ]},
];
