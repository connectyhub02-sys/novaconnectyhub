# ConnectyHub — auditoria visual e plano de responsividade

Data: 07/09/2026, horário de Brasília. Base examinada: `3a9f100af35c514cd4427d45ec9d15ec32725449`.

## Resultado

A plataforma já tem navegação móvel, componentes responsivos e manifesto para abrir como aplicativo. Entretanto, essas bases não são aplicadas de maneira consistente. Há falhas comprovadas de contraste, ações cortadas na gestão de clientes e recursos do atendimento escondidos no celular. O trabalho necessário combina correção do tema, reorganização das telas e padronização dos componentes.

O objetivo é permitir que o administrador e o cliente realizem suas tarefas pelo telefone com a mesma cobertura funcional disponível no computador, respeitando as permissões e o plano contratado.

Este documento é uma auditoria e um plano. Nenhuma alteração visual foi aplicada à produção nesta etapa.

## Abrangência e limites da verificação

- Inventário das 70 entradas `page.tsx`: 27 de administração, 27 do painel do cliente e 16 públicas. Algumas são redirecionamentos; são entradas de rota, não 70 interfaces independentes.
- Varredura estrutural dos 121 componentes TSX, com leitura aprofundada do tema, navegação, componentes básicos, checkout do plano, atendimento, CRM, clientes, catálogo, integrações/API, campanhas, financeiro e checkout público.
- Inspeção no navegador autenticado: dashboard e menu admin, clientes, CRM Leads, dashboard do cliente e atendimento do cliente, incluindo a abertura de uma conversa. O painel do cliente foi acessado pela função administrativa existente; o navegador voltou ao admin ao terminar.
- Complemento solicitado pelo usuário: inspeção visual da loja pública Vision Business Group e de uma página de produto, em 390 px e desktop (loja em 1920 px, produto em 1440 px). O checkout antigo da BuffaloMass exibiu a página de indisponibilidade; seu estado financeiro não foi alterado para realizar a auditoria. Esta é uma amostra dos modelos públicos compartilhados, não uma revisão individual de todos os produtos de todos os clientes.
- Larguras inspecionadas: 390 px no celular, 768 px no atendimento em tablet e 1440/1920 px na navegação e painéis de desktop. As capturas do usuário também foram usadas para os estados de recusa e encerramento do checkout.
- A varredura do código abrange todas as rotas inventariadas. A inspeção visual no navegador foi uma amostragem dos fluxos acima, não a execução manual de todos os estados das 70 rotas. Safari, teclado real de celular, instalação PWA e tecnologias assistivas ainda precisam da validação prevista no plano.
- Nenhuma mensagem, pagamento, mudança de plano ou alteração de cadastro foi submetida durante a auditoria visual.

As contagens estruturais são indicadores para organizar a migração, não uma contagem automática de defeitos: 994 ocorrências de classes de texto de 8–10 px; 125 larguras fixas em px/rem; 33 larguras mínimas arbitrárias; 482 usos diretos de `<button>` e 7 de `<Button>`; 31 sobreposições com `fixed inset-0`. O CSS global tem 4.342 linhas e 106 declarações `!important`.

## Achados e evidências

| ID / prioridade | Evidência | Efeito para o usuário | Correção proposta |
|---|---|---|---|
| V01 — P0 | `src/app/layout.tsx:111` e `:127` forçam esquema/classe escuros; `globals.css:316` e `connecty-shell.tsx:655` aplicam tema claro. `globals.css:333` troca texto claro por escuro e `:417` clareia somente uma lista de fundos. | A combinação final depende de exceções de CSS. Algumas superfícies continuam escuras com texto escuro; outras recebem texto claro sobre fundo claro. | Definir temas por área e pares semânticos de fundo/texto. Migrar componentes e remover as conversões legadas progressivamente. |
| V02 — P0 | `billing-plan-checkout.tsx:1149`: linhas do carrinho usam `bg-slate-900/70`, ausente da conversão de fundos. `:713`: texto `text-emerald-50/80` no aviso de processamento. Captura do usuário comprova baixa leitura. | Preço, desconto e orientações de pagamento perdem legibilidade. | Corrigir primeiro resumo financeiro, seletores de método, avisos, botões e modais do checkout. |
| V03 — P0 | `billing-plan-checkout.tsx:164` calcula possibilidade de pagar; `:708` usa o caminho contrário para exibir “Compra em processamento”, independentemente de ser encerramento ou outro impedimento; `:721` renderiza um aviso separado. | O estado de encerramento pode ser apresentado como processamento e coexistir com recusa. O print enviado mostra essa contradição. | Criar uma apresentação única derivada do estado confirmado: disponível, processando, aprovado, recusado, expirado, cancelado, estornado ou indisponível. Não inferir processamento apenas porque o botão está bloqueado. |
| V04 — P1 | `/admin/clientes`, em 390 px: linha de usuário medida com aproximadamente 727 px; grupo de ações com 488 px. “Acessar painel” começa em x≈510. `admin-users-console.tsx:1185` e `:1235` usam linha flexível sem reorganizar o grupo que não encolhe. Ancestrais usam `overflow:hidden/clip`. | Botões importantes ficam cortados. A página não ter barra horizontal não significa que esteja responsiva. | Cartão móvel com dados essenciais, ação principal visível e menu de ações secundárias. Excluir em área distinta, mantendo as proteções existentes. |
| V05 — P1 | `/dashboard/atendimento`, lista em 390 px: coluna interna medida com 716 px. `leads-crm-console.tsx:1696` mantém dimensões e mínimos da composição desktop. | Parte da lista, nomes, indicadores e filtros ultrapassa o espaço útil. | Coluna móvel de largura real disponível, filtros compactos e rolagem horizontal limitada apenas aos filtros que precisam dela. |
| V06 — P1 | `leads-crm-console.tsx:1874`: “CRM do lead” tem `hidden ... sm:inline-flex`; `:1956`: sacola fica em `hidden ... xl:block`. Na conversa móvel inspecionada, o botão de CRM não aparece; no tablet ele reaparece. | A adaptação esconde tarefas importantes do atendimento, especialmente consultar o arquivo do lead e vender manualmente. | Disponibilizar “Conversa”, “Dados do lead” e “Pedido” por ações acessíveis no cabeçalho; abrir dados e sacola em painéis móveis. |
| V07 — P1 | Atendimento com altura mínima de 620 px, cabeçalhos acima e navegação fixa abaixo. Na amostra de 768×1024, a barra inferior sobrepõe parte da região do botão Responder. `connecty-shell.tsx:2833`, `globals.css:130` e `leads-crm-console.tsx:1696/:1910`. | O operador precisa administrar várias rolagens; a navegação compete com a resposta. | Calcular área útil da conversa com cabeçalho, teclado e área segura; manter compositor acessível e recolher/reorganizar o menu inferior quando necessário. |
| V08 — P1 | No dashboard admin, controle “6M” ativo: texto RGB(212,212,216), fundo RGB(255,255,255), fonte de 9 px. Contraste calculado de aproximadamente 1,48:1. Botão mede 29×20 px. Ícones do cabeçalho medem 32×32 px. | O controle ativo quase desaparece, e controles pequenos dificultam o toque. | Padrões de contraste e área de toque compartilhados. Não usar redução de fonte para fazer o desktop caber no celular. |
| V09 — P1 | Modais do checkout em `billing-plan-checkout.tsx:828/:905/:1007` e `checkout-payment-feedback-modal.tsx:82` têm conteúdo extenso e contêineres centralizados, sem um contrato uniforme de altura/rolagem. Existem componentes Radix/Drawer no projeto, mas não são usados de forma consistente nesses fluxos. | Risco de ações fora da área útil em telas baixas e com teclado. A marcação `role=dialog` sozinha não garante navegação por teclado correta. | Unificar janela desktop, painel inferior para ações curtas e tela completa para formulários longos. Validar foco, retorno do foco, Escape, scroll e altura dinâmica. |
| V10 — P2 | Dashboards mantêm grande quantidade de indicadores e cartões; em `/admin/clientes`, oito indicadores ficam empilhados antes da lista. CRM móvel já usa cartões, porém cada um inclui vários blocos auxiliares. | Demora para chegar à tarefa principal e exige muita rolagem. | Resumo compacto com 2–4 indicadores prioritários e detalhes sob demanda; busca e ação principal próximas do topo. |
| V11 — P2 | `connecty-shell.tsx:153` aplica a mesma paleta neutra aos dez acentos de navegação. Há muitas cores literais, botões próprios, sombras e exceções nas telas. | Elementos selecionados, ações e informações têm hierarquia inconsistente; novas páginas tendem a repetir o problema. | Um sistema visual compartilhado com variantes explícitas, aplicado também às novas telas. |
| V12 — P2 | `billing-plan-checkout.tsx:627` pode apresentar “Desconto anual” para um desconto que não é de primeira compra. A captura mostra campanha mensal de reativação com esse rótulo. Há estados técnicos como `past_due` e `trial_expired` na listagem de clientes. | O usuário recebe termos que não correspondem claramente à operação. | Rótulos derivados da campanha/estado real, em português, com resumo “hoje / próxima cobrança / periodicidade”. |

P0 significa primeira entrega por afetar cobrança e entendimento de estados; P1 significa operação móvel ou acessibilidade comprometida; P2 significa consistência, densidade e acabamento. Esses níveis ordenam esta melhoria de interface.

### Bases que devem ser aproveitadas

- O shell já oferece menu pesquisável, navegação inferior e sidebar desktop. Reorganizar essa base, evitando uma segunda navegação concorrente.
- O CRM já tem cartões para celular e o atendimento já alterna lista/conversa. Corrigir e completar essas soluções.
- `manifest.ts` já declara modo `standalone`, ícones e entrada `/iniciar`. A experiência de aplicativo depende também de layout e interação; o manifesto sozinho não resolve as telas.
- `panel-primitives.tsx`, `ui/button.tsx`, `ui/sheet.tsx` e `ui/drawer.tsx` dão uma base reutilizável. A prioridade é convergir os componentes existentes.
- As lojas usam variáveis próprias `--store-*`. O tema administrativo precisa conviver com a identidade de cada loja.

## Direção visual proposta

### Complemento: lojas e páginas de produtos dos clientes

A revisão visual adicional confirmou que as páginas públicas também precisam entrar na execução. Há bons fundamentos: na amostra, a página do produto não apresentou overflow horizontal do documento, reorganizou imagem e informação em uma coluna no celular e manteve “Adicionar” fixo na parte inferior. Os ajustes devem aproveitar esse comportamento.

| ID / prioridade | Evidência | Correção a incluir |
|---|---|---|
| L01 — P1 | Em 390×844, o topo da loja Vision ocupa praticamente a primeira tela com apresentação e ilustração; os cartões de produto ficam abaixo. `public-storefront.tsx:903/:925` conserva mínimos de 448 px para a área visual. | Compactar a apresentação no celular e priorizar a vitrine. Quando não houver imagem de destaque, reduzir o bloco de substituição. |
| L02 — P2 | O produto inspecionado não possui foto de capa renderizada e mostra um bloco quadrado grande com ícone de caixa. É um estado sem imagem; esta observação não comprova falha de carregamento. | Dar tratamento compacto à ausência de mídia, aproximando título, preço e ação de compra. Manter galeria confortável quando houver imagens. |
| L03 — P1 | No desktop da página do produto, “Buscar produtos...” é um input `readOnly`, confirmado no DOM e em `src/app/produto/[productId]/page.tsx:825`. | Tornar a busca funcional ou encaminhar claramente à busca da loja, sem apresentar um campo que parece editável e não aceita entrada. |
| L04 — P1 | A nota 4,8/5 está escrita diretamente no modelo da loja (`public-storefront.tsx:1308`) e do produto (`produto/[productId]/page.tsx:413`). `public-storefront.tsx:1364` gera depoimentos genéricos, incluindo “Cliente verificado”. | Exibir notas e depoimentos somente a partir de avaliações reais. Sem dados, omitir a seção; não publicar exemplos como se fossem avaliações de compradores. |
| L05 — P1 | O produto apresenta “6x sem juros” no modelo (`produto/[productId]/page.tsx:421`), e o rodapé contém uma lista fixa com PayPal e G Pay (`:1128`). A loja e o produto apresentam conjuntos diferentes de meios de pagamento. | Vincular parcelamento, juros e meios exibidos às condições efetivamente habilitadas no checkout da loja; unificar essa fonte de informação. |
| L06 — P2 | A amostra mostra rótulo técnico de SKU com sintaxe de variável e seções genéricas como “Modo de uso” e “Envio discreto” para um veículo. Links de ajuda do rodapé levam repetidamente à própria loja. | Adaptar seções e rótulos ao tipo de produto; relegar códigos técnicos aos detalhes; oferecer destinos reais para ajuda, entrega e acompanhamento. |
| L07 — P2 | Menu móvel medido em aproximadamente 36 px, carrinho em 40 px e indicadores de carrossel em 8 px. `public-storefront.tsx:1881` não acrescenta a área segura ao rodapé móvel. | Ampliar áreas de toque, pausar carrosséis durante interação e validar barra inferior/área segura em telefone real. Itens fora da viewport dentro de carrosséis não devem ser classificados automaticamente como overflow defeituoso. |

O teste adicional não criou pedido nem submeteu pagamento. A validação de carrinho com itens, ofertas, agente flutuante e checkout ativo permanece na matriz de execução, incluindo produtos físicos, serviços, imóveis, alimentos e conteúdo digital. O modelo compartilhado deve atender aos nichos sem impor a todos a mesma apresentação comercial.

### Paleta e componentes

Tema claro como padrão dos painéis, com identidade ConnectyHub, alta legibilidade e densidade adequada ao trabalho diário. Proposta inicial de valores, a validar nas combinações reais:

| Função | Direção |
|---|---|
| Fundo da aplicação | Cinza muito claro, próximo de `#F6F8FC` |
| Cartões e formulários | Branco `#FFFFFF`, separação por borda discreta e espaçamento |
| Texto principal / secundário | Grafite `#0F172A` / cinza `#475569` |
| Ação principal / navegação selecionada | Azul `#1D4ED8` com branco; contraste calculado desse par ≈6,70:1 |
| Ação secundária | Superfície clara, borda identificável, texto escuro |
| Sucesso | Verde escuro `#047857` em superfície verde clara |
| Atenção / pendência | Âmbar escuro `#92400E` em superfície clara |
| Erro / recusa / ação destrutiva | Vermelho escuro `#B91C1C`, com rótulo e ícone correspondentes |

Reduzir gradientes, brilho e sombras fortes nos painéis operacionais. Reservar monoespaçada para códigos, identificadores e dados técnicos; usar a fonte de leitura para navegação, botões e textos. Conteúdo principal de 14–16 px, campos móveis de 16 px, legendas normalmente de 12–13 px. Espaçamento com escala única; botões de 44–48 px como padrão interno de conforto no celular.

Textos comuns devem atender pelo menos 4,5:1; textos grandes, 3:1, conforme [WCAG — contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). O objetivo interno de toque de 44–48 px é mais confortável que o mínimo AA de 24×24 px, que possui condições e exceções de espaçamento; não é correto chamar todo botão de 32 px de violação automática. Referência: [WCAG — tamanho do alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Plano de execução

### 1. Base visual e correções críticas

Entregar tokens semânticos de cor, superfície, texto, borda, foco, estado e tamanho. Padronizar Button, campos, avisos, badges, cartões e abas. Cada variante deve declarar fundo e texto em conjunto.

Aplicar primeiro ao checkout do plano, produtos avulsos, seleção de pagamento, resumo financeiro e modais de aprovação/recusa. Corrigir a apresentação dos estados e os rótulos de campanhas. Deixar um próximo passo claro para cada situação: tentar novamente, trocar método, aguardar confirmação ou retornar à contratação quando o checkout realmente estiver encerrado.

A migração deve manter temporariamente as regras antigas apenas nas áreas ainda não convertidas. Remover cada exceção depois que seus consumidores forem migrados; evitar uma troca global abrupta que altere centenas de componentes ao mesmo tempo.

**Aceite:** preço, desconto, status e ações legíveis; um estado principal coerente; nenhuma ação importante cortada; fluxo de pagamento existente preservado.

### 2. Navegação com comportamento de aplicativo

Manter no celular quatro atalhos e “Menu”, adaptados à função e às permissões:

- Cliente: Início, Atender, Vendas e Conta, com acesso aos demais módulos no menu pesquisável.
- Admin: Início, WhatsApp, Clientes e Leads, com Financeiro, Planos, Campanhas, Integrações e demais áreas no menu.
- Conta com acesso restrito: somente os atalhos permitidos para produtos adquiridos e regularização, conforme as regras atuais.

Compactar o cabeçalho e o menu: empresa atual, nome da tela, voltar quando houver detalhe e ações relevantes. Eliminar blocos repetidos que empurram a navegação para baixo. Preservar troca de empresa e indicação de acesso administrativo, com apresentação compacta.

Tratar área segura inferior/superior, retorno da tela de detalhe à lista com filtro preservado, foco e histórico do navegador. No desktop, manter sidebar e espaço de trabalho amplo. No tablet, evitar mudar prematuramente para tabelas ou várias colunas que ainda não cabem.

**Aceite:** todos os recursos autorizados localizáveis; nenhuma função escondida apenas pelo tamanho da tela; barra inferior sem cobrir ações.

### 3. Atendimento, CRM e clientes

Reorganizar a central móvel em lista → conversa → dados do lead/pedido. A conversa precisa usar a área útil do telefone, com compositor acima do teclado. O cabeçalho deve permitir consultar CRM, montar pedido, acompanhar checkout e alternar atendimento humano/IA conforme as permissões existentes.

Transformar linhas de clientes em cartões móveis com identificação, plano/status e ação principal. Agrupar ações secundárias em menu. No CRM, mostrar nome, estágio, última atividade e próximo passo; abrir histórico, ficha técnica e detalhes quando solicitado.

O arquivo do lead continua sendo a fonte de sua jornada: mensagens, mídias, alterações, visitas e eventos de compra permanecem acessíveis. O redesenho não pode eliminar informações para reduzir a tela; deve reorganizá-las.

**Aceite:** pelo celular, localizar um cliente, abrir seu painel quando autorizado, consultar um lead, abrir conversa, acessar dados e sacola, responder e acompanhar um pedido sem depender do desktop.

### 4. Migração dos demais módulos

| Grupo | Adaptação |
|---|---|
| Dashboards, relatórios e tráfego | Indicadores prioritários no topo; gráficos com legendas legíveis; aprofundamento sob demanda; ações acima de blocos auxiliares. |
| Agentes, WhatsApp e integrações/API | Configurações por seções curtas; status de conexão explícito; ações com rótulos; exemplos de código com rolagem própria; logs e instâncias com versão móvel. |
| Catálogo, produtos e conteúdo | Lista/cartões adaptativos; editor por seções; imagens compactas; preço, publicação e salvamento acessíveis; sem reduzir grades de desktop à força. |
| Campanhas comerciais e benefícios | Público, vigência, planos/produtos, preços e etapas organizados; prévia da cobrança clara e próxima das condições; controles de adicionar/remover fáceis de tocar. |
| Automações, aprovações e IA | Estado, próxima execução, ação e resultado em primeiro plano; detalhes de regras em painéis próprios; formulários longos com navegação por seções. |
| Financeiro, faturas, planos e conta | Resumo de valores/status; filtros compactos; ações coerentes com a cobrança; formulários e modais com rolagem e validação uniforme. |
| Produtos adquiridos | Lista e acesso ao conteúdo confortáveis no telefone, inclusive com plano suspenso quando esse acesso é permitido. |
| Auditoria, manutenção e configurações | Mesmo padrão do admin; tabelas extensas com seleção de campos e detalhes acessíveis; estados vazios, carregando, erro e sucesso previstos. |

Usar componentes compartilhados de lista/tabela móvel, formulário por seções, barra de ações e painel de detalhes. Tabelas que realmente exigem duas dimensões podem ter rolagem interna identificada; a página inteira não deve depender dela. A referência de reflow considera uso a 320 CSS px e exceções para conteúdo essencialmente bidimensional: [WCAG — reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

**Aceite:** todos os grupos e todas as rotas do anexo têm responsável pela migração, estados de teste e evidência de revisão; aliases/redirecionamentos também são verificados.

### 5. Páginas públicas e acabamento de aplicativo

Aplicar as mesmas regras de leitura, toque, formulários e estados a login, cadastro, início, lojas, produtos, carrinho, checkout e conteúdo público. Preservar o layout compacto do checkout de loja e a identidade comercial de cada usuário, incluindo foto do lead, agente, ofertas e marca ConnectyHub.

Verificar conflito entre carrinho, ofertas, agente flutuante e botões fixos, especialmente ao abrir teclado. Manter os eventos da jornada associados ao lead; instrumentação de interface não deve capturar valores dos campos de cartão.

Aproveitar o manifesto existente para validar abertura pela tela inicial, ícones, cores da barra do sistema, retorno à rota e reconexão. O aplicativo deve comunicar indisponibilidade de rede sem aparentar que uma alteração ou pagamento foi concluído sem confirmação.

**Aceite:** jornada loja → produto → carrinho → checkout operável no telefone; painel instalável com a mesma experiência validada no navegador; identidade das lojas preservada.

### 6. Validação e publicação por lotes

Preparar uma matriz de comparação antes/depois. Publicar os lotes em sequência: base + cobrança; navegação + clientes/atendimento; demais módulos; páginas públicas/acabamento. Cada lote depende de revisão visual e funcional de seus componentes e consumidores.

Critérios de conclusão:

1. Larguras de 320, 360, 390, 430, 768, 1024 e 1440 px, além de telas baixas e orientação horizontal. Testar a experiência ampliada, incluindo zoom de 200% e o cenário de reflow de 400%.
2. Chrome/Android e Safari/iPhone reais para teclado, área segura, modais, seleção de arquivos e navegação instalada; emulação desktop complementa esses testes.
3. Nenhum botão, campo obrigatório ou ação principal cortado; nenhum controle fixo sobrepondo outro. Ausência de scroll horizontal no documento não basta: verificar também a geometria dos filhos e recortes.
4. Contraste nos estados normal, selecionado, foco, carregando, erro e desabilitado; status compreensível por texto e ícone, além de cor.
5. Teclado: foco visível, rótulos, abrir/fechar painéis, foco contido em diálogos e retorno ao controle de origem. Respeitar redução de movimento.
6. Estados carregando, vazio, erro, muitos registros, textos/nome de produtos longos e conexão lenta. Conservar valores digitados quando houver erro recuperável.
7. Perfis: admin, cliente ativo, cliente restrito, múltiplas empresas e usuário com recursos limitados pelo plano. Verificar autorização por servidor e UI durante a migração.
8. Regressões funcionais: cobrança e renovação, Pix/cartão, benefícios, bloqueio/desbloqueio, acesso a produtos comprados, CRM/mídias, histórico, automações e integrações. Usar testes apropriados e dados de teste; pagamentos reais não fazem parte da simples validação visual.
9. Comparações visuais dos componentes compartilhados e rotas críticas, checagens automatizadas de acessibilidade/overflow e revisão humana. Lint, tipos e build dos lotes alterados.
10. Nova página só entra usando os padrões compartilhados e com verificação móvel. A correção precisa alcançar também usuários e lojas que forem criados depois.

## Ordem recomendada

Começar pela base de cores e checkout, junto das ações cortadas em Clientes. Em seguida, concluir a navegação e o atendimento móvel. Depois migrar os módulos restantes pela mesma biblioteca visual, cobrindo as páginas públicas no lote final. A prova de conclusão é a execução das tarefas em cada formato, com todas as funções autorizadas disponíveis.

## Inventário de rotas

O anexo abaixo registra a cobertura estrutural. “Navegador” significa que houve inspeção na amostra desta auditoria; “Código” significa inventário/leitura estrutural, com validação visual prevista durante a implementação. Não equivale a aprovação visual da rota.

### Admin — 27 entradas

| Rota | Evidência nesta auditoria | Componentes importados diretamente | Origem |
|---|---|---|---|
| `/admin` | Navegador + código | admin-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/page.tsx:1>) |
| `/admin/agentes` | Código | autonomous-command-center | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/agentes/page.tsx:1>) |
| `/admin/api-whatsapp` | Código | connectyhub-api-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/api-whatsapp/page.tsx:1>) |
| `/admin/aprovacoes` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/aprovacoes/page.tsx:1>) |
| `/admin/auditoria` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/auditoria/page.tsx:1>) |
| `/admin/automacoes` | Código | platform-automations-center | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/automacoes/page.tsx:1>) |
| `/admin/campanhas-comerciais` | Código | campaign-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/campanhas-comerciais/page.tsx:1>) |
| `/admin/ceo` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/ceo/page.tsx:1>) |
| `/admin/clientes` | Navegador + código | admin-users-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/clientes/page.tsx:1>) |
| `/admin/clientes/integracoes` | Código | admin-client-integrations-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/clientes/integracoes/page.tsx:1>) |
| `/admin/clientes/whatsapp` | Código | admin-customer-whatsapp-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/clientes/whatsapp/page.tsx:1>) |
| `/admin/configuracoes` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/configuracoes/page.tsx:1>) |
| `/admin/conteudo` | Código | autonomous-command-center | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/conteudo/page.tsx:1>) |
| `/admin/financeiro` | Código | billing-center | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/financeiro/page.tsx:1>) |
| `/admin/instancias` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/instancias/page.tsx:1>) |
| `/admin/inteligencia` | Código | autonomous-command-center | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/inteligencia/page.tsx:1>) |
| `/admin/leads` | Navegador + código | leads-crm-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/leads/page.tsx:1>) |
| `/admin/maintenance` | Código | maintenance-room | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/maintenance/page.tsx:1>) |
| `/admin/planos` | Código | billing-plans-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/planos/page.tsx:1>) |
| `/admin/produtos-connectyhub` | Código | platform-products-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/produtos-connectyhub/page.tsx:1>) |
| `/admin/produtos-connectyhub/[productId]/conteudo` | Código | product-content-editor | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/produtos-connectyhub/[productId]/conteudo/page.tsx:1>) |
| `/admin/setores` | Código | admin-sectors-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/setores/page.tsx:1>) |
| `/admin/trafego` | Código | admin-traffic-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/trafego/page.tsx:1>) |
| `/admin/trafego/google-ads` | Código | admin-ads-platform-dashboard | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/trafego/google-ads/page.tsx:1>) |
| `/admin/trafego/meta-ads` | Código | admin-ads-platform-dashboard | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/trafego/meta-ads/page.tsx:1>) |
| `/admin/whatsapp/agentes` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/whatsapp/agentes/page.tsx:1>) |
| `/admin/whatsapp/atendimento` | Código | admin-whatsapp-atendimento-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/admin/whatsapp/atendimento/page.tsx:1>) |

### Cliente — 27 entradas

| Rota | Evidência nesta auditoria | Componentes importados diretamente | Origem |
|---|---|---|---|
| `/dashboard` | Navegador + código | client-dashboard | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/page.tsx:1>) |
| `/dashboard/agentes` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/agentes/page.tsx:1>) |
| `/dashboard/api-whatsapp` | Código | client-api-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/api-whatsapp/page.tsx:1>) |
| `/dashboard/atendimento` | Navegador + código | leads-crm-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/atendimento/page.tsx:1>) |
| `/dashboard/automacoes` | Código | client-automations-center | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/automacoes/page.tsx:1>) |
| `/dashboard/campanhas` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/campanhas/page.tsx:1>) |
| `/dashboard/campanhas-comerciais` | Código | campaign-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/campanhas-comerciais/page.tsx:1>) |
| `/dashboard/conversas` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/conversas/page.tsx:1>) |
| `/dashboard/crm` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/crm/page.tsx:1>) |
| `/dashboard/empresa` | Código | company-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/empresa/page.tsx:1>) |
| `/dashboard/integracoes` | Código | client-integrations-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/integracoes/page.tsx:1>) |
| `/dashboard/leads` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/leads/page.tsx:1>) |
| `/dashboard/links` | Código | sales-catalog-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/links/page.tsx:1>) |
| `/dashboard/meus-produtos` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/meus-produtos/page.tsx:1>) |
| `/dashboard/meus-produtos/[purchaseId]` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/meus-produtos/[purchaseId]/page.tsx:1>) |
| `/dashboard/meus-produtos/checkout/[subscriptionId]` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/meus-produtos/checkout/[subscriptionId]/page.tsx:1>) |
| `/dashboard/meus-produtos/comprar/[productId]` | Código | platform-offers, product-purchase-button | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/meus-produtos/comprar/[productId]/page.tsx:1>) |
| `/dashboard/minha-conta` | Código | account-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/minha-conta/page.tsx:1>) |
| `/dashboard/minha-conta/faturas/[invoiceId]` | Código | account-invoice-actions | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/minha-conta/faturas/[invoiceId]/page.tsx:1>) |
| `/dashboard/planos` | Código | pricing-plans-grid | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/planos/page.tsx:1>) |
| `/dashboard/planos/checkout/[subscriptionId]` | Print do usuário + código | platform-offers, billing-plan-checkout | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/planos/checkout/[subscriptionId]/page.tsx:1>) |
| `/dashboard/produtos` | Código | client-products-marketplace | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/produtos/page.tsx:1>) |
| `/dashboard/relatorios` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/relatorios/page.tsx:1>) |
| `/dashboard/trafego-organico` | Código | feature-upgrade-panel, meta-coming-soon-panel, meta-organic-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/trafego-organico/page.tsx:1>) |
| `/dashboard/trafego/google-ads` | Código | admin-ads-platform-dashboard, feature-upgrade-panel | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/trafego/google-ads/page.tsx:1>) |
| `/dashboard/trafego/meta-ads` | Código | admin-ads-platform-dashboard, feature-upgrade-panel, meta-coming-soon-panel | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/trafego/meta-ads/page.tsx:1>) |
| `/dashboard/whatsapp` | Código | whatsapp-console | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/dashboard/whatsapp/page.tsx:1>) |

### Público — 16 entradas

| Rota | Evidência nesta auditoria | Componentes importados diretamente | Origem |
|---|---|---|---|
| `/` | Código | connecty-logo, pricing-plans-grid, spotlight | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/page.tsx:1>) |
| `/cadastro` | Código | auth-card | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/cadastro/page.tsx:1>) |
| `/checkout/[sessionId]` | Código + estado indisponível no navegador | store-subscription, store-offers, store-unavailable, checkout-payment-options, checkout-customer-avatar, connecty-logo, payment-brand-badge, checkout-delivery-editor, checkout-upsell, checkout-payment-feedback-modal, checkout-status-poller, public-tracking-context-bridge | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/checkout/[sessionId]/page.tsx:1>) |
| `/docs/api` | Código | connecty-logo, api-docs-reference, json-ld | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/docs/api/page.tsx:1>) |
| `/exclusao-de-dados` | Código | legal-page | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/exclusao-de-dados/page.tsx:1>) |
| `/iniciar` | Código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/iniciar/page.tsx:1>) |
| `/login` | Código | auth-card | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/login/page.tsx:1>) |
| `/loja/[storeSlug]` | Navegador + código | store-unavailable, public-storefront, json-ld, public-tracking-context-bridge | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/loja/[storeSlug]/page.tsx:1>) |
| `/loja/[storeSlug]/carrinho` | Código | store-unavailable, public-storefront, public-tracking-context-bridge | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/loja/[storeSlug]/carrinho/page.tsx:1>) |
| `/loja/[storeSlug]/produto/[productId]` | Navegador + código | Composição na rota / redirecionamento | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/loja/[storeSlug]/produto/[productId]/page.tsx:1>) |
| `/loja/[storeSlug]/produtos` | Código | store-unavailable, public-storefront, json-ld, public-tracking-context-bridge | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/loja/[storeSlug]/produtos/page.tsx:1>) |
| `/privacidade` | Código | legal-page | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/privacidade/page.tsx:1>) |
| `/produto/[productId]` | Código | store-unavailable, sales-catalog-media-gallery, product-page-cart-controller, commercial-offers, sales-catalog-product-actions, store-newsletter-card, json-ld, public-tracking-context-bridge | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/produto/[productId]/page.tsx:1>) |
| `/solucoes` | Código | public-site-header, json-ld | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/solucoes/page.tsx:1>) |
| `/solucoes/[slug]` | Código | public-site-header, json-ld | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/solucoes/[slug]/page.tsx:1>) |
| `/termos` | Código | legal-page | [Fonte](<C:/Users/conne/Documents/ConnectyHub/src/app/termos/page.tsx:1>) |
