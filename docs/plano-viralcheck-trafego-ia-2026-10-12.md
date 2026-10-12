# Plano de integração do Viral Check e campanhas com IA

Planejamento de 12/10/2026 para transformar análise de conteúdo, publicação e tráfego pago em uma jornada simples na ConnectyHub. A IA prepara e recomenda; o cliente confere o criativo, entende a proposta e aprova antes da execução. Meta primeiro, Google Ads na sequência, reutilizando a mesma experiência.

> Atualização do titular em 12/10: criação, melhoria e análise de roteiros foram retiradas da pauta. Os registros abaixo sobre o produto de origem são históricos; não autorizam trazer esses recursos para o painel. Foco em criativos reais e campanhas Meta.

## Decisões do produto

- Todos os recursos desta expansão devem estar disponíveis para todas as organizações e todos os planos. A segmentação comercial será decidida depois de os recursos funcionarem e das aprovações solicitadas à Meta. Não criar novos bloqueios Start, Pro ou Scale durante esta expansão.
- Admin e cliente usam o mesmo produto. Ativos, arquivos, histórico, aprovações, consumo e resultados pertencem à empresa selecionada. O admin não deve ser o único ambiente homologado.
- Todos os planos não significa acesso a dados de outras empresas, remoção de papéis da equipe, consumo gratuito ou operação sem as permissões oficiais. Créditos, conta válida e autorizações continuam sendo necessários.
- A tela principal apresenta o próximo passo, a prévia e um resumo. Configurações avançadas e relatórios extensos ficam recolhidos. Não criar um menu para cada capacidade da IA.
- Dois modos na mesma jornada: **A IA prepara** e **Eu oriento a IA**. Nos dois, o cliente aprova. Nenhum modo pressupõe autorização ilimitada de gastos ou mudanças de orçamento.
- A instrução mais recente é planejar antes de continuar a implementação. Não publicar os rascunhos locais enquanto esta etapa de planejamento estiver em andamento.

## Estado de partida

A entrega publicada registrada em `b4bc49e1` contém análise real de imagem/vídeo, score editorial com evidências, melhorias, legendas, roteiro/fala, histórico por organização, exportação Markdown, preparação de rascunho orgânico e proposta de campanha CBO/ABO. Ainda não cria nem ativa anúncios a partir dessa proposta.

Antes da pausa para planejamento, foram iniciados rascunhos locais de acesso em todos os planos, interface simplificada, prévia de mídia e aprovação de proposta. Não foram publicados. A migration local `0196_meta_creative_approval.sql` não foi aplicada. Os 36 testes dirigidos dessa rodada não substituem revisão completa, build, migração, homologação com cliente comum ou implantação. A produção ainda não deve ser descrita como liberada para todos os planos por causa desses arquivos locais.

Publicações e Calendário já têm implementação e testes reais isolados de imagem, carrossel, Reel, Story e agendamento. A análise criativa e as propostas não dependem de aprovação Meta para gerar texto; operações externas precisam dos acessos correspondentes. O pedido principal estava em análise na última conferência; as duas permissões de publicação ainda aguardavam contabilização. Este plano não altera os pedidos em revisão.

## Inventário do Viral Check

Classificação baseada nos módulos do checkout `C:/Users/conne/Documents/ViralCheck`: presença de código não comprova que o serviço está operacional hoje. A revisão abrangeu rotas, ações, componentes de produto, processamento, armazenamento, notificações, CRM, administração e migrations. O projeto de origem não foi alterado.

| Capacidade encontrada | Evidência no projeto de origem | Destino na ConnectyHub |
| --- | --- | --- |
| Upload com prévia e player | `components/dashboard/AnalysisForm.tsx` | Reaproveitar a experiência de conferir a mídia antes de analisar; ampliar para imagem, vídeo e carrossel |
| Upload direto e progresso | `app/api/upload/route.ts`, `lib/upload-limits.ts` | Adaptar à biblioteca por empresa, validação real do arquivo e limites operacionais; não copiar os limites antigos automaticamente |
| Análise multimodal real | `inngest/functions/analyzeVideo.ts` | Núcleo já adaptado; ampliar evidências visuais, áudio disponível, timestamps e múltiplas mídias |
| Processamento em segundo plano | `actions/analyze.ts`, função Inngest | Permitir sair da tela e voltar ao resultado; estados persistentes e recuperação sem cobrança duplicada |
| Score e recomendações | `AnalysisResultView.tsx`, prompts do pipeline | Exibir nota de qualidade, justificativas e até três prioridades; não apresentar a nota como chance de venda ou viralização |
| Sugestões por rede | `platform_scores` e `social_optimization` | Adaptar linguagem, títulos, legendas, hashtags e formato por rede; separar sugestão editorial de métrica observada |
| Roteiros curtos, longos e melhoria de texto | Modos `generate_script_short`, `generate_script_long`, `improve_script` | Excluído por decisão do titular |
| Cenas e fala separadas | `script_content`, `script_dialogue` no pipeline | Excluído por decisão do titular |
| Histórico pesquisável e detalhes | `HistoryList.tsx`, rotas de histórico e análise | Biblioteca única de criativos, análises e versões, sem o limite funcional de apenas 40 itens recentes |
| Evolução de notas | `EvolutionChart.tsx`, `PerformanceChart.tsx` | Comparação editorial entre versões; esses gráficos não são alcance, receita ou ROAS |
| Relação entre análises e referências | `parentAnalysisId`, `sourceType` em `actions/analyze.ts` | Base para “original → versão melhorada”; relacionamento existente não equivale a comparador completo pronto |
| Radar por nicho, país e fonte | `actions/trends.ts`, `dashboard/trends`, `TrendHistoryView.tsx` | Pesquisa com fontes e data, ideias acionáveis e histórico por empresa |
| Inspirações e temas recorrentes | `actions/discovery.ts`, `RelatedInspirations.tsx`, `TrendingTopics.tsx` | Reescrever com fontes públicas ou material autorizado da própria empresa; não transportar a consulta global de análises |
| Avisos de resultado pronto | Pipeline, `lib/notifications/whatsapp-notifications.ts`, templates de e-mail | Usar a central de notificações ConnectyHub, com preferências, destinatário confirmado e deduplicação |
| Primeira análise na página pública | `HomeAnalysisUpload.tsx`, `api/landing-analysis` | Possível aquisição de clientes e geração de leads em fase posterior, ligada ao CRM existente |
| CRM do funil da primeira análise | Migrations de landing leads, `admin-landing-leads.ts` | Reaproveitar etapas, prioridade, próxima ação e vínculo com relatório; não criar um segundo CRM |
| Prompts, modelos e diagnóstico administrativo | `admin/prompt`, `admin/settings`, ações administrativas | Configuração central versionada, teste interno e custo por operação; nenhuma chave no painel do cliente |
| Indicadores administrativos | `admin-analytics.ts` e componentes de analytics | Volume, falhas, fila, custo e notificações no admin; indicadores de cada empresa no respectivo painel |
| Agentes, memória, qualificação e atendimento | `lib/whatsapp/agent-settings.ts`, webhook ConnectyHub | Reutilizar o que já existe na ConnectyHub; integrar contexto do criativo/campanha ao lead, sem duplicar agentes |
| Cadastro, perfil, pagamentos, créditos e e-mails | Auth, payment, profiles, templates e migrations | Manter a infraestrutura ConnectyHub. Não migrar usuários, credenciais, carteiras nem cobrança do Viral Check |

### Partes que precisam ser substituídas

`actions/generate-analysis.ts` devolve uma nota demonstrativa fixa; não pode ser usado como análise real. `actions/discovery.ts` consulta análises com cliente administrativo sem escopo de empresa e contém respostas de tendência por fallback; não serve como base comercial isolada. `AnalysisProgress.tsx` avança por tempo, não pelo trabalho realmente concluído. O radar grava uma nota placeholder, que não deve entrar em gráficos de qualidade. O caminho legado de link YouTube fornece o link como texto ao modelo; isso não comprova que o vídeo foi assistido. A imagem representativa de `VideoThumb` no relatório não substitui a prévia real do arquivo.

Esses pontos não descartam o produto: determinam quais ideias e componentes serão adaptados e quais implementações serão reescritas.

## Jornada que o cliente verá

**Conectar → Enviar criativo → Conferir proposta e prévia → Aprovar → Acompanhar.**

1. **Conectar conta:** um botão Meta ou Google. A plataforma identifica os ativos autorizados e sugere uma combinação compatível. Havendo mais de uma empresa/conta, mostra nomes e pede a escolha mínima necessária. Nunca escolhe silenciosamente ativos de empresas diferentes.
2. **Enviar criativo:** arrastar imagem/vídeo ou escolher a biblioteca. A prévia aparece imediatamente e permanece vinculada à versão salva. Carrossel permite ordenar e conferir cada cartão.
3. **Escolher ajuda:** no modo IA, informar objetivo em linguagem comum e verba; contexto da empresa, catálogo e página podem preencher sugestões. No modo orientado, escrever instruções e abrir ajustes opcionais de estrutura e público.
4. **Revisar:** um cartão com nota editorial, três melhorias prioritárias, objetivo, destino, público resumido, locais propostos de exibição, período e verba. Botões “Ajustar” e “Aprovar”. Diagnóstico completo, critérios e detalhes dos anúncios ficam recolhidos.
5. **Acompanhar:** mostrar gasto, resultado do objetivo, custo por resultado e próximo passo. Avisos optativos pelo WhatsApp e histórico de alterações. Sem dados suficientes, informar isso em vez de inventar resultado.

A aprovação precisa identificar a versão exata de mídia, texto, conta, posicionamentos e verba. Alterar qualquer parte relevante invalida a aprovação anterior. “Aprovar proposta” e “Autorizar veiculação” são estados distintos no sistema; a experiência final pode reuni-los em uma única confirmação clara quando todos os requisitos estiverem resolvidos. Não aprovar uma prévia e executar outra versão.

### Conexão e medição sem jargão

O cliente não precisa aprender Pixel, CAPI ou IDs. Nas lojas e páginas hospedadas pela ConnectyHub, o sistema deve configurar e validar a medição autorizada por trás do fluxo. Ativos existentes compatíveis são priorizados. Criação de novos ativos exige verificar suporte, acesso e necessidade, sem duplicar Pixels a cada reconexão.

Sites externos exigem um mecanismo de instalação autorizado ou uma orientação curta; login social sozinho não instala código em um site externo. Permissões recusadas, verificação empresarial, seleção entre várias contas e cobrança do provedor podem exigir intervenção. A interface mostra somente a ação necessária, sem prometer conexão universal em um clique.

## Sequência de implementação

### Etapa 1 Acesso comum e jornada de revisão

**Entrega:** acesso sem divisão comercial por plano, experiência admin/cliente compartilhada, modos IA e orientado, prévia real, resumo curto e aprovação vinculada à versão. Revisar os rascunhos locais antes de aproveitá-los. Conferir menu, página, endpoint e worker, além de mensagens antigas de upgrade; não basta liberar o card.

**Aceite:** usuários comuns de Start, Pro, Scale e teste válido acessam o mesmo recurso. Empresa A não consulta arquivos ou resultados de B. Troca de arquivo atualiza o player e o relatório não muda de criativo silenciosamente. Alteração relevante exige nova revisão. Testar desktop, celular, arquivo inválido e falha no upload. Nenhuma campanha externa criada.

### Etapa 2 Estúdio criativo completo

**Entrega:** consolidar o que veio do Viral Check: imagem, vídeo com áudio disponível, carrossel; evidências, legendas por rede e sugestões concretas. Acrescentar versões, busca e comparação lado a lado. Nota editorial permanece separada dos resultados publicitários.

**Base técnica:** fila em segundo plano com estados reais; reserva e liquidação de créditos, limite operacional comum, uso do modelo registrado, consulta de resultado e recuperação assistida de chamadas incertas. Nada de reenviar automaticamente uma geração que pode ter sido cobrada.

**Aceite:** usuário sai e retorna sem perder execução; vídeo com e sem áudio; imagem e carrossel com diagnóstico correspondente; concorrência de consumo sem saldo negativo ou débito duplicado; versões comparáveis com critério/modelo identificados. Preview, resumo e ação principal cabem na primeira leitura; o relatório longo é opcional.

### Etapa 3 Conexão guiada e preparação da campanha Meta

**Entrega:** resolver conta, Página, Instagram, Pixel/Dataset, destino e eventos de conversão a partir das permissões concedidas. Reutilizar Pixel/CAPI já implementados. Validar mídia, objetivo, moeda, público, posicionamentos e orçamento. Mostrar onde cada criativo poderá rodar; diferenças de formato e cortes precisam aparecer antes da aprovação.

**Prévia:** usar prévia oficial quando o formato/API oferecer suporte e validar esse suporte durante a implementação. Uma simulação local deve estar identificada e não representar posicionamento ainda não validado como confirmado. Não tratar formatos orgânicos como automaticamente elegíveis para anúncio.

**Aceite:** reconectar sem duplicar ativos, revogar acesso sem vazar dados, escolher corretamente entre múltiplas empresas e detectar medição ausente. Aprovação guarda mídia/versionamento, parâmetros e identidade do aprovador. Validar sem veiculação e sem gastos.

### Etapa 4 Criação efetiva na Meta

**Entrega:** converter proposta aprovada em campanha, conjuntos e anúncios reais, inicialmente pausados. Persistir IDs e o resultado de cada etapa; lidar com criação parcial e retorno incerto sem duplicação. Integrar o executor existente de recomendações/rascunhos da ConnectyHub em vez de criar mais uma central paralela.

**Controle:** ativação exige versão aprovada, permissões válidas, orçamento e período explícitos, além de limite de gasto definido pelo cliente. MCP é uma forma de acesso, não uma autorização para contornar esses controles. Falta de saldo de IA não deve impedir consultar ou interromper campanha existente. Pausa precisa confirmar o estado externo.

**Aceite sem gasto:** objetos reais conferidos na conta isolada e mantidos pausados; clique repetido, falha intermediária e reconexão não criam duplicatas. Não ativar anúncios como teste. A primeira veiculação e o custo/resultado real exigirão uma etapa posterior expressamente autorizada.

### Etapa 5 Resultados e avisos pelo WhatsApp

**Entrega:** ligar criativo e versão aos posts/anúncios, métricas por período e origem do lead/venda. Comparar posts e campanhas com objetivos compatíveis. Relatório curto no painel e exportação detalhada. A IA propõe melhorias baseada nos dados disponíveis, sem confundir Pixel recebido com venda atribuída.

**Avisos:** análise pronta, aprovação pendente, falha de entrega, resumo periódico e atenção ao orçamento. Destinatário verificado, escolha de frequência, opt-out, horários e deduplicação pela infraestrutura existente. Links voltam ao painel autenticado. Reutilizar regras oficiais de janela/modelos quando o canal escolhido exigir.

**Aceite:** recibo de entrega, destinatário da empresa correta, ausência de mensagens duplicadas e dados sem atraso oculto. Leituras de campanhas existentes e eventos de teste não geram novas despesas publicitárias. Não simular ROAS ou conversões para preencher gráficos. Ajustes de verba recomendados exigem nova aprovação.

### Etapa 6 Inspirações próprias e pesquisa externa

**Decisão atual do titular em 12/10:** implementar Gemini com Google Search para pesquisa externa, sem contratar AdSpy/Tavily. A menção a Sheets foi esclarecida explicitamente como Search. No checkout examinado, `actions/trends.ts` usa Tavily + Gemini; reaproveitar a experiência, não esse fornecedor.

**Inspirações próprias propostas:** sugestões a partir do catálogo, contexto da empresa, perguntas recorrentes agregadas, criativos e resultados daquela mesma empresa. Usar ideias como contexto para avaliar um criativo ou preparar um rascunho do calendário. Isso usa IA e tem consumo de inferência, mas não exige assinatura de radar externo. Não consulta históricos privados de outros clientes nem se apresenta como tendência atual do mercado.

**Implementação autorizada:** Gemini com Google Search pesquisa conteúdo público atual com fontes. Cada consulta e a inferência entram no consumo, com reserva e liquidação idempotente; não presumir franquia gratuita nem equivalência com uma base de inteligência de anúncios. Mostrar data, fontes e limites, em seção recolhível, com uso como contexto da análise do criativo. Referência: [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/generate-content/google-search).

**Aceite:** fonte indisponível não vira “tendência confirmada”; ideias da IA não se passam por métrica pública. Resultados privados de outras empresas nunca aparecem como inspiração. Custos de busca e IA registrados antes de oferecer o serviço comercialmente.

### Etapa 7 Google Ads na mesma experiência

**Entrega:** reaproveitar o estúdio, aprovação, biblioteca, orçamento e relatórios; implementar o adaptador Google conforme tipos de campanha efetivamente suportados. A ConnectyHub já contém OAuth/consulta de relatórios e rascunhos operacionais; auditar e homologar essas partes, sem confundir leitura com criação de campanhas.

Começar com um percurso delimitado de Pesquisa para objetivo/destino definidos. Acrescentar campanhas visuais/vídeo em etapa própria, validando exigências e elegibilidade dos formatos. Não prometer que qualquer vídeo pode virar qualquer tipo de campanha Google. A tela só oferece destinos suportados e explica pendências em linguagem simples.

**Dependências:** acesso oficial Google, conta autorizada, ações de conversão, política de utilização e configuração do token da plataforma. O cliente não deve obter developer token nem copiar credenciais. Usar contas de teste e `validate_only` apenas nos métodos que o suportam; relatórios completos têm limitações nas contas de teste. [Testes oficiais da Google Ads API](https://developers.google.com/google-ads/api/docs/best-practices/testing?hl=en). Acesso a produção precisa atender aos requisitos oficiais vigentes, separados do App Review Meta. [Acessos Google Ads](https://developers.google.com/google-ads/api/docs/api-policy/access-levels?hl=en).

**Aceite:** mesma jornada com usuário comum; criação no ambiente de teste, sem anúncios ativos ou pagamentos. Não considerar aprovação Meta como liberação Google.

## Evoluções posteriores do produto de origem

Após a jornada principal: primeira análise em landing page conectada ao CRM; notificações por e-mail; análise de referências autorizadas; exportação PDF/CSV além do Markdown; métricas de qualidade e custo no admin. Preparação editorial para YouTube/TikTok pode reaproveitar o estúdio, mas conexão e publicação nessas redes continuam integrações próprias.

Não duplicar autenticação, conta, carteira, checkout, CRM ou agentes. Não importar bases ou chaves do Viral Check. Migração de dados históricos do produto de origem, se desejada depois, requer escopo separado.

## Critério de conclusão e prioridade imediata

Uma etapa só está pronta após código, testes, revisão visual, implantação e validação no painel de usuário comum, registrando o que depende de provedor. “Publicado”, “testado com ativo próprio” e “liberado para clientes externos” são estados diferentes. Cada entrega atualiza os documentos operacionais e mantém retorno de aplicação seguro.

**Primeira implementação após o planejamento:** Etapa 1, seguida da base de execução e créditos da Etapa 2. Depois concluir a campanha Meta aprovada e pausada das Etapas 3–4. Inspirações próprias e expansão Google aproveitam essa base; radar externo fica adiado. Não há autorização neste plano para iniciar anúncios, gastos ou novos envios sociais de teste.

## Fontes internas para execução

- Viral Check: `actions/analyze.ts`, `inngest/functions/analyzeVideo.ts`, `actions/trends.ts`, `actions/discovery.ts`, `components/dashboard`, `components/landing/HomeAnalysisUpload.tsx`, `app/api/landing-analysis`, `lib/notifications`, `actions/admin-landing-leads.ts`, `actions/admin-analytics.ts`, `app/admin/prompt`, `lib/whatsapp/agent-settings.ts`, `app/api/webhooks/connectyhub`, `supabase/migrations`.
- ConnectyHub: [incorporação publicada e limites](meta-creative-studio-viralcheck-2026-10-12.md), [estado operacional](estado-operacional.md), `src/lib/meta/creative-*`, `src/lib/meta/organic-*`, `src/lib/meta/ads-analytics.ts`, `src/lib/traffic/admin-traffic.ts`, `src/lib/traffic/traffic-ai-operations.ts`, `src/lib/billing/plan-entitlements.ts`.
