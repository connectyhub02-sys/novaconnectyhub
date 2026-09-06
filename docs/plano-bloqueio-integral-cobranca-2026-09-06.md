# Plano de cobrança, produtos comprados, bloqueio e memória financeira

Status: implementação executada e validada em 06/09/2026. Consulte o relatório de execução para publicação, evidências e limites da validação.

Este plano complementa a auditoria de 06/09/2026. Abrange recebimento da própria ConnectyHub, ofertas recorrentes e avulsas, acesso aos produtos comprados, suspensão dos serviços e memória financeira dos agentes.

Regra atualizada solicitada pelo usuário: quando o plano estiver suspenso por inadimplência, o painel terá somente duas áreas funcionais: **Meus produtos**, com os produtos não recorrentes já comprados e pagos pelo cliente, e **Pagamento do plano**, para regularização. API, agentes e demais serviços continuam bloqueados. Esta regra substitui a proposta anterior de permitir apenas regularização; pagar um produto avulso não quita nem reativa a assinatura mensal.

## 0. Validar o recebimento da própria ConnectyHub desde a primeira compra

O escopo inclui contratação inicial, renovação, planos com ou sem recorrência, produtos avulsos ou recorrentes, adicionais e créditos comercializados pela ConnectyHub, pelo atendimento dos agentes ou diretamente pelo painel. Os pagamentos dos leads às lojas dos clientes são outro domínio financeiro e não comprovam que a contratação da plataforma foi validada.

### Verificado em 06/09/2026, somente por leitura

- `platform_billing_settings.recurring_provider` está definido como `asaas`. As novas intenções de contratação usam essa seleção; cobranças legadas podem continuar vinculadas a outro provedor e precisam ser tratadas individualmente.
- A configuração Asaas da plataforma está em produção, com credencial e token de webhook presentes. O GET do provedor retornou webhook de platform billing habilitado e sem interrupção informada.
- Existem rotas de intenção de plano, Pix e cartão, e checkout da assinatura dentro de `/dashboard/planos/checkout/...`. O cartão Asaas usa o fluxo nativo. A aplicação exige cadastro completo e os dados de titular necessários antes da cobrança.
- Existem chamadas para avisos de intenção de compra, início de pagamento e resultado, conforme o caminho utilizado. O emissor financeiro está habilitado e a instância da Eliane está conectada.
- A consulta retornou zero pagamentos com provedor Asaas em `billing_payments` e zero registros em `billing_card_attempts`. Não existe, nessa fotografia, evidência de um ciclo completo de compra de plano via Asaas nessas tabelas. A configuração e a existência das rotas não equivalem à confirmação de recebimento em um teste real.
- O histórico de conversas do lead já é utilizado pelo agente, mas a ligação entre esse histórico, o cliente autenticado, a assinatura e os eventos financeiros atuais ainda precisa das correções da seção 5. Os 78 avisos financeiros da auditoria anterior não foram localizados no histórico persistido consultado da instância de cobrança.

### Verificação adicional: recorrência e acesso aos produtos

| Ponto verificado no código | Situação encontrada | Consequência para o plano |
|---|---|---|
| Cadastro de produtos da plataforma | Já possui `billing_cycle` com `one_time`/`recurring`, intervalo e seletor no admin | Reaproveitar o cadastro; comprovar que cobrança e acesso respeitam esses campos em cada canal |
| Cadastro de planos | Modelo, formulário e API trabalham com mensalidade; não possuem a escolha equivalente de recorrência | Adicionar pagamento único/recorrente, intervalo e condições de acesso |
| Cartão nativo para planos | Exige aceite de renovação mensal e cria acordo recorrente para o próximo mês | Criar caminho avulso que não cria assinatura no provedor nem exige aceite de renovação |
| Produtos como adicionais no checkout de plano | A disponibilidade atual filtra produtos `one_time` | Implementar recorrentes somente com preço, intervalo e consentimento efetivamente suportados; não basta mudar o filtro |
| `/dashboard/produtos` | Marketplace para importar produtos e revendê-los por comissão | Não é a área de produtos comprados pelo próprio cliente |
| Direito de acesso por compra | Não localizado, nos fluxos e migrações consultados, um vínculo independente de compra paga que autorize uma biblioteca do comprador | Implementar registro de compra/direito de acesso e biblioteca autenticada |
| Recuperação no painel | A exceção visual atual permite `/dashboard/planos` e seus descendentes | Incluir somente a biblioteca e suas operações autorizadas por item, além da regularização; revisar também servidor e banco |

Evidências: `0070_platform_product_billing_cycle.sql`, `platform-products-console.tsx`, `api/admin/platform-products/route.ts`, `billing/plans.ts`, `api/admin/billing/plans/route.ts`, `billing-plans-console.tsx`, `billing/native-card-checkout.ts`, `billing/plan-checkout.ts`, `dashboard/produtos/page.tsx`, `platform-product-sales.ts` e `connecty-shell.tsx`.

Conclusão de diagnóstico: existe parte do cadastro comercial, mas a regra completa de cobrança e acesso solicitada ainda não está comprovada nem implementada em todos esses caminhos. As tabelas de importação para revenda e de comissão não substituem o registro de compra e autorização do comprador.

### Fluxo que será implementado e validado

1. **Identificação e continuidade:** preservar a origem da conversa e o agente responsável, vincular o lead da plataforma ao cadastro autenticado de forma validada e recuperar os dados já fornecidos. Atender também a compra iniciada no painel por quem nunca conversou no WhatsApp, criando/vinculando o arquivo do lead sem duplicar pessoas.
2. **Oferta correta:** obter plano, preço, período, adicionais únicos/recorrentes e permissões do catálogo vigente. Apresentar ao cliente valor e condições reais. Não usar valores de testes anteriores, preço inventado pelo agente ou configuração de recebimento de uma loja de cliente.
3. **Checkout e cobrança:** validar que o pagamento usa a conta recebedora correta da ConnectyHub, com referência inequívoca de cliente, empresa contratante, assinatura, fatura e tentativa. Conferir Pix, cartão, troca de método, recarga da página e clique repetido sem cobranças duplicadas. Cartão permanece no checkout próprio e não é solicitado na conversa.
4. **Informação pelo WhatsApp:** enviar, pelo agente autorizado da plataforma, o resumo, valor e acesso seguro à cobrança; quando aplicável, o Pix efetivamente gerado e ainda válido. Registrar a mensagem e seu resultado de entrega. O aviso de pagamento iniciado não pode afirmar pagamento confirmado. Falha do WhatsApp não deve impedir o recebimento nem perder o evento: a cobrança continua acessível e o aviso entra em retentativa.
5. **Resultado e recebimento:** testar aprovação, pendência, recusa, cancelamento, expiração, estorno, timeout e retorno tardio. Conferir valor, recebedor e IDs no provedor e na plataforma. Uma indisponibilidade de consulta não deve ser tratada como recusa bancária nem autorizar outra cobrança enquanto o resultado estiver incerto.
6. **Liberação da compra:** após confirmação válida, aplicar uma única vez os direitos correspondentes a cada item pago: período/limites do plano, acesso ao produto ou saldo de créditos. Não usar uma função genérica que ative o plano ao receber qualquer pagamento. Uma assinatura de recorrência criada não representa pagamento recebido. Separar aprovação financeira de eventual demora técnica na liberação, para não cobrar novamente.
7. **Memória e acompanhamento:** registrar a jornada desde interesse, seleção da oferta e tentativa até pagamento e liberação. Registrar próxima cobrança somente quando houver recorrência contratada. A Eliane e os demais agentes autorizados da ConnectyHub consultarão o estado atual, além do histórico, para orientar sem pedir novamente dados conhecidos ou inventar um resultado.

A área de contratação e seus endpoints essenciais devem funcionar para cliente novo, trial expirado e conta suspensa, sem exigir uma assinatura ativa antes de conseguir comprá-la. Liberar somente o cadastro/dados necessários à contratação, mantendo os demais recursos sob a regra de acesso.

### Critério para afirmar que a ConnectyHub está recebendo corretamente

Completar a cadeia: compra iniciada → cobrança no recebedor correto → confirmação verificável → conciliação interna → direitos de cada item aplicado uma única vez → aviso WhatsApp registrado → arquivo do lead atualizado → agente consegue explicar a situação.

Incluir testes automatizados com provedor simulado e, na fase de execução, testes controlados no ambiente configurado, distinguindo seus registros de uma venda real. Registrar as evidências da primeira compra por Pix e cartão, além de uma recusa/pendência e uma retomada. Nenhuma cobrança foi gerada nesta revisão do plano.

**Entrega:** comprovação da contratação inicial e recebimento pela ConnectyHub, com comunicação e memória integradas. Este é um requisito de aceitação anterior à conclusão do trabalho de bloqueio/regularização.

## 0A. Cadastro comercial e direitos de compra independentes

### Configuração no admin

- Em planos e produtos, apresentar **Tipo de cobrança: pagamento único ou recorrente**. Para recorrentes, apresentar o intervalo e as condições de renovação. Validar as opções no servidor e mostrar preço inicial e próximas cobranças no checkout e no atendimento.
- Separar frequência de cobrança, duração do direito de acesso e forma de pagamento. Um plano vendido por pagamento único pode conceder um período de serviço definido no cadastro, sem gerar renovação automática ou dívida no mês seguinte. Pagamento único não significa liberação permanente de toda a operação.
- Para os produtos avulsos comprados, a falta de pagamento do plano mensal não remove o acesso adquirido. Qualquer condição própria de duração ou consumo do produto deve ser explícita na oferta e preservada na compra; não inventar vencimento mensal para ele.
- Manter planos existentes com as condições atuais ao migrar. Alterar o catálogo vale para novas contratações; não converter compras avulsas antigas em assinaturas nem modificar cobranças contratadas silenciosamente.
- Guardar na compra uma cópia de preço, tipo de cobrança, intervalo, duração, produto e condições aceitas. Desativar uma oferta para novas vendas não pode apagar a compra ou seu conteúdo já adquirido.

### Registro de compras e área Meus produtos

Criar registros distintos para pedido/itens, cobrança/tentativas e direito de acesso. Cada direito terá comprador autenticado, escopo da conta contratante quando aplicável, item de origem, produto, confirmação financeira, condições de uso e estado de acesso. O vínculo com o lead servirá à continuidade do atendimento; telefone ou cookie isolado não autoriza abrir conteúdo pago.

A área **Meus produtos** será acessível dentro do painel mesmo sem assinatura mensal ativa, inclusive para quem comprou um avulso e nunca contratou um plano. Mostrar e abrir somente os itens avulsos pagos daquele comprador, com conteúdo, arquivos ou instruções de entrega correspondentes. Não expor o marketplace de revenda, catálogo administrativo, CRM ou outros módulos operacionais por essa exceção.

Aplicar autorização por compra também aos endpoints, arquivos privados e demais recursos necessários ao uso do produto. Material pago não deve ficar em mídia pública de divulgação nem depender de uma URL facilmente compartilhável. Definir acesso de membros da empresa explicitamente; não compartilhar todas as compras entre contas que apenas têm o mesmo nome, telefone semelhante ou titular.

| Situação do item | Direito concedido |
|---|---|
| Produto avulso com pagamento confirmado | Acesso ao item adquirido, preservado durante inadimplência do plano mensal |
| Produto avulso pendente, recusado ou cancelado antes do pagamento | Não liberar conteúdo |
| Produto avulso e plano no mesmo checkout | Direitos separados por item; produto não entra nas próximas mensalidades |
| Produto recorrente | Cobranças e acesso conforme seu próprio contrato; não usar a exceção reservada aos avulsos para desbloquear a operação suspensa |
| Pacote avulso de créditos | Preservar compra e saldo; utilização de API/IA continua exigindo o plano aplicável ativo |
| Estorno, reembolso ou disputa do produto | Aplicar a política ao item afetado após conciliação; não retirar outras compras nem alterar o plano por engano |

Compras históricas exigem migração baseada em pagamentos confirmados e itens identificados. Casos sem evidência suficiente entram em conferência; não conceder acesso apenas por existir um produto importado para revenda ou uma comissão registrada.

**Entrega:** catálogo configurável, compra avulsa sem recorrência indevida e biblioteca que permanece acessível sem abrir os serviços suspensos.

## 1. Regra comercial única

Criar uma decisão central de autorização que combine estado contratual e direitos por compra. Para assinatura: ativa, em carência, suspensa por inadimplência, cancelada ou suspensa administrativamente. Cada decisão terá motivo, vencimento, instante exato do bloqueio, origem e versão da política, além das permissões separadas de operação, regularização e acesso ao produto adquirido.

Premissa desta proposta: preservar a configuração comercial encontrada — avisos a partir de três dias antes e três dias de carência depois do vencimento — corrigindo o erro que concede quatro dias. Calcular o bloqueio por data/hora, sem arredondar dias. Dar suporte também a carência zero, sem ativá-la silenciosamente. Exibir datas em Brasília e armazenar instantes em UTC.

Ativação manual concede um período definido e continua sujeita à mesma regra. Uma eventual cortesia precisa ter prazo, justificativa e responsável explícitos. Histórico de ativação manual não será tratado como pagamento confirmado ou liberação permanente.

Separar situação da assinatura de saldo/cota de consumo e acesso aos produtos avulsos pagos. Uma assinatura suspensa bloqueia todos os recursos operacionais cobertos, mesmo com créditos disponíveis, preservando a biblioteca de compras avulsas. Uma assinatura ativa que usa somente API não deve ser marcada como inadimplente por não usar agentes ou por regras de consumo exclusivas de IA.

O bloqueio seguirá a unidade contratual: todas as empresas, membros, instâncias, agentes e integrações cobertos pela assinatura. Resolver essa associação explicitamente no cadastro comercial. Uma empresa nova ou um colaborador diferente não pode escapar da suspensão; outra assinatura independente e paga não deve ser bloqueada apenas por compartilhar o titular.

**Entrega:** função central de autorização e vínculo claro entre assinatura e recursos contratados, utilizado em todos os canais.

## 2. Bloqueio operacional com duas áreas permitidas

| Superfície | Durante a suspensão |
|---|---|
| Painel do cliente | Mostrar somente Meus produtos avulsos pagos e Pagamento do plano, sem carregar os demais módulos |
| Biblioteca de compras avulsas | Permitir consulta e uso apenas dos itens próprios com direito válido; se não houver compras, mostrar estado vazio |
| APIs e arquivos da biblioteca | Autorizar especificamente o produto comprado, sem liberar APIs operacionais ou arquivos de outros módulos |
| URLs internas, ações do servidor e APIs do painel | Negar leitura e alteração operacional; não depender da interface visual |
| API pública e proxy do provedor | Bloquear todos os endpoints operacionais, inclusive consultas, contatos, mensagens, instâncias, status operacional, relatórios e administração de webhooks |
| Chaves já existentes e integrações externas | Permanecem incapazes de operar, mesmo com token válido e sem login no painel |
| Agentes, IA, voz, atendimento manual e automático | Impedir novas execuções e envios pelo serviço contratado |
| Campanhas, automações, importações e tarefas agendadas | Suspender execução e revalidar tarefas já enfileiradas |
| Webhooks de integração entregues ao cliente | Suspender entregas e retentativas operacionais |
| Loja, páginas comerciais e checkout da empresa suspensa | Suspender operação comercial e novas vendas; apresentar indisponibilidade neutra, sem expor a dívida aos leads |
| Dados, arquivos e histórico dos módulos operacionais | Preservar; bloquear consulta e exportação pelo cliente enquanto suspenso. Conteúdo dos avulsos pagos segue sua autorização própria |
| Autenticação e recuperação de senha | Disponíveis para conseguir acessar a regularização |
| Financeiro da assinatura ConnectyHub | Consultar dívida, corrigir dados estritamente necessários, pagar, acompanhar confirmação e acessar suporte financeiro |
| Sair da conta | Disponível |

Essa lista deverá virar uma lista explícita de rotas e ações permitidas. Não liberar um módulo inteiro de “Minha conta”, “Planos”, “Produtos” ou um prefixo de API por conveniência: somente regularização e uso dos avulsos já pagos. Login, recuperação de senha e saída são operações auxiliares dessas duas áreas, não uma abertura de outros módulos. Compra isolada de produto ou créditos não desbloqueia assinatura inadimplente.

Os serviços internos que recebem e conciliam pagamentos continuam ativos. O bloqueio não pode impedir que o Asaas informe o pagamento da própria assinatura. Também é necessário registrar confirmações/estornos de pedidos de leads já iniciados antes da suspensão, sem reativar as funcionalidades comerciais do cliente. Um Pix já emitido pode ser pago fora da plataforma; seu webhook precisa ser conciliado. Esses processamentos internos não constituem acesso operacional liberado ao cliente.

A ingestão mínima de eventos já recebidos e seu arquivamento deve preservar a jornada do lead. Suspender respostas automáticas, entregas de integração e ações comerciais; não descartar evidências financeiras ou mensagens que o sistema já recebeu.

**Entrega:** matriz com acesso comprovado à regularização e aos próprios avulsos pagos, e negativa nos demais recursos suspensos.

## 3. Aplicação no servidor, na API e nas filas

### Painel e acesso aos dados

- Aplicar a autorização perto de cada leitura e operação, além do redirecionamento da interface. Revisar Route Handlers, Server Actions, consultas de páginas e acesso direto ao Supabase.
- Revisar RLS, RPCs, Storage, downloads e canais em tempo real para impedir que sessão antiga ou chamada direta contorne o bloqueio. Encerrar assinaturas de dados operacionais e impedir novas autorizações de arquivos desses módulos após suspensão. A biblioteca terá autorização independente por item pago; uma regra global baseada em empresa inativa não pode bloquear seus próprios arquivos. URLs assinadas exigem validade curta ou distribuição autenticada para limitar acesso após revogação do direito correspondente.
- Não entregar dados operacionais na carga inicial da página para depois cobri-los com um aviso. Invalidar cache de autorização em alteração financeira; nenhuma decisão em cache pode valer além de `bloqueio_em`.
- Na sessão administrativa, indicar claramente a situação que o cliente vê. Ferramentas internas de suporte podem inspecionar a conta com auditoria, mas ações que executam os serviços do cliente respeitam o bloqueio até uma liberação administrativa explícita e registrada.

### API e provedor

- Reutilizar a autenticação existente em `authenticateGatewayRequest`, substituindo a decisão financeira por aquela da seção 1. Cobrir todos os métodos HTTP e caminhos do proxy, sem exceção para clientes sem agentes.
- Para credencial válida suspensa por cobrança, retornar erro consistente de pagamento necessário, com HTTP 402, código compatível `billing_access_required`, motivo e endereço autenticado de regularização. Credencial inválida continua sendo erro de autenticação. Não encaminhar a requisição ao provedor nem consumir recursos operacionais após a negativa.
- Pausar clientes API, chaves e endpoints de webhook como efeito da suspensão. Essa pausa persistida reforça o bloqueio; a requisição já deve negar pelo vencimento exato, sem esperar a rotina de sincronização de 15 minutos.
- Revisar acessos diretos ao provedor. O projeto possui um fluxo de migração assistida que pode revelar token de instância. Identificar instâncias com credenciais entregues e verificar se continuam utilizáveis fora do gateway. Quando houver esse caminho, incluir suspensão no provedor ou rotação controlada da credencial, conforme suas capacidades verificadas. Bloquear apenas a chave ConnectyHub não impede uso de um token independente já copiado.
- Preservar configurações e registrar quais recursos foram pausados por cobrança. Não apagar chaves, instâncias, contatos ou histórico. Credenciais revogadas por segurança nunca serão restauradas por um pagamento.

### Processamento assíncrono

- Verificar autorização ao receber uma solicitação, ao retirar o trabalho da fila e imediatamente antes de enviar ao provedor.
- Cobrir campanhas, tarefas recorrentes, respostas de agentes, geração de mídia, sincronizações, entregas e retries de webhooks. Jobs antigos não podem operar depois do prazo por terem sido agendados antes dele.
- Parar reenvios automáticos de tarefas vencidas e marcar a razão da suspensão. Reativar uma assinatura não dispara em lote mensagens ou campanhas antigas sem verificar validade e evitar duplicidade.
- Operações já aceitas por um provedor antes do bloqueio exigem conciliação; não prometer desfazer um envio ou pagamento que já ocorreu externamente.
- Se a verificação de autorização estiver indisponível, retornar erro temporário e não executar a operação. Registrar indisponibilidade separadamente de inadimplência, sem suspender cadastros por uma falha técnica transitória.

**Entrega:** bloqueio comprovado sem navegador aberto, com sessão antiga, chave existente, fila anterior ao vencimento e eventual credencial direta de provedor.

## 4. Cobrança por ciclo e estados consistentes

- Para compra avulsa, criar somente a cobrança daquela compra. Não criar assinatura externa, próxima fatura, aviso de renovação ou cancelamento mensal. Parcelamento de um valor único, se oferecido, não equivale a uma assinatura recorrente.
- Para oferta recorrente, aplicar intervalo e valores contratados, com consentimento e cobrança suportada pelo método/provedor. Separar geração periódica de Pix de débito automático autorizado; um Pix comum pago não autoriza cobranças automáticas futuras.
- Em carrinho misto e order bump, separar valor inicial dos próximos ciclos e manter direitos por item. Não incluir novamente os avulsos na mensalidade. Intervalos incompatíveis exigem contratos/cobranças separados e total claro para o cliente, sem conversão silenciosa para mensal.
- Criar/reutilizar uma fatura de renovação identificada pela assinatura e pelo ciclo correto. Não reaproveitar uma fatura inicial recusada apenas porque permite outra tentativa.
- Corrigir a situação exemplificada pelo Gustavo: separar a fatura antiga de teste do valor e período atuais. Preservar o histórico e preparar a cobrança correta de renovação.
- Alinhar seleção de provedor e tipo de cobrança nos cadastros atuais, incluindo a renovação legada da Betel. Não criar uma segunda cobrança externa quando já existir uma válida para o mesmo ciclo.
- Reconciliar pagamento, itens comprados, direitos de produto, assinatura e período de acesso de forma transacional e idempotente. Efeitos externos terão fila persistente com retentativas e confirmação de execução. A lógica de compra avulsa não altera o estado global da empresa para ativa.
- Cobrir cancelamento no provedor, pagamento confirmado, recusa, pendência, estorno e suspensão administrativa. Cancelar a recorrência futura e interromper um período já pago precisam ser estados distintos, para não retirar acesso pago nem conceder acesso após o fim do direito contratado.
- Corrigir gravação parcial e corrida entre pagamento e bloqueio. Uma confirmação nova não pode ser sobrescrita por uma rotina que leu dados antigos.
- Paginar todas as assinaturas e clientes API, evitando limites que deixem sempre os mesmos registros antigos no início da fila.

**Entrega:** cobrança única ou por ciclo conforme contratado, e direitos consistentes por serviço/produto, independentemente do canal que recebeu a atualização.

## 5. Avisos e memória da Eliane

- Programar lembretes em D−3, D−2, D−1, vencimento, carência e suspensão conforme a política aplicável; informar data e hora do bloqueio a partir da mesma decisão usada pela autorização.
- Deduplicar por assinatura, ciclo, evento, destinatário e dia de Brasília. Separar o aviso do titular das cópias previstas para responsáveis.
- Revalidar dívida e situação antes de enviar. Cancelar lembretes antigos após pagamento, substituição de cobrança ou alteração do ciclo.
- Implementar retentativas reais com limite e intervalo, tratamento de falhas e alerta interno. Distinguir agendado, envio aceito, entregue e lido quando o provedor disponibilizar esses estados.
- Vincular o cliente a um lead da própria ConnectyHub com identidade validada e lista das contas que ele pode consultar. Resolver nomes/vínculos inconsistentes antes de apresentar dados financeiros. Não associar clientes só pelo nome ou pelos últimos dígitos do telefone.
- Registrar no arquivo do lead avisos, mudanças de plano e prazo, ativação manual, pagamentos, carência, suspensão, motivos, regularização e retorno do acesso. Incluir conteúdo, data, agente, identificação da mensagem e resultado de entrega.
- Registrar também compra de produto, condição avulsa/recorrente, liberação, acesso ao conteúdo, download quando aplicável, alteração/revogação de direito e reembolso. O arquivo do lead reunirá a jornada, mas a autorização consultará os registros atuais de compra e pagamento.
- Incluir primeira intenção de compra, plano escolhido, visita ao checkout, adicionais selecionados, troca de método, tentativa, abandono, retomada e ativação inicial. Preservar conversas, arquivos e comprovantes pela estrutura de jornada existente. Dados completos do cartão e CVV não integram o CRM, a memória do agente ou logs; registrar apenas referência segura, bandeira e final do cartão quando disponíveis.
- Compartilhar os dados do mesmo lead entre agentes autorizados da plataforma com vínculo de identidade e permissões corretos. Usar consulta atual ao financeiro como fonte do estado da conta; resumos antigos ou a última mensagem automática não são prova de quitação. Manter isolamento em relação aos leads das empresas clientes.
- A Eliane consultará situação do plano e produtos adquiridos antes de responder sobre a conta. Exemplo: “Seu plano venceu e os serviços estão suspensos. Seus produtos avulsos já pagos continuam disponíveis em Meus produtos. Você pode regularizar o plano por este link.” Informar somente direitos efetivamente existentes; se a pessoa pagou apenas um produto, explicar que a mensalidade continua pendente.
- Comprovante ou afirmação do cliente não libera recursos. Se houver divergência, manter o estado confirmado e abrir conferência humana no arquivo do lead, sem inventar saldo bancário, motivo da recusa ou confirmação de recebimento.

**Entrega:** o aviso enviado, o que aparece no financeiro, o arquivo do lead e a resposta da Eliane descrevem o mesmo estado.

## 6. Regularização e retorno ao serviço

Ao receber confirmação válida da regularização do plano, reconciliar a cobrança e o período, remover a suspensão financeira e invalidar decisões antigas de acesso. Restaurar somente os recursos que foram pausados por cobrança e continuam incluídos no plano.

Pagamento de produto avulso libera apenas o item correspondente. Não remove inadimplência do plano, não reativa API/agentes e não altera próximas mensalidades. Da mesma forma, suspender o plano não revoga os produtos avulsos pagos. Processar reembolsos por item para que uma devolução de produto não cancele serviços ou compras sem relação com ela.

Nunca reativar automaticamente uma chave revogada, uma campanha encerrada, uma suspensão administrativa ou um serviço indisponível no novo plano. Restaurar integrações preservando suas configurações; eventual reconexão exigida pelo provedor deve ser apresentada com clareza.

Registrar os efeitos e confirmar que foram aplicados antes de a Eliane anunciar que todos os serviços voltaram. Se parte estiver em recuperação, informar o estado real e alertar a operação. Manter pagamento e recuperação técnica como estados separados para não cobrar novamente um cliente que já pagou.

**Entrega:** cliente paga dentro da regularização da ConnectyHub e recupera os recursos autorizados sem recriar sua conta ou perder histórico.

## 7. Testes e publicação

Usar dados controlados e provedores simulados nos testes automatizados. Os testes de interface verificarão regularização e biblioteca; testes de servidor garantirão que o bloqueio e as exceções por produto não são apenas visuais.

| Cenário | Resultado exigido |
|---|---|
| Admin configura plano ou produto como avulso/recorrente | Cadastro, checkout, cobrança e direitos respeitam a escolha; duração de acesso explícita |
| Compra avulsa por Pix e por cartão | Recebimento conciliado e item liberado, sem criar recorrência ou renovar plano |
| Cliente nunca teve plano, mas comprou um avulso | Login no painel e acesso à biblioteca do item pago, sem exigir mensalidade |
| Mensalidade suspensa e vários avulsos pagos | Somente biblioteca dos próprios itens e pagamento do plano disponíveis |
| Mensalidade suspensa e nenhum produto comprado | Regularização e biblioteca vazia; nenhum módulo operacional disponível |
| Avulso pendente, recusado ou comprovante sem confirmação | Não concede acesso ao produto nem ao plano |
| Recorrente pago durante suspensão do plano | Não ganha a exceção dos avulsos nem reativa API/agentes indevidamente |
| Plano não recorrente com período definido | Concede somente o período contratado, sem criar mensalidade futura |
| Plano com produto avulso no mesmo pagamento | Libera direitos separados e exclui o avulso dos ciclos seguintes |
| Alteração/desativação do catálogo após compra | Preserva condições e acesso adquiridos; sem recorrência retroativa |
| Reembolso parcial ou evento antigo/duplicado | Afeta somente os itens corretos, sem duplicar direitos ou regredir quitação válida |
| Usuário tenta URL/arquivo de compra alheia | Acesso negado mesmo conhecendo produto, pedido, telefone ou link |
| Migração de venda antiga para biblioteca | Exige comprador e pagamento confirmados; importação para revenda não concede direito |
| Cliente novo compra plano por Pix | Cobrança no recebedor ConnectyHub, confirmação, plano correto e WhatsApp/CRM atualizados |
| Cliente novo compra plano por cartão no painel | Checkout próprio, aprovação e ativação únicas, sem duplicar cobrança ou recorrência |
| Compra iniciada pelo agente ou diretamente no painel | Mesmo cliente/lead identificado com dados e jornada preservados |
| Cadastro incompleto, trial expirado ou conta suspensa | Consegue preencher o necessário e pagar sem acesso indevido aos outros módulos |
| Adicional único e adicional recorrente | Total inicial e valor das próximas cobranças calculados corretamente |
| Pix pendente, troca para cartão, duplo clique ou recarga | Estado consistente e ausência de duplicidade de cobrança |
| WhatsApp indisponível após pagamento aprovado | Pagamento/ativação preservados, aviso registrado para retentativa |
| Cliente pergunta a outro agente sobre o pagamento | Agente autorizado consulta o mesmo lead e a situação financeira atual |
| Cliente usa somente API e não tem agentes | Suspende no prazo e não consegue consultar ou operar endpoints |
| Ativação manual | Mesmo bloqueio ao terminar o período e a carência |
| Um instante antes/no/depois do prazo | Regra exata, inclusive carência zero e três dias |
| Navegador fechado e chave antiga válida | Operação bloqueada sem depender do painel |
| URL direta, ação do servidor, RPC e canal em tempo real | Nenhuma leitura/ação operacional contorna o bloqueio |
| Trabalho enfileirado antes do bloqueio | Não envia, entrega nem executa depois do prazo |
| Integração que recebeu token direto de provedor | Sem acesso residual por fora do gateway após aplicar a medida necessária |
| Créditos positivos e assinatura suspensa | Saldo preservado; API/IA bloqueadas; acesso aos avulsos pagos permanece |
| Assinatura ativa somente API | Consumo de IA não é confundido com inadimplência |
| Pagamento recusado, pendente ou comprovante enviado | Continua suspenso até confirmação válida |
| Pagamento simultâneo ao bloqueio | Estado final correto, sem cobrança/liberação duplicada |
| Webhook duplicado, atrasado ou fora de ordem | Não perde pagamento, não regride estado e não duplica efeitos |
| Cancelamento da recorrência e período já pago | Acesso respeita o direito do período e termina no prazo correto |
| Falha de envio de aviso ou banco temporariamente indisponível | Não abre operação; retentativa/alerta sem inventar dívida |
| Mesmo titular com várias empresas/assinaturas | Cobertura contratual correta, sem fuga e sem bloqueio de contrato independente pago |
| Mais de cem assinaturas e duzentos clientes API | Todos processados com paginação |
| Regularização | Somente suspensões financeiras elegíveis são removidas; Eliane e CRM atualizados |

Antes da publicação, gerar uma prévia de impacto sobre todos os cadastros atuais, indicando empresas e recursos que mudariam de estado. Conferir BuffaloMass, Betel e Guilherme como casos obrigatórios, incluindo integração sem agente. A fotografia da auditoria anterior não deve ser usada para suspender alguém sem reconferir pagamentos e alterações posteriores.

Publicar cadastro comercial, direitos de compra, biblioteca e guardas de forma coordenada. Não ativar o bloqueio integral antes de assegurar o acesso aos avulsos pagos. Acompanhar divergências entre situação financeira e acesso, compras não liberadas, chamadas negadas da API, retomadas incompletas, notificações duplicadas e erros de conciliação. Não usar uma liberação global como forma de reverter um problema; manter as proteções e reconciliar os casos afetados.

## Sequência de execução e pontos do projeto

1. Mapear recebimento ConnectyHub, cobertura contratual e compras atuais. Modelar direitos por item e recorrência nos planos, com migração compatível em banco, `billing/plans.ts`, API/admin de planos e catálogo de produtos. Não presumir que produto importado é compra paga.
2. Implementar os caminhos único e recorrente em `dashboard/billing/plan-intent`, rotas Pix/cartão, `native-card-checkout.ts`, `plan-checkout.ts` e `platform-billing-webhook.ts`. Integrar vendas diretas da plataforma e produtos vendidos por seus agentes ao mesmo registro de compra; preservar recebedor e comissões quando houver intermediação.
3. Criar a biblioteca Meus produtos com acesso autenticado aos próprios itens e conteúdo privado. Implementar a decisão central em `billing/trial.ts`, `billing/access-control.ts`, `billing/plan-entitlements.ts` e `billing/renewal-policy.ts`, combinando plano e direitos de compra.
4. Aplicar guardas do painel/dados, API e filas em `connecty-shell.tsx`, handlers de dashboard e `/api/v1`, `connectyhub-api/gateway.ts`, `connectyhub-api/access-sync.ts` e Inngest. Permitir somente as duas áreas autorizadas; tratar credenciais de provedor já entregues.
5. Corrigir ciclos e avisos em `paid-lifecycle-notifications.ts`; integrar arquivo do lead da plataforma e contexto financeiro/produtos da Eliane em `whatsapp/agent-runtime.ts`, com vínculo de identidade validado.
6. Executar a matriz de testes, produzir prévia atualizada de impacto e publicar o conjunto validado, incluindo preservação das compras existentes.

Os guias locais do Next.js instalado foram consultados para fundamentar a autorização perto dos dados; redirecionamento no Proxy e bloqueio apenas em layout não serão tratados como proteção suficiente.

Referência de diagnóstico: [auditoria anterior](C:/Users/conne/Documents/ConnectyHub/docs/auditoria-bloqueio-cobranca-contas-2026-09-06.md). Este documento registra o escopo aprovado. O resultado da execução está em `execucao-contratos-cobranca-2026-09-06.md`.
