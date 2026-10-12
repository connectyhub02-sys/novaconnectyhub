# Meta Ads por empresa — 12/10/2026

## Escopo e fontes

As páginas `/admin/trafego/meta-ads` e `/dashboard/trafego/meta-ads` usam agora
`MetaAdsAnalyticsPanel` e a API autenticada `/api/dashboard/meta-analytics`.
O admin consulta a organização interna Meta; o cliente consulta exclusivamente
a organização do workspace. O parâmetro companyId não permite escolher outra
empresa. O servidor exige vínculo, acesso de cobrança e plano elegível.

A conexão oficial `organization_integrations` + credenciais criptografadas da
organização substitui a fonte global nessas duas páginas. O seletor permite
consultar as contas autorizadas dessa conexão e verifica o acesso atual no
Graph. Trocar o filtro não altera o ativo salvo nem a conta do Pixel/MCP.

Períodos de 7, 30, 90 dias ou intervalo personalizado de até 90 dias. As datas
usam o fuso da conta, inclusive nos filtros locais do CRM e CAPI. Fonte e
horário da consulta ficam visíveis. Consultas Graph são GET, limitadas a
metadados da conta e Insights; não criam anúncios ou alteram orçamento.

Medidas separadas:

- Meta Insights: investimento, impressões, cliques, CTR, CPC, CPM, leads,
  compras, valor atribuído, CPL e ROAS. Usa atribuição dos conjuntos e data da
  conversão; não soma aliases agregados e específicos da mesma ação.
- CRM: importações de formulários da Página conectada recebidas no período,
  incluindo testes; não são atribuídas automaticamente à conta de anúncios.
- Pixel/CAPI: configuração por empresa e contagens exatas de recibos do
  servidor, separando teste e produção, falhas, fila e cancelamentos. Não soma
  eventos de outros Pixels nem de outras empresas. Se o relatório usa outra
  conta, informa que o Pixel salvo pertence à conta da conexão.

Falhas não viram zeros. Uma conta sem Insights mostra conexão confirmada e
ausência de métricas. A paginação permanece no host Graph e recusa totais
parciais quando incompleta ou acima do limite de 2.000 registros.

Pixel e Lead Ads/MCP mantêm seus recursos em seções recolhíveis. O painel
MCP/Lead Ads passou a receber companyId para preservar o workspace na sessão
assistida de admin, em vez de consultar involuntariamente a operação interna.

## Análise assistida

O botão opcional de IA usa a rota de geração/medição existente e informa o
consumo de créditos. Para Meta, essa rota consulta novamente o relatório da
empresa/conta/período; não recebe métricas arbitrárias do navegador nem usa a
fonte global antiga. Sem campanhas com métricas, não chama o modelo. O prompt
separa atribuição, importações e testes, não apresenta nota de desempenho
inventada e trata nomes de campanha como dados não confiáveis. Não há execução
automática de recomendações.

## Verificação local

41 testes dirigidos passaram (cinco arquivos): métricas, aliases, ratios,
períodos/fuso/DST, paginação, Graph somente leitura, fontes locais com falhas,
contas permitidas, isolamento de tenant, sessão assistida e plano no endpoint,
além das regressões do Pixel e da restrição de contas dos avaliadores.
TypeScript e ESLint passaram.

## Validação externa

No Chrome Connecty, sessão admin da operação interna: conta
`act_447324504473617`, moeda USD e fuso Etc/GMT+0 retornados pela Meta.
Últimos 30/7 dias: 3 leads importados e 2 eventos CAPI de teste recebidos;
nenhuma métrica de campanha, zero eventos de produção/falhas/fila. Consulta
personalizada em 10/10/2026 mostrou zero leads e zero eventos, confirmando o
filtro temporal. Período restaurado para 30 dias. Diagnóstico abriu e fechou;
IA permaneceu desabilitada por falta de métricas.

No Chrome connectyhub02, sessão do próprio usuário meta-review (sem acesso
assistido de administrador): conta `act_38906178892358750`, BRL e
America/Sao_Paulo. Relatório exibiu 4 leads da Página `839794832549513` e 7
eventos de teste do Pixel `3238629089675785`, sem falhas/fila ou eventos de
produção. Os 3 leads/2 eventos da operação interna não apareceram aqui.

A lista restrita de rotas do grant de avaliação precisou incluir exatamente
`/dashboard/trafego/meta-ads` e `/api/dashboard/meta-analytics`. Não foram
liberadas rotas de execução ou áreas externas à avaliação.

O inventário OAuth USER da revisão enumerava outras contas. O inventário
persistido foi reduzido à conta selecionada de testes (UPDATE de uma única
organization_integrations da empresa `4cd0a6bd-4e3c-4773-a9ef-511c802b48df`),
sem alterar token, ativos selecionados ou concessões no portal Meta. A API
deriva selectedAccountOnly do app_metadata confiável: após reconexão, continua
sem listar/consultar outras contas para esse usuário, mesmo se um parâmetro do
navegador tentar desligar a restrição. Testes cobrem essa tentativa e impedem
a chamada Graph a outra conta presente no inventário.

Capturas: `output/meta-analytics-20261012/admin-analytics.png` e
`client-analytics.png`. Produção confirmada em 12/10/2026 às 01h50 BRT:
`a46a0a607473633c75049641cdc555cefc30a0cb`, slot a/3130. Fallback b/3131
`693917f9c66e6c57b25a91f9be6d775f39a08469`. Build e smoke público passaram;
Inngest autenticado confirmou 58 funções, registro concluído e builder parado.
As duas sessões foram recarregadas e confirmadas na versão final.

Nenhum anúncio, pagamento, envio de mensagem ou novo evento de conversão foi
criado nestes testes. As duas contas consultadas não têm métricas de campanhas
no período; histórico pago real, tabela/gráfico com resultados reais e geração
de análise pelo modelo continuam sem validação externa nesta rodada. Os
cálculos com métricas positivas foram cobertos por testes controlados.

## Limites preservados

O consolidado antigo multicanal `/admin/trafego` e os fluxos Google continuam
fora desta alteração; suas fontes legadas não foram migradas. Este relatório
nunca combina moedas entre contas. Sem histórico pago não se valida retorno
financeiro real. Não houve nova permissão, anúncio, pagamento ou migração SQL.
App Review e liberação externa continuam dependentes da Meta.

Referências oficiais consultadas:
[Insights](https://www.postman.com/meta/facebook-marketing-api/request/u38qbri/get-insight-details-from-an-adaccount-l4),
[atribuição](https://www.postman.com/meta/facebook-marketing-api/request/5wdl62t/attributionsetting).
