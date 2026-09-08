# API de IA, créditos e soluções personalizadas ConnectyHub

Data: 08/09/2026. Status: implementação publicada, migrações aplicadas e geração real da API validada em produção, incluindo consumo, idempotência e revogação da chave. Detalhes e limites em `entrega-api-ia-contratos-2026-09-08.md`.

## Objetivo

Permitir que clientes usem o saldo atual da ConnectyHub em projetos externos por uma API de IA, contratem condições individuais e entendam seu consumo sem precisar dominar tokens. Apresentar o desenvolvimento de software sob medida em uma landing page sem preços, com atendimento pela agente comercial da ConnectyHub para agendar uma reunião.

## Base verificada no código

- `src/lib/billing/metered-usage.ts` calcula consumo por fornecedor, modelo e atividade. `gemini-metering.ts` extrai unidades de uso do Gemini. Os modos de teste e de cliente podem debitar créditos; o uso interno tem registro de custo separado.
- `src/lib/billing/cost-center.ts` registra o uso e debita a carteira depois da execução. A API externa precisa de reserva anterior ao processamento e de liquidação atômica para chamadas concorrentes.
- O teste em `src/lib/billing/trial.ts` prevê 1.000 créditos e 7 dias.
- `src/lib/connectyhub-api/gateway.ts` já possui autenticação de chaves, permissões e integração com bloqueio contratual. Hoje a autenticação usa a permissão da API do WhatsApp; IA precisa de permissão independente.
- `src/components/connectyhub-os/account-console.tsx` mostra saldo, gastos de hoje e de 30 dias, categorias, movimentações e atividades. Usa expressões como “entrada/saída” sem explicar a transformação em créditos. Não foi encontrada explicação didática nessa área.
- `src/lib/billing/paid-lifecycle-notifications.ts` prevê avisos para saldo de até 20%, até 10% e saldo zerado. A verificação lê a carteira; não exige uma conversa com o agente. A rotina é chamada pelo agendamento de cinco minutos em `src/lib/inngest/functions.ts`.
- Os avisos atuais têm condições específicas de assinatura ativa e créditos incluídos maiores que zero. É necessário adaptar os contratos personalizados que usem somente recargas.
- A deduplicação atual dos avisos usa o ciclo. Será necessário rearmar alertas após uma recarga quando o saldo voltar a cair, sem repetir mensagens a cada chamada.
- O admin já ativa planos, concede créditos, altera limites e registra auditoria. O controle consultado não possui um campo de mensalidade individual; as condições são derivadas do plano escolhido.

Esta leitura não comprova o envio real de uma mensagem para um cliente específico nem substitui a validação dos serviços e configurações em produção.

## 1. Contrato personalizado por cliente

Adicionar “Contrato personalizado” no cadastro administrativo do cliente. Campos: nome do contrato/projeto, mensalidade, créditos por ciclo, recursos habilitados, limites, início da vigência, próximo vencimento, condição de renovação e política de recarga.

O contrato pertence à conta de cobrança. Empresas e projetos subordinados usam os recursos e a carteira dessa conta, com limites próprios quando configurados. A mensalidade de um cliente não altera o catálogo nem os contratos de outros clientes.

Guardar uma versão das condições aceitas: preço, créditos incluídos, recursos e datas. Checkout, fatura, renovação, concessão de créditos, notificações e controle de acesso devem ler essas condições. Evitar alterações que só mudem o texto da interface.

Permitir cobrança avulsa de desenvolvimento separada da mensalidade. Não somar automaticamente créditos de Start, Pro e Scale: a franquia personalizada será o número definido pelo admin.

Mudanças de condições terão data de vigência e histórico. Não reescrever faturas emitidas, confundir ativação manual com pagamento ou conceder a franquia novamente ao editar um contrato. Migrar clientes existentes sem inventar valores ou vencimentos, sem apagar saldos ou gerar dívida retroativa.

## 2. API de IA e carteira compartilhada

Disponibilidade: teste válido, Start, Pro, Scale e personalizado. IA e WhatsApp terão permissões distintas. Liberar IA no Start não libera automaticamente a API do WhatsApp.

O cliente configura a URL da ConnectyHub e uma chave da ConnectyHub no servidor do projeto externo. Essa integração precisa suportar um endereço de API configurável. Os segredos dos fornecedores permanecem no servidor da ConnectyHub.

Cada chave identifica conta, projeto, permissões e limites. Permitir revogar e substituir chaves, consultar último uso e limitar consumo, frequência de chamadas, tamanho de entrada e saída. Criar chaves adicionais não multiplica o teste gratuito nem o saldo.

Reutilizar uma única carteira por conta de cobrança. Registrar separadamente a origem de cada gasto: agentes, IA externa, voz, documentos e outras atividades. Preservar as regras existentes de saldo acumulado e validade do teste.

Fluxo de uma solicitação:

1. Autenticar a chave e resolver conta/projeto no servidor.
2. Verificar contrato, permissão, limites e saldo disponível, descontadas as reservas em andamento.
3. Validar modelo, conteúdo e limite máximo da resposta; fixar a tarifa da chamada e reservar o orçamento necessário em transação no banco.
4. Executar no fornecedor selecionado.
5. Apurar o consumo, converter em créditos, liquidar a reserva e devolver a diferença.
6. Registrar resposta, consumo, saldo e identificador da chamada; disparar avaliação dos alertas.

Idempotência precisa proteger execução e débito, inclusive com concorrência e reenvios. Falha antes do processamento libera reserva. Interrupção após consumo, resposta em fluxo, timeout e resultado incerto exigem política explícita de conciliação; não liberar toda a reserva cegamente nem cobrar duas vezes. Registrar custos internos de tentativas e alternativas separadamente.

O extrato deve preservar precisão decimal. Arredondamento visual não pode esconder pequenos débitos repetidos. Mostrar “menos de 0,01 crédito” ou precisão suficiente quando aplicável.

## 3. Avisos de saldo, recarga e atendimento

Aplicar os avisos ao saldo da conta independentemente de onde o consumo ocorreu. O destinatário é o contato de cobrança validado do cliente ConnectyHub, não os leads atendidos pelo projeto dele. Usar o agente comercial da plataforma configurado para esse relacionamento, atualmente Eliane.

Manter aviso inicial em 20%, crítico em 10% e aviso ao zerar. Quando houver 25.000 créditos de referência e não houver saldo adicional, os marcos são 5.000 e 2.500. Para saldo acumulado e recargas, explicar qual é a referência e permitir também limiar absoluto. Contratos com zero créditos incluídos devem continuar elegíveis aos alertas de saldo comprado.

Exemplo de mensagem, não enviada:

> Gustavo, seu saldo está baixo: restam 5.000 créditos ConnectyHub. Eles são usados pela IA nos seus projetos e atendimentos. Você pode acompanhar o consumo ou comprar mais créditos pelo painel.

Botão: “Comprar créditos”, com link ao fluxo de recarga da conta. Distinguir mensagem de saldo baixo de mensalidade vencida. Personalizar a descrição conforme os serviços usados; não afirmar que todos os recursos do WhatsApp param por falta de saldo se a operação não exige créditos.

Reavaliar o saldo após os débitos e manter a varredura periódica como recuperação. Deduplicar por conta e episódio de saldo baixo; rearmar após recarga suficiente, com intervalo mínimo para evitar mensagens repetitivas. Em queda direta para zero, priorizar o aviso correspondente, sem enviar em sequência todos os limiares ultrapassados.

Recarga automática opcional: autorização própria, cartão válido, limiar, quantidade/valor e teto mensal. Uma tentativa em andamento impede recargas paralelas. Creditar somente após confirmação; avisar falha e disponibilizar pagamento manual. Recarga não deve trocar a mensalidade, antecipar o vencimento ou reativar um contrato inadimplente indevidamente.

Registrar avisos, entregas/falhas, recargas e pagamentos no arquivo do cliente ConnectyHub. A agente deve conseguir consultar o saldo e o histórico e explicar se falta recarga ou renovação. Bloqueio do cliente não pode impedir as comunicações da própria plataforma sobre regularização.

## 4. Explicação simples e consumo verificável

Adicionar “Como meus créditos são usados?” junto do saldo no cabeçalho, em Minha conta/Faturamento e na futura API de IA. A explicação deve estar disponível também para quem ainda não tem movimentações. A interface atual retorna um estado vazio antes de mostrar outros conteúdos na aba de créditos; ajustar essa organização.

Texto proposto:

> Pense nos créditos como o saldo de um plano de dados. Cada tarefa usa uma parte desse saldo. Uma resposta curta e a análise de um documento podem exigir quantidades diferentes de trabalho da IA.
>
> O consumo considera o conteúdo que a IA precisa ler — incluindo o histórico necessário —, a resposta ou análise produzida e o modelo utilizado. Você não precisa calcular tokens: a ConnectyHub transforma esse uso em créditos e mostra o desconto no seu extrato.

Não prometer preço fixo por mensagem, conversa ou arquivo. Uma interação pode envolver leitura de imagem, consulta de contexto e resposta; agrupar essas atividades sem esconder os débitos nem contá-los duas vezes. Informar quando automações e atividades de fundo também usam créditos.

Apresentação em três níveis:

1. Resumo: saldo disponível, créditos utilizados, origem do consumo e ação de recarga.
2. Atividade: “Resposta no projeto X”, horário e total de créditos. “Ver cálculo” abre conteúdo processado, resposta, modelo e tarifa aplicada, com linguagem acessível.
3. Detalhes para quem precisa: unidades medidas, unidade tarifária, versão do preço, identificador da solicitação e vínculos com eventos/lançamentos. Custo e margem comercial ficam no admin; o usuário vê a tarifa que paga.

Exemplo educativo, claramente identificado como ilustrativo: saldo inicial 1.000, atividade de 3 créditos, saldo final 997. Os valores reais devem vir dos registros de uso; não usar números de demonstração como preço prometido.

Estimativas de “quanto meu saldo rende” só serão exibidas com base em uso medido ou simulação tarifária, identificadas como estimativas. Não assumir que um crédito equivale a uma mensagem.

## 5. Área de API e roteamento

Painel do usuário: projetos, chaves, documentação, exemplos, teste de chamadas, saldo, extrato por projeto, limites e recargas. Admin: fornecedores, modelos, tarifas, custos, falhas, orçamento e clientes.

Começar com Gemini para as capacidades aprovadas na entrega inicial. Definir contratos de integração que aceitem novos fornecedores sem exigir mudança de chave ou endereço nos projetos dos clientes. Implementar progressivamente análise de texto, imagem/documento e demais mídias.

Modo futuro “Automático ConnectyHub”: escolher um modelo antes da execução considerando capacidade necessária, qualidade, custo estimado, disponibilidade e orçamento. Permitir fixar um modelo. Troca por falha deve ter regras claras para evitar execução duplicada ou uma alternativa inesperadamente mais cara. Mostrar o modelo efetivo no extrato.

Migrar o consumo dos agentes internos para o mesmo controle gradualmente, removendo o débito legado correspondente para não cobrar a mesma operação duas vezes. Medir a operação interna da ConnectyHub separadamente da carteira dos clientes.

## 6. Landing page, referências internas e agendamento

Diretriz confirmada pelo usuário: os projetos fornecidos servem para compreender a amplitude das soluções que podemos construir. Não são uma solicitação de portfólio público. A página deve apresentar desenvolvimento de software sob medida para diferentes ideias e negócios, sem limitar a oferta aos segmentos dos projetos atuais.

Adicionar “Soluções personalizadas” na home e na área de planos, com “Saiba mais”, sem preço, faixa de investimento, mensalidade ou pacotes nessa oferta pública. Proposta de endereço: `/solucoes-personalizadas`. A página não aborda valores nem a composição comercial de desenvolvimento, mensalidade e créditos. As condições individuais serão configuradas no admin após o acordo com o cliente.

Chamada proposta:

> Sua ideia pode se transformar no próximo software da sua empresa.
>
> Desenvolvemos plataformas, aplicativos e sistemas sob medida para conectar pessoas, automatizar processos e transformar a maneira como seu negócio funciona.

Botões: “Conheça as possibilidades” e “Agendar uma reunião”. O primeiro percorre as soluções dentro da página. O segundo inicia o atendimento no WhatsApp com a agente comercial configurada, atualmente Eliane, mantendo origem, campanha e interesse do visitante.

Estrutura: abertura visual com interfaces ilustrativas; exemplos de possibilidades como SaaS, aplicativos, sistemas internos, CRM, marketplaces, reservas, portais, automações e inteligência artificial; integrações; desenvolvimento desde a descoberta até a implantação e evolução; perguntas frequentes; convite para reunião. Exemplos ilustram capacidades e não restringem os tipos de projeto atendidos. A definição do escopo e da viabilidade de cada ideia acontece na reunião, sem prometer previamente qualquer integração, resultado ou prazo específico.

Visual: identidade ConnectyHub, hierarquia clara, contraste adequado e botões visíveis; navegação adaptada a celular, tablet e computador; ação de agendamento acessível no celular sem cobrir o conteúdo. Usar demonstrações próprias de interfaces quando ajudarem a explicar as possibilidades.

Referências internas verificadas por leitura de código local:

| Projeto | Elementos encontrados para orientar a apresentação |
| --- | --- |
| Pilger Landing Page | Catálogo imobiliário, busca por mapa, páginas de imóveis, captação por WhatsApp, área de membros, CRM e navegação mobile específica. |
| ViralCheck | Análise de vídeos e roteiros com IA, resultados e histórico. |
| Betel Leilões | Oportunidades imobiliárias, documentos, análise assistida, relacionamento, contratos e acompanhamento pós-arremate. |
| HoraSpace | Projeto em desenvolvimento para reserva de espaços profissionais por hora, com catálogo e operação de anfitriões. |
| Vision | Estrutura de CRM/ERP automotivo, estoque, vendas e relacionamento. |

No Pilger foram inspecionadas também capturas locais `output/phase-8e-production-review/mobile-bravaconceto.png` e `desktop-one-tower.png`: resumo organizado, contraste e ações persistentes adequadas ao dispositivo. Essas observações e os demais projetos servem como repertório interno de capacidades e experiência de uso. Não copiar a identidade imobiliária nem transformar o Pilger no tema da landing page.

Não publicar nomes, logos, capturas ou dados dos projetos fornecidos como cases nesta entrega. Não inventar métricas, depoimentos ou resultados. Esta leitura é referência interna e não constitui auditoria funcional completa dos cinco projetos nem comprovação de suas publicações atuais.

Objetivo da Eliane neste fluxo: agendar a reunião. Reaproveitar os dados já conhecidos do lead e coletar de forma breve nome, empresa e uma descrição da ideia. Não exigir um questionário longo para liberar o agendamento e não perguntar orçamento ou faixa de investimento. Consultar horários reais na agenda configurada, oferecer as opções e confirmar a reserva somente após sucesso do agendamento. Se a agenda não estiver disponível, registrar a preferência e encaminhar a pendência, sem inventar uma reunião confirmada.

Não apresentar preços, estimativas, descontos, pacotes nem negociação no atendimento desse serviço personalizado. Se o interessado perguntar sobre preço, explicar: “Vamos entender sua ideia e o que o sistema precisa fazer em uma reunião. Posso te ajudar a agendar?” A regra pertence à captação de desenvolvimento personalizado; não altera o atendimento de cobrança e recarga de clientes existentes.

Guardar no arquivo do lead a origem, ideia, conversa, arquivos enviados, reunião e situação do agendamento. Evitar convites duplicados em reenvios. Preparar um resumo para quem conduzirá a reunião. Datas e horários devem informar o fuso, e confirmação e lembretes devem usar o evento efetivamente registrado.

## 7. SEO, AEO e GEO como requisito das páginas públicas

Diretriz confirmada: considerar SEO (buscas tradicionais), AEO (mecanismos de resposta) e GEO (buscas e respostas geradas por IA) em toda nova página pública e nas alterações às páginas existentes. Abrange home, soluções, landing page personalizada, documentação pública, lojas e produtos elegíveis. Não é apenas inclusão de códigos: conteúdo, estrutura, rastreabilidade e experiência de uso fazem parte da entrega.

Base encontrada no projeto: metadados globais em `src/app/layout.tsx`, utilitários em `src/lib/seo/`, sitemap com soluções/lojas/produtos, robots.txt, dados estruturados e os arquivos `llms.txt` e `llms-full.txt`. A existência desses componentes não comprova indexação nem cobertura correta de todas as rotas; verificar cada modelo de página e a configuração publicada.

Requisitos:

- Título e descrição específicos, URL canônica estável no domínio de produção, idioma, prévias sociais e hierarquia de títulos coerente. Evitar duplicatas por parâmetros de campanha ou sessão; links canônicos não devem carregar identificadores de leads.
- Conteúdo principal legível no HTML, links internos rastreáveis, navegação clara e textos originais que expliquem diretamente serviço, público, possibilidades e processo. Perguntas e respostas visíveis devem esclarecer dúvidas reais e preservar a orientação comercial sem preços para desenvolvimento personalizado.
- Dados estruturados JSON-LD compatíveis com o conteúdo visível: Organization/WebSite, Service e BreadcrumbList na oferta personalizada; WebAPI na documentação; Product e ofertas reais nas páginas de produtos aplicáveis. Não inventar preço zero, avaliações, cases ou informações ausentes para preencher um schema. Validade de schema e elegibilidade a um recurso de busca são verificações distintas.
- Atualizar sitemap, links e índices públicos quando novas páginas forem publicadas. Usar datas de modificação reais, contemplar paginação/escala do catálogo e excluir URLs privadas, não publicadas ou temporariamente indisponíveis conforme sua política de acesso.
- Garantir leitura e navegação em celular, tablet e computador, contraste, acessibilidade, imagens dimensionadas e desempenho. Medir carregamento e estabilidade visual; conteúdo importante não pode depender apenas de imagens ou animações.
- Verificar acesso dos rastreadores de busca no servidor/CDN e distinguir as configurações de busca, acesso solicitado pelo usuário e treinamento. Não alterar permissões de coleta indiscriminadamente para tentar melhorar posicionamento.
- Manter `llms.txt` e `llms-full.txt` consistentes como recursos auxiliares já existentes, sem apresentá-los como exigência ou garantia de citação por IA.
- Validar HTML renderizado, status HTTP, canonical, robots/noindex, links, sitemap e dados estruturados. Após publicação, acompanhar indexação, consultas, impressões, cliques e conversões para WhatsApp/reunião pelas ferramentas disponíveis. Encaminhar URLs novas aos mecanismos suportados sem prometer prazo de indexação.

Admin, painel do usuário, área de pagamento, chaves, arquivos e informações de leads permanecem protegidos e fora dos índices públicos. Verificar `noindex`/cabeçalhos e controles de autenticação apropriados; robots.txt sozinho não protege dados privados nem garante remoção do índice.

A documentação oficial do Google informa que as boas práticas de SEO continuam válidas para recursos de IA, sem schema ou arquivo especial obrigatório, e que inclusão e exibição não são garantidas. Portanto, o critério de aceite é a implementação validada e a medição dos resultados, não uma promessa de posição ou de citação.

Fontes verificadas em 08/09/2026:

- [Google: recursos de IA e o site](https://developers.google.com/search/docs/appearance/ai-features).
- [Google: diretrizes de dados estruturados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

## 8. Validação e sequência de entrega

1. Contratos individuais e fonte única das condições comerciais; testar renovação, descontos, créditos e bloqueio com condições diferentes em duas contas.
2. Explicação de créditos, detalhes do extrato e alertas da carteira; garantir alertas para conta que utiliza exclusivamente a API e para contratos sem franquia incluída.
3. API de IA, autenticação independente e reserva/liquidação; validar concorrência, reenvio, cancelamento, streaming, saldo insuficiente, tarifa ausente e resultado incerto.
4. Área de API, documentação e recarga; validar chaves revogadas, isolamento entre contas/projetos e recarga sem crédito duplicado.
5. Landing page sem preços, cartão de soluções personalizadas e agendamento pela Eliane; verificar 360/390 px, tablet e desktop, contraste em hover/foco, leitura e ações acessíveis. Aplicar os requisitos de SEO, AEO e GEO da seção 7 e validar as páginas públicas afetadas. Validar pedido de preço sem cotação automática, reutilização do cadastro, horários reais, conflito de agenda, confirmação, deduplicação e vínculo no arquivo do lead.
6. Piloto com projeto externo; reconciliar consumo do fornecedor, tarifa, reserva, débito, extrato e aviso. Expandir o roteamento e as capacidades por etapa.

Manter as regras de recuperação: fim do teste ou inadimplência bloqueiam os recursos contratados; produtos avulsos adquiridos e pagamento permanecem acessíveis. Regularização restaura somente recursos incluídos, sem reativar chaves revogadas manualmente. Saldo zerado e contrato vencido são estados distintos.
