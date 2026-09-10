# Remetente dos avisos da conta

## Regra implementada

O remetente é escolhido no momento do envio, inclusive para avisos já agendados. A preferência pertence à conta de faturamento compartilhada, não a uma carteira por agente.

- **Automático (padrão):** usa o primeiro agente WhatsApp disponível da conta, em ordem estável de cadastro. Se não houver agente disponível, usa o WhatsApp da plataforma.
- **Agente escolhido:** usa esse agente enquanto estiver disponível. Se ele for removido, pausado ou estiver sem conexão, a plataforma assume.
- **Sempre ConnectyHub:** usa o WhatsApp configurado na plataforma, mesmo quando existem agentes do cliente.

A seleção verifica o vínculo entre agente, instância e empresa da mesma conta, o estado online do agente, seu comportamento habilitado e a conexão WhatsApp. Não usa instâncias antigas substituídas nem envia para o próprio número do remetente.

O WhatsApp configurado pela automação continua sendo a primeira opção da plataforma; se indisponível, é consultado o WhatsApp global de cobrança. O controle global de ativação das notificações permanece respeitado. Se nenhum canal estiver disponível, o aviso registra falha e segue as tentativas já existentes; não é apresentado como enviado.

## Cobertura

O ponto comum de envio de avisos passou a usar essa regra: início/conversão do teste, planos, créditos, pagamentos, vencimentos e notificações financeiras para responsáveis. Contas sem agente, incluindo clientes que usam somente API, continuam com a plataforma.

Os textos são enviados diretamente, sem geração de IA ou débito de créditos. A escolha e o envio não exigem saldo positivo nem contrato vigente. Continuam valendo os destinatários, preferências, textos e controles de aviso já existentes.

Essa regra substitui a proposta anterior de nunca usar a plataforma como alternativa para avisos de créditos. O usuário definiu agora a plataforma como canal de contingência para todos esses avisos.

## Configuração

Nova seção **“Quem envia os avisos da sua conta?”** em **Minha conta**. Somente o titular pode alterar a preferência. Membros da conta podem consultá-la. Empresas vinculadas à mesma conta de faturamento compartilham a escolha, com validação do proprietário.

O endpoint `/api/dashboard/notification-sender` retorna apenas preferência, nomes e disponibilidade dos agentes; não expõe credenciais nem dados internos da conexão. Conta e usuário são obtidos da sessão. A migração também valida o vínculo do agente com a conta e restringe a tabela ao servidor.

## Entrega e duplicação

A reserva transacional do aviso existente (`claim_billing_notice`) permanece única. Depois de uma falha definitiva de envio pelo agente, pode ocorrer uma tentativa pelo WhatsApp da plataforma dentro do mesmo aviso. Falhas de rede ou resultados incertos não provocam reenvio imediato por outro número: ficam para conferência, evitando duplicação.

O registro informa o agente e a instância efetivamente usados, a origem do remetente e quando houve troca após falha. O processador de pendências conta como enviados apenas os envios concluídos.

## Validação

- 64 testes aprovados em sete arquivos: seleção automática e explícita, contas só API, agente removido/desconectado/pausado, titular e isolamento entre contas, regras SQL, envio com saldo zero sem cobrança, troca após recusa definitiva e ausência de duplicação em timeout/concorrência, além de regressões de cobrança/Pix/carteira.
- QA com Playwright em 360, 390, 768 e 1440 pixels, verificando seleção, persistência, conta só API, leitura sem permissão de alteração, erro e recuperação; sem overflow ou erros JavaScript.
- Prévia com dados simulados em `tmp/notification-sender-qa/`. A página temporária de QA foi removida.
- ESLint sem erros; aviso preexistente de função `addMonths` não utilizada no arquivo de cobrança.
- Build de produção Next.js aprovado, incluindo TypeScript e geração das páginas, sem a rota temporária de QA.

## Publicação

Implementação local. Nenhuma mensagem real foi enviada e nenhuma configuração de cliente foi alterada. A migração `0120_notification_sender_preferences.sql` precisa ser aplicada antes da publicação do código. A preferência ausente equivale a automático; não é necessário cadastrar políticas para cada cliente.

Não houve push ou deploy desta alteração nesta etapa. A ativação operacional deve conferir os remetentes reais e os resultados registrados após publicação.
