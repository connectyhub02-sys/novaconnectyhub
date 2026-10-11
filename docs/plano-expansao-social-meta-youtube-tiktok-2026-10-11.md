# Plano de implementação das integrações Meta YouTube e TikTok

Data: 11/10/2026. Status: execução da primeira etapa Meta iniciada após autorização do titular. Ordem definida: **1. Meta; 2. YouTube; 3. TikTok**. Mudanças externas e validações ficam no [registro da primeira entrega](meta-fase-1-conexao-2026-10-11.md). Este plano não autoriza gastos em anúncios nem comprova disponibilidade comercial.

O objetivo é transformar a ConnectyHub em uma central de conteúdo, relacionamento e aquisição: conectar contas, planejar e publicar conteúdo, acompanhar resultados, responder com os agentes da empresa e operar anúncios por IA/MCP. A própria ConnectyHub e as organizações clientes usarão os mesmos módulos, com dados, permissões e cobrança separados. A referência funcional interpretada para “Métrico” é o Metricool: calendário, editor por rede, publicação, caixa de entrada e análise. O desenho será próprio da ConnectyHub. [Referência de planejamento do Metricool](https://help.metricool.com/es/planning-z80uw).

## 1 Diagnóstico confirmado

### Aplicativo Meta

Leitura autenticada do Meta for Developers em 11/10/2026:

| Item | Estado observado | Consequência |
| --- | --- | --- |
| ConnectyHub Connect, app `1002348522666389` | Live / Published | Reaproveitar o app existente como primeira opção |
| Portfólio ConnectyHub, `293619797157346` | Business verification: Verified | Verificação empresarial concluída |
| Revisão de 17/08/2026 | `ads_read` e `pages_read_engagement` aprovadas; `pages_show_list`, `business_management` e `public_profile` renovadas | Existe histórico de aprovação, não uma aprovação irrestrita de todos os produtos |
| Permissões atuais | `ads_read`, `pages_read_engagement`, `pages_show_list` e `business_management`: Verification required | Resolver a pendência atual antes de liberar acesso amplo a clientes |
| Access Verification | Formulário de Tech Provider disponível para preenchimento | Não tratar a plataforma como habilitada para operar os ativos de qualquer empresa |
| Prazo da Access Verification | Tela exibe literalmente `10/12/2026` | Confirmar formato regional e tratar como prioridade; não converter automaticamente para outubro ou dezembro |
| `ads_management`, `pages_manage_ads`, `catalog_management` | Ready for testing | Implementar demonstrações, testar e obter as liberações necessárias |
| Marketing API Access Tier | Limited access | Dimensionar piloto e solicitar expansão conforme necessidade |
| Casos de uso cadastrados | Apenas criação/gestão de anúncios com Marketing API na lista consultada | Expandir para publicação, Instagram, Messenger e WhatsApp conforme a compatibilidade do app |

Referências autenticadas: [revisões](https://developers.facebook.com/apps/1002348522666389/app-review/), [permissões](https://developers.facebook.com/apps/1002348522666389/use_cases/customize/?use_case_enum=MARKETING_API_ADS_MANAGEMENT), [verificação do provedor](https://developers.facebook.com/293619797157346/access-verification/). A tabela registra a auditoria inicial. Na execução seguinte, a Access Verification foi submetida e ficou **In review**; oito casos de uso foram adicionados ao app, incluindo WhatsApp, Instagram, Messenger, Pages e Ads MCP. Isso não concede automaticamente acesso avançado aos dados de clientes.

### Base existente no projeto

| Componente | Evidência no código | Trabalho necessário |
| --- | --- | --- |
| Conexão Meta por OAuth | `src/lib/client-os/guided-oauth.ts` e rotas `integrations/meta/connect` e `callback` | Revisar permissões efetivamente concedidas, seleção de ativos e ciclo de tokens |
| Cofre por organização | Salvamento de credenciais de OAuth já existente | Ampliar para múltiplas conexões/ativos, mantendo isolamento e auditoria |
| Recepção e respostas sociais | `src/lib/meta/webhook.ts`, normalização, fila de agentes e dispatcher | Homologar com eventos reais, mídia, links, janelas e retomada humana |
| Publicação orgânica | `organic-publishing.ts`, políticas e job Inngest | Hoje os destinos implementados são feed/foto do Facebook e imagem do Instagram; ampliar formatos e comprovar entrega |
| Análise de tráfego | `src/lib/traffic/admin-traffic.ts` consulta Insights | Conferir métricas reais, paginação, permissões e atualização |
| Gestor de tráfego IA | `traffic-ai-operations.ts` e rota `traffic/execution` | Fluxo inspecionado prepara e atualiza rascunhos locais; isso não comprova execução de anúncios na Meta |
| Liberação para clientes | `src/lib/meta/launch-status.ts`: `metaFeatureLaunchPaused = true` | Substituir bloqueio geral por liberação por capacidade e organização após homologação |
| WhatsApp Cloud API | Não localizado adaptador operacional de Cloud API/Embedded Signup nas fontes inspecionadas | Tratar onboarding, envio, templates, recibos e cobrança como implementação nova |
| YouTube e TikTok | Sem adaptadores dedicados localizados; existe OAuth Google voltado a outros serviços | Criar integrações próprias e separar escopos |

A lista de permissões padrão no código é mais ampla que a aprovação observada. O callback grava `config.permissions` como scopes: revisar para registrar permissões realmente concedidas e disponíveis por ativo, em vez de presumir que solicitar equivale a receber. A descoberta inicial escolhe o primeiro ativo; o novo fluxo deve exigir seleção explícita quando houver alternativas. Revisar também validade, vínculo ao usuário e consumo único do OAuth state.

## 2 Escopo e experiência do cliente

O cliente verá **Conectar Meta**, **Conectar YouTube** e **Conectar TikTok**. Ele autoriza na plataforma oficial, seleciona os ativos e vincula agentes. Credenciais de aplicativo, segredo, configuração OAuth e permissões técnicas pertencem à operação da ConnectyHub. O cliente não entra no Developer e não copia tokens.

Verificação empresarial, propriedade de conta/número, autenticação e meio de pagamento continuarão sendo etapas oficiais quando exigidas. A interface explica o que falta e permite retomar a conexão sem começar do zero.

Proposta de navegação:

| Área | Recursos |
| --- | --- |
| Conexões | Contas, páginas, canais, números, permissões, reconexão e diagnóstico |
| Conteúdo | Calendário, biblioteca de mídia, criação com IA, editor por rede e aprovações |
| Atendimento | Visões WhatsApp ConnectyHub, WhatsApp Oficial, Instagram Direct, Messenger e Comentários |
| Anúncios | Contas de anúncios, campanhas, criativos, orçamento, resultados e Gestor IA |
| Campanhas de mensagens | Segmentos consentidos, templates oficiais, programação, entrega e custo |
| Resultados | Orgânico, anúncios, leads e vendas, com filtros por canal e agente |

O “Chat Meta” solicitado será uma visão de atendimento com identificação explícita do canal. Sua implementação compartilhará o motor de conversas e CRM com o atendimento atual. Anúncios terão painel próprio; a conversa originada por um anúncio aparecerá no chat com a origem/campanha quando o provedor fornecer essa informação. Cliques e impressões não são mensagens.

Decisão do titular em 11/10: **dois números no lançamento**. O número atual UAZAPI continua no atendimento dos agentes e follow-up; anúncios podem direcionar leads a ele. Para campanhas de disparo em massa, o cliente conecta um segundo número pela API oficial. Validar a separação no servidor, não apenas na interface. Criar anúncios no Facebook/Instagram não exige, por si só, um número WhatsApp novo. Coexistência oficial entre WhatsApp Business App e Cloud API existe em condições específicas, mas não comprova compatibilidade com UAZAPI no mesmo número e não será o fluxo inicial. [Mesmo número no app e na plataforma oficial](https://whatsappbusiness.com/resources/resource-library/organize-whatsapp-inbox-meta-business-suite/).

“Todos os recursos” será organizado em um catálogo versionado de capacidades: leitura, criação, atualização, exclusão, eventos, métricas e limites de cada produto. Cada capacidade terá API/versão, permissão, elegibilidade, status de implementação, teste real e restrições. A meta é cobertura ampla das APIs aplicáveis ao negócio, sem prometer funções exclusivas dos aplicativos nativos, de parceiros especiais ou indisponíveis à conta.

## 3 Arquitetura compartilhada

Preservar Next.js na VPS, Supabase, Inngest e R2. Upload de vídeo vai diretamente para armazenamento autorizado e é processado por workers com limites de CPU/memória; não bloquear o processo web com transcodificação.

Fluxo principal: painel ou agente/MCP → autorização da organização → serviço de domínio → fila durável → adaptador oficial → recibo externo → atualização de chat, calendário, métricas e cobrança.

Entidades propostas, ampliando as existentes quando possível:

- Conexões e ativos sociais: organização, provedor, conta, permissões concedidas, validade, proprietário e estado de saúde.
- Conteúdos e destinos: peça principal, variações por rede, mídias, autorizações, horário/fuso, versões, tentativa, ID externo e URL publicada.
- Conversas e identidades: canal, conta receptora, identidade externa, lead, agente, responsável humano, janela de atendimento e origem de campanha.
- Eventos e operações: caixa de entrada de webhooks, fila de saída, deduplicação, tentativas e resultado externo confirmado.
- Anúncios: conta, campanha, conjunto/grupo, anúncio, criativo, orçamento, alterações, atribuição e snapshots de métricas.
- WhatsApp oficial: WABA, número, template/versão/categoria, consentimento, campanha, destinatário, mensagem e recibos.
- Financeiro: tabela tarifária versionada, estimativa, reserva, custo do fornecedor, preço do cliente, liquidação, estorno e reconciliação.

Regras transversais: RLS e autorização no servidor; nunca usar credencial global como fallback de um cliente; validação de assinatura antes de processar webhook; consumo idempotente; backoff para limites; fila de falhas recuperável; reconciliação após timeout antes de repetir efeitos externos; observabilidade por organização/conta; revogação e exclusão de dados; testes com dois clientes independentes. Vincular identidades entre redes apenas com evidência e consentimento apropriados, nunca pelo nome ou avatar.

Os agentes mantêm identidade, catálogo, agenda, CRM e regras do cliente. Um adaptador por canal transforma a resposta em formatos suportados. Conteúdo de comentários e mensagens é dado externo: não pode instruir o agente a revelar credenciais, trocar de organização, alterar orçamento ou executar ferramentas administrativas.

## 4 Fase 1 Meta

### 1.0 Regularização e matriz de capacidades

Concluir o diagnóstico de Access Verification, escopo de Tech Provider, configuração de Login for Business, callbacks, domínios, exclusão de dados, webhooks, versão Graph e acesso aos ativos. Conferir no ambiente se o App ID efetivamente usado corresponde ao app auditado; credenciais podem vir de ambiente ou cofre. Fazer inventário por família: Marketing, Facebook Pages, Instagram, Messenger e WhatsApp Business Platform.

Preservar o app existente. Avaliar um app separado somente se a combinação de casos de uso não for aceita pela Meta. Preparar demonstração funcional, usuário de revisão e roteiro por permissão antes da submissão. A aprovação deve ser pedida por capacidade implementada, não apenas por uma lista extensa de scopes.

**Aceite:** matriz de permissões atuais/solicitadas, requisitos da verificação resolvidos ou explicitamente pendentes, ativos de teste definidos e nenhum recurso de cliente apresentado como disponível sem evidência.

### 1.1 Conexão guiada e fundação

Revisar o OAuth existente; selecionar páginas, Instagram e contas de anúncios; persistir consentimento e grants reais; permitir múltiplas contas; diagnosticar ativo inacessível, token vencido e acesso revogado. Solicitar permissões progressivamente por recurso.

Para Instagram, escolher conscientemente entre Facebook Login, que associa a conta profissional a uma Página, e Instagram Login, que pode dispensar essa associação. São famílias de scopes e capacidades diferentes; a segunda não substitui a conexão de anúncios. [Documentação oficial Meta no Postman](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login).

Substituir o bloqueio global por capacidades habilitadas por conta/organização. Implementar a base de fila de saída, recibos, auditoria e cancelamento compartilhada pelos próximos módulos.

**Aceite:** titular e uma organização piloto externa ao time do app conectam e selecionam seus próprios ativos; revogação interrompe operações; tentativa de usar ativo de outra empresa é recusada.

### 1.2 Calendário e publicação Facebook e Instagram

Evoluir o módulo orgânico existente para calendário mensal/semanal, arrastar para reagendar, upload de fotos/vídeos, biblioteca, capa, legenda, hashtags, links e variações por rede. IA cria plano editorial, pautas, roteiros, textos e sugestões de horário; geração de mídia usa provedores e cobrança já homologados ou uma entrega específica adicional.

Implementar em lotes: Facebook texto/link/foto e Instagram imagem; depois vídeos/Reels/carrosséis; depois Stories e demais formatos permitidos para cada conta. Validar proporção, duração, formato, tamanho e recursos de acessibilidade antes de agendar. A disponibilidade de publicação e Stories varia conforme a modalidade da API e o tipo de conta profissional. [Publicação e limites da API Instagram](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-ab559ffb-8e2c-4b0a-b43a-5737b6d2f672).

Cada destino terá estado próprio: rascunho, aguardando aprovação, agendado, processando, publicado, falhou, cancelado ou resultado incerto. Confirmar processamento e ID público; uma resposta de upload não significa publicação. Invalidar aprovação após alteração de conteúdo/destino. Agendamento usa o fuso da empresa e uma política explícita para jobs atrasados.

**Aceite:** publicação real de cada formato anunciado, horário conferido, reprocessamento sem duplicação, falha parcial entre redes recuperável e link de evidência disponível no calendário.

### 1.3 Comentários Instagram Direct e Messenger

Expandir casos de uso, webhooks e permissões para receber/listar/responder mensagens e comentários; moderação, menções, respostas privadas e anexos entram conforme suporte e elegibilidade. Revisar o dispatcher atual, que é limitado a texto e bloqueia links. Homologar endpoints e identidade remetente de cada modalidade Instagram; não presumir que Messenger e Instagram têm o mesmo contrato.

Integrar leads e agentes à caixa de entrada: resposta sugerida, aprovação opcional e modo automático configurado pelo cliente; atendimento humano pausa a IA; fila, responsável, etiquetas, histórico e avisos de falha. Não publicar informações privadas de um lead em resposta pública. Respeitar as janelas, a origem permitida da conversa e limites de respostas privadas; extensões destinadas a atendimento humano não autorizam automação irrestrita. Acesso a conversas de usuários externos exige a liberação correspondente. [Conversations API da Meta](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a).

**Aceite:** pessoa externa envia Direct/Messenger ou comentário; evento entra uma vez; agente correto responde no canal correto; tomada humana interrompe automação; expiração da janela impede envio indevido; resposta aparece no histórico e no aplicativo oficial.

### 1.4 WhatsApp oficial e atendimento

Implementar Embedded Signup dentro da ConnectyHub: seleção/criação de WABA, número, confirmação de propriedade, conexão ao app, assinatura de webhooks e diagnóstico de pagamento/qualidade. Usar o enquadramento de Tech Provider e as permissões `whatsapp_business_management`, `whatsapp_business_messaging` e outras efetivamente necessárias ao onboarding. [Cloud API oficial](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api), [Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup).

Criar adaptador próprio da Cloud API e visão **WhatsApp Oficial** no Atendimento, com mídia, templates, estados de entrega/leitura/falha, atendimento por agentes e encaminhamento humano. Reutilizar CRM, catálogo, agenda e histórico sem misturar números e canais. Mapear extensões: mensagens interativas, catálogos, Flows e chamadas, com elegibilidade e aprovação próprias; não bloquear o lançamento inicial por funcionalidades avançadas ainda não disponíveis à conta.

**Aceite:** número piloto conectado pelo fluxo guiado; mensagem de entrada e resposta real; template aprovado entregue; recibos persistidos; reconexão, remoção de acesso e separação entre clientes verificadas.

### 1.5 Campanhas de mensagens e cobrança

Implementar a regra comercial do titular no servidor: **campanha de disparo em massa só usa WhatsApp oficial**. Aplicar a regra no painel, API pública, MCP, importação e workers. Não permitir que um lote seja dividido em follow-ups para contornar a regra; não fazer fallback automático de campanha oficial para UAZAPI.

Preservar atendimento e follow-up inteligente do fluxo atual, com opt-out, frequência e preferências existentes. Isso preserva o comportamento do produto; não equivale a uma certificação da Meta sobre transporte não oficial.

Campanha terá segmento, origem de consentimento, template aprovado, prévia das variáveis/mídias, horário, orçamento máximo, lista de exclusão e estimativa por categoria/país. Respeitar limites reais do número, qualidade, template pausado/rejeitado e frequência; solicitar 10 mil mensagens não garante que possam ser entregues imediatamente.

A Meta declara cobrança por mensagem entregue, com tarifa por mercado/categoria e condições de gratuidade. Portanto, **R$ 0,32 é um exemplo do titular, não uma tarifa universal verificada**. A regra desejada de 2× fica pendente de enquadramento contratual que permita revenda, além da tarifa vigente; custos de IA continuam separados. [Preços oficiais](https://whatsappbusiness.com/products/platform-pricing/).

**Atualização após leitura autenticada dos termos em 11/10:** os Tech Provider Terms, atualizados em 31/07/2026, seção 5, restringem revenda, uso de linha de crédito para clientes e cobrança pelo uso da WhatsApp Business Platform. Não basta chamar o acréscimo por mensagem de “taxa de serviço”. A seção 9 prevê que acordo de parceria aplicável pode conceder direitos diferentes. O titular autorizou iniciar como Tech Provider independente com a margem por mensagem pendente de acordo compatível. Não habilitar a cobrança 2× nesse enquadramento. [Termos oficiais](https://www.facebook.com/legal/BM-tech-provider-terms).

Decidir o modelo de pagamento antes da venda:

| Modelo | Cobrança ao cliente | Implementação |
| --- | --- | --- |
| Tech Provider independente | Cliente paga o uso oficial diretamente à Meta; monetização dos demais produtos deve respeitar os termos | Sem acréscimo por mensagem habilitado; definir oferta de software/IA contratualmente compatível |
| Acordo que autorize revenda/cobrança consolidada | Hipótese: cliente paga R$ 0,64 à ConnectyHub, que assume R$ 0,32 do fornecedor | Exige direitos expressos, estrutura elegível própria ou parceiro, contrato e reconciliação; confirmar condições antes da venda |

Para a experiência de carteira única desejada, priorizar análise da segunda alternativa. Ser Tech Provider, isoladamente, não significa poder compartilhar uma linha de crédito: a Meta atribui isso a Solution Partners. O orçamento de anúncios também é separado da cobrança por mensagens e da assinatura. [Programa de parceiros](https://whatsappbusiness.com/partners/become-a-partner/).

Motor financeiro: calcular orçamento, reservar antes do envio, registrar tentativa e ID externo, liquidar quando houver evidência de entrega faturável, liberar falhas definitivas e reconciliar estados incertos. Webhook repetido ou fora de ordem não pode duplicar débito. Usar rate card/câmbio versionados, valores inteiros de alta precisão e ajustes auditáveis; não recalcular o histórico com a tarifa atual. Recibo de entrega sem informação suficiente sobre cobrança permanece pendente de conciliação. Mensagem gratuita na Meta não pode receber custo fictício do fornecedor; eventual taxa da plataforma precisa estar explícita.

Exemplo apenas ilustrativo, condicionado a contrato que permita esse modelo: 10.000 entregas faturáveis a R$ 0,64 = R$ 6.400 de venda e R$ 3.200 de custo a R$ 0,32. Com 9.500 entregas faturáveis, liquidar R$ 6.080 e liberar R$ 320 da reserva de R$ 6.400, conforme política informada. Os 2× representam 100% de acréscimo sobre custo e 50% de margem bruta antes de IA, parceiro, impostos e operação.

**Aceite:** campanha piloto consentida e pequena; bloqueio de campanha em UAZAPI demonstrado; reserva/liquidação/estorno corretos; reentrega de webhook sem novo débito; conciliação com evidência do fornecedor. Simular volume para carga, sem disparar 10 mil mensagens reais como teste.

### 1.6 Meta Ads análise criação e execução

Expandir a aprovação de `ads_management` e demais permissões justificadas. Começar pela leitura de contas, campanhas, conjuntos, anúncios e Insights; comparar resultados com Ads Manager usando mesmos intervalos, moeda e janela de atribuição. Evoluir para criação de criativos, campanhas, conjuntos e anúncios inicialmente pausados, atualização, duplicação e pausa/retomada.

Gestor IA propõe objetivo, público, criativos, orçamento e calendário; cliente vê a prévia e autoriza ativação e limites. Automações recorrentes operam dentro de um mandato explícito: contas, ações, orçamento e duração. Medir gasto acumulado, manter margem de segurança e permitir parada imediata; pausa é assíncrona e não recupera gasto já ocorrido. Cobertura de públicos, remarketing e categorias especiais segue as regras aplicáveis ao anunciante e à API.

Integrar Lead Ads ao CRM, Pixel/Conversions API com deduplicação e consentimento, UTMs e conversões reais de agenda/venda. Relatórios distinguem atribuição do provedor e atribuição interna; não somar alcance entre redes como pessoas únicas. Acrescentar catálogos/anúncios dinâmicos e recursos adicionais pelo catálogo de capacidades.

**Aceite:** campanha criada pausada, conferida no Ads Manager, ativada com verba de teste definida, medida e pausada; alteração auditada e limite observado; lead de teste chega ao cliente correto; nenhuma operação de outro cliente é acessível.

### 1.7 MCP dos agentes

Expor serviços de domínio da ConnectyHub como ferramentas de MCP autenticadas e isoladas por organização. Exemplos: listar conexões, consultar métricas, criar rascunho, agendar publicação, preparar campanha, estimar custo, ativar versão aprovada, pausar campanha e responder uma conversa elegível.

Separar ferramentas de consulta, preparação e execução. O servidor resolve conta/permissões, valida conteúdo e orçamento e confere a versão aprovada; o modelo não recebe tokens nem escolhe uma organização arbitrária. Mudança relevante invalida a aprovação anterior. Painel, API e MCP usam as mesmas políticas, filas e ledger.

O **Meta Social Technologies MCP** oficial, observado no portal e documentado pela Meta, é útil para manutenção de apps, webhooks, revisão e diagnóstico. Ele não é prova de uma interface pronta que execute todas as campanhas dos clientes. Avaliar sua cobertura em conjunto com a Marketing API; o MCP de produto da ConnectyHub continua responsável por autorização, orçamento e contexto do cliente. [Repositório oficial da Meta](https://github.com/facebook/agentic-tools/blob/main/README.md).

Na execução de 11/10 também foi encontrado e adicionado o caso de uso **Create & manage ads with ads MCP server**, especificamente voltado a agentes operarem anúncios. Avaliar esse servidor oficial separadamente do MCP de ferramentas de desenvolvedor, sem duplicar execução nem ignorar os controles internos de orçamento/organização. Adição do caso de uso não é prova de habilitação do servidor para clientes. [Ads MCP oficial](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview/).

**Aceite:** agente consulta dados e prepara operação; ferramenta recusa execução sem permissão/mandato, alteração de payload aprovado, orçamento excedido e acesso cruzado; efeito confirmado no provedor com trilha de auditoria.

### 1.8 Piloto e expansão do catálogo Meta

Liberar por organização e capacidade, começando pela ConnectyHub e um cliente piloto externo ao app. Completar checklist real por superfície e definir limites por plano. Revisar família por família: Pages, Instagram, Messenger, WhatsApp, Marketing/Insights, Lead Ads, conversões, catálogos e ativos de negócios. Threads e demais produtos adicionais podem entrar como extensões da fase Meta se incluídos no catálogo e elegíveis; não presumir que compartilhem scopes ou publicação.

**Saída da fase Meta:** módulos contratados funcionando para cliente externo, reconexão validada, custos conciliados, resposta humana/IA testada, documentação de suporte e desligamento por capacidade. Recursos restritos ficam visivelmente classificados, sem bloquear os já homologados.

## 5 Fase 2 YouTube e anúncios no ecossistema Google

### 2.1 Conexão e requisitos

Criar conexão YouTube separada da conexão Google de tráfego. OAuth incremental, seleção de canal, suporte ao contexto de conta de marca quando aplicável, renovação/revogação e verificação do projeto/consentimento. Validar quotas, políticas de dados e requisitos de auditoria vigentes no projeto.

O código atual exige Developer Token no OAuth Google. A documentação atual de migração informa transferência do acesso Google Ads para projetos Google Cloud e fim dessa exigência em setembro de 2026, enquanto guias antigos ainda a mencionam. Auditar a configuração real e atualizar o conector com base na versão/fluxo vigente. Não replicar a exigência antiga no onboarding de YouTube. [Migração de acesso Google Ads](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).

### 2.2 Vídeos Shorts e calendário

Reutilizar biblioteca, editor, fila e calendário: upload retomável, título, descrição, miniatura quando suportada, playlist, idioma, público infantil e declaração de mídia sintética quando aplicável. Upload de Shorts usa o fluxo de vídeo e requisitos da plataforma; não prometer que marcar uma opção garanta sua classificação.

Programar com `status.publishAt` quando elegível, mantendo o vídeo privado até a publicação. Confirmar processamento, restrições e visibilidade efetiva. A referência de `videos.insert` consultada já não impõe a antiga restrição geral de upload privado por projeto não verificado; validar o projeto real em vez de copiar regras antigas. [Upload](https://developers.google.com/youtube/v3/docs/videos/insert), [agendamento](https://developers.google.com/youtube/v3/docs/videos).

### 2.3 Comentários e análise

Listar threads e respostas, responder e moderar conforme autorização. Reutilizar políticas do agente e a visão Comentários. Planejar sincronização de comentários por polling com orçamento de quota; não presumir webhook universal para cada comentário. Analisar alcance disponível, visualizações, retenção, tempo assistido e crescimento com Data API e Analytics/Reporting autorizados; indicar dados ainda indisponíveis. [Comentários](https://developers.google.com/youtube/v3/docs/comments/insert), [Analytics e Reporting](https://developers.google.com/youtube/analytics).

Não oferecer Direct de YouTube como equivalente ao Direct Instagram sem API oficialmente disponível para isso. Community, lives, monetização e recursos de parceiros recebem avaliação própria de capacidade.

### 2.4 Tráfego pago e MCP

YouTube Data API publica conteúdo; Google Ads API opera publicidade. Implementar análise de anúncios e os tipos de campanha suportados para criação, incluindo Demand Gen quando atender ao objetivo. A documentação consultada restringe criação/mutação de campanhas do tipo VIDEO, com exceções específicas por versão; não prometer paridade com todo o Google Ads. Reutilizar o MCP, orçamento, aprovação e auditoria da fase Meta. [Limites e alternativas oficiais](https://developers.google.com/google-ads/api/docs/video/overview).

**Saída da fase:** canal externo conectado, upload/agendamento real, comentário respondido, métricas conferidas, revogação funcional e piloto de publicidade no tipo suportado com orçamento autorizado.

## 6 Fase 3 TikTok

### 3.1 Aplicativo e acessos

Configurar Login Kit, Content Posting API e escopos efetivos; verificar domínio de mídia e separar o acesso TikTok for Developers do TikTok API for Business. Preparar revisão e auditoria com a experiência real da ConnectyHub, destinada a vários clientes. Direct Post não auditado possui restrições de usuários/visibilidade; não equivale a liberação comercial ampla. [Início do Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started).

### 3.2 Publicação e calendário

Integrar vídeos e fotos conforme suporte: consultar informação atual do criador, validar limites, permitir seleção de privacidade/interações e informar conteúdo comercial. Armazenar consentimento para o conteúdo/destino agendado e revalidar elegibilidade na execução. A automação respeita a experiência exigida na auditoria; não será um publicador sem consentimento do criador. O modo Upload to TikTok é fallback com finalização no aplicativo, identificado como pendente de ação humana. [Regras de experiência](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [fluxo de upload](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content).

Usar status de publicação e webhooks disponíveis para distinguir transferência, processamento, moderação e publicação efetiva. O horário da fila não garante término instantâneo da moderação. [Estados oficiais](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status).

### 3.3 Comentários mensagens e métricas

Implementar métricas permitidas pelas APIs aprovadas. Avaliar Organic API para comentários/moderação e Business Messaging API para Direct, conforme acesso comercial, conta e região. Content Posting API não concede automaticamente esses recursos. Não usar Research API como substituto para operar contas comerciais, nem scraping para suprir ausência de permissão. O hub oficial confirma a existência de Business Messaging, mas a elegibilidade da ConnectyHub ainda precisa ser obtida. [Business Messaging API](https://business-api.tiktok.com/portal/bm-api/education-hub).

### 3.4 Anúncios e MCP

Obter acesso ao TikTok API for Business, conectar anunciantes e implementar leitura de resultados antes da criação/alteração. Mapear campanhas, grupos, criativos, Spark Ads quando elegível e atribuição. Aplicar os mesmos controles de custo, aprovação, ferramentas e isolamento. A documentação distingue a API de conteúdo das APIs comerciais de anúncios. [FAQ oficial](https://developers.tiktok.com/docs/en/getting-started-faq).

**Saída da fase:** cliente externo publica após auditoria aplicável, vê status e métricas, reconecta sem perder programação; atendimento e anúncios são liberados apenas nas contas e capacidades homologadas.

## 7 Ordem de execução e responsáveis

Manter três fases de produto. Dentro da Meta, começar imediatamente por 1.0 e 1.1; entregar calendário/publicação (1.2), atendimento (1.3), WhatsApp oficial e cobrança (1.4–1.5), execução de anúncios (1.6), MCP (1.7) e expansão (1.8). A base do MCP e as leituras de anúncios podem evoluir junto dos serviços que expõem, sem antecipar execução paga. Revisões externas devem ser preparadas cedo porque ficam fora do controle da engenharia.

| Frente | Responsável necessário | Entrega |
| --- | --- | --- |
| Contas e aprovações | Titular/admin do negócio e responsável pelas integrações | Dados empresariais, demonstrações e acesso externo aprovado |
| Backend | Engenharia | Adaptadores, webhooks, filas, identidade, financeiro e MCP |
| Painel e experiência | Produto/frontend | Conexão guiada, calendário, chat, anúncios e explicação dos custos |
| Homologação | QA e titular de contas piloto | Evidência real por canal, tenant e recurso |
| Operação e cobrança | Operação/financeiro | Rate cards, modelo de pagamento, reconciliação e suporte |

Não fixar uma data final antes de concluir 1.0/1.1 e medir a primeira entrega vertical. Estimar cada lote separando engenharia, validação do piloto e espera externa; aprovações não têm prazo garantido pela ConnectyHub. O primeiro marco de valor é **cliente conecta seus ativos sem credenciais e agenda uma publicação que aparece no perfil correto**.

## 8 Critérios de publicação e pendências

Cada lote exige testes relevantes de contrato e autorização, verificação de efeitos reais controlados, build, migrations ensaiadas quando necessárias, publicação da candidata na VPS e liberação por capacidade. Preservar versão anterior e interromper filas do recurso com falha; rollback de código não desfaz posts, mensagens ou verba já consumida. Confirmar operação no provedor, não apenas HTTP 200 ou job Inngest concluído.

Pendências para iniciar execução: confirmar o formato/prazo da Access Verification; concluir o enquadramento Tech Provider; conferir App ID/configuração efetiva; definir conta e número de teste; escolher cobrança consolidada versus direta; aprovar a tabela comercial separando transporte, IA e assinatura; confirmar a referência Metricool e nomenclatura do atendimento durante o desenho de interface. As decisões comerciais não impedem a auditoria e a implementação da conexão/publicação.

Este diagnóstico não comprova tokens válidos em produção, assinatura de webhooks ativa, permissões de clientes externos ou uma postagem/mensagem/anúncio real. Esses itens são critérios explícitos dos pilotos. O trabalho desta etapa se limita ao plano e à leitura do código e do portal Meta.
