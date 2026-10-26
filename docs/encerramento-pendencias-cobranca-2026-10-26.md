# Encerramento de pendências históricas — 26/10/2026

Autorização: encerrar as pendências antigas, esclarecer cliente/data/ação no
Financeiro, sem cobrança retroativa nem repetição de mensagens. Escopo: dois usos
sem tarifa de 27/09 e dois avisos de 14/09 sem confirmação de entrega. Não altera
faturas vencidas, contratos, consentimentos, tarifas ou situação bancária.

## Implementação

Migration 0217 acrescenta data e motivo de encerramento aos usos e avisos. Não
encerra registros automaticamente. Travas impedem reabertura dos marcadores,
precificação/débito posterior dos usos encerrados e retorno dos avisos à fila.
Uma trava no livro de créditos também rejeita débito ligado a uso encerrado.
Os caminhos normais de débito e claim permanecem disponíveis.

Usos mantêm estado original, unidades, erro de tarifa, modelo e valores. A ausência
de custo apurado não foi convertida em custo conhecido zero nem em entrega gratuita.
Avisos passam a `skipped`, sem próximo envio, preservando tentativas, erro original,
ausência de recibo e marca de incerteza. Encerramento não significa mensagem entregue.

Novo RPC de leitura exclusivo do serviço retorna cliente, data original e categoria
das pendências, além de histórico com motivo e data de encerramento. Não retorna
telefone, cartão, credenciais ou corpo de mensagem. Página exige admin da plataforma.
Orientações por categoria distinguem remetente, entrega incerta, tarifa, conciliação,
recarga, Pix e renovação. Horários explícitos de Brasília e referência do registro.
Histórico separado e recolhível; limites de exibição informados. Erro de consulta
não aparece como conferência bem-sucedida. Usos sem tarifa abertos não somem apenas
por terem mais de 30 dias.

## Aplicação e validação

Backup privado de schema e dos quatro registros, espelhado localmente com SHA-256
conferido. Ensaio em transação com ROLLBACK; aplicação efetiva às 18h08 BRT.
SQL operacional restrito aos quatro IDs, organizações, datas e estados conferidos;
pré-condição divergente aborta a transação. Não é um encerramento em massa por erro.

Comparação transacional confirmou identidade integral de pagamentos, tentativas,
contratos, carteiras, livro de créditos, políticas e execuções de recarga antes e
depois. Conferência dos campos originais dos quatro registros passou. Claims dos
dois avisos retornam falso; dois usos sem débito e sem agendamento de retry.
Histórico retorna quatro encerramentos e zero pendências às 18h10.

46 testes aprovados em quatro arquivos: SQL real em PGlite, fronteira de acesso,
travas contra débito/reabertura/reenvio, preservação dos fluxos normais, dados da
interface, tratamento de falha e regressões de créditos/recargas/Pix. TypeScript e
ESLint aprovados. Fixture temporária de QR da tarefa anterior foi retirada da
extensão compilável, sem alterar fonte do produto.

Rotina agendada das 18h10 concluída com resultado de negócio: todos os oito
contadores de saúde zerados; recarga conferida sem nova tentativa; zero mensagens
enviadas pela rotina de avisos dessa execução. Nenhum disparo manual de job financeiro.

Observação independente: a rotina normal já havia registrado às 18h00 uma recarga
previamente autorizada de R$47/5.000 créditos. Pagamento e tentativa `approved`,
efeitos concluídos e uma única entrada `purchase` de 5.000 créditos no livro às
18h00:19. Não foi iniciada pelos testes ou pela resolução das pendências; o
encerramento ocorreu depois. Leitura de registros locais não atesta liquidação bancária.

Código `eda1eebf` publicado no slot b às 18h18 BRT; slot a com `48e27288`
preservado. Build de 120 páginas aprovado. Candidato e domínio público validados:
SHA/saúde, páginas, 19 assets, APIs protegidas retornando 401 sem sessão e GET
assinado do Inngest com 59 funções. Navegador autenticado confirmou histórico dos
quatro registros, nomes legíveis das operações, datas e ausência desses alertas
como pendências abertas. Não foi necessário acionar nenhum fluxo financeiro.

## Limites

Não houve teste que criasse cobrança ou mensagem real. A operação normal autorizada
dos clientes continuou ativa. A mudança não dá baixa em dívidas nem confirma
homologação integral de Pix Automático. Pendências comerciais anteriores externas
a esses quatro registros permanecem com seu estado próprio.
