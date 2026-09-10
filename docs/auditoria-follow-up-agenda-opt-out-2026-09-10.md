# Follow-up, agenda e saída da lista — 10/09/2026

## Situação encontrada

O sistema usa fila persistente (`automation_dispatches`) e eventos Inngest para follow-ups. Recuperação de pedido abandonado, pós-venda, recontato, retornos e recomendações convergem no executor `proactive-followup.ts`. Ele confere conexão, agente responsável, contexto da conversa, atendimento humano, preferência de contato, janela de envio, situação financeira e mudanças ocorridas durante a geração da mensagem. Há uma revisão final antes do envio. Mensagens com entrega incerta não são reenviadas indiscriminadamente.

A agenda possui preparação e envio próprios (`customer_agenda_notices`), com ações de confirmar, remarcar e cancelar. Avisos operacionais aos responsáveis são diferentes dos lembretes enviados ao lead. Reuniões de software personalizado usam uma terceira fila (`custom_software_meeting_notices`).

As lacunas eram:

- Follow-ups e lembretes não traziam uma opção de saída.
- Preferências eram verificadas de formas diferentes. Reuniões personalizadas não verificavam a marcação antiga `opt_out.requested_at`.
- A saída reconhecida pelo agente era salva depois da resposta de confirmação; uma falha no envio podia impedir o registro.
- Não havia uma operação comum que cancelasse os contatos pendentes das três filas e mostrasse essa decisão no arquivo do lead.

## Consulta ao banco configurado

Leitura feita em 10/09/2026, sem alterações nem mensagens de teste para contatos reais:

| Fila | Enviados | Pendentes | Em envio | Incertos | Falhas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Follow-ups | 1 | 0 | 0 | 0 | 0 |
| Avisos da agenda | 0 | 0 | não consultado | 0 | 0 |
| Reuniões personalizadas | 0 | 0 | não consultado | 0 | não se aplica à classificação desta fila |

São registros da aplicação, não comprovação de leitura pelo destinatário. A ausência de registros nas duas últimas filas não demonstra falha, mas também não comprova que os fluxos completos já tenham sido exercitados em produção. A consulta não validou a execução atual dos crons no painel do Inngest nem a entrega no aplicativo WhatsApp de um destinatário real.

A tabela nova `lead_contact_links` ainda não existe no banco consultado (`PGRST205` confirmado com GET). A migração desta entrega não foi aplicada.

## Alterações preparadas

- Follow-up, recuperação, pós-venda, retorno, recomendação e lembretes ao lead recebem opção **Sair da lista** e link de saída no texto.
- Na agenda, quando já há as três ações de agendamento, as quatro opções são reunidas em uma lista. Isso evita misturar botões de resposta com botões de URL, combinação que a especificação Uazapi armazenada no projeto informa ser incompatível com WhatsApp Web. A opção de saída da lista é uma resposta identificada como `sair_da_lista`.
- Uma recusa explícita de formato do provedor permite a alternativa em texto com o link. Timeout, erro de servidor e resultado incerto não disparam essa alternativa. A preferência é conferida novamente antes de tentar o texto.
- O link público usa identificador aleatório e não exibe telefone, nome, empresa ou histórico. GET apenas apresenta confirmação; POST registra a saída. Não exige login ou saldo. Não oferece reativação pública.
- O webhook reconhece respostas explícitas de saída, inclusive a opção do menu, antes da execução do agente. Processa a decisão mesmo em reentregas do webhook. A seleção efetiva é distinguida de botões presentes em mensagens citadas.
- A operação de saída é idempotente e restrita ao lead da empresa correspondente. Mescla os dados existentes, registra data e origem em `leads.metadata`, ativa a pausa em `automation_lead_profiles` e cancela contatos pendentes na mesma transação.
- Filas de follow-up em `pending`, `processing` e `failed` ficam `skipped`; lembretes ao lead da agenda nos mesmos estados também. Reuniões em `pending` ou `claimed` ficam `cancelled`. Retornos de visitas em `pending`/`scheduled` são cancelados.
- Envios que já começaram e entregas incertas permanecem registrados como tal. Uma mensagem já em trânsito ainda pode chegar.
- O arquivo do lead exibe a saída, data e origem. Pedidos, agendamentos, visitas realizadas e mensagens são preservados. O lead continua visível; uma nova conversa não reativa automaticamente os contatos.
- Marcações antigas de saída continuam válidas. Uma trigger também cancela pendências quando uma integração escreve a marcação antiga no lead.

## Escopo

A preferência é da empresa e do lead, não apenas de uma instância ou agente. Trocar de agente não permite retomar os contatos desse lead. Não utiliza instâncias arbitrárias de clientes da API.

Avisos internos de resultado de agendamento aos responsáveis não recebem o link do lead, pois isso permitiria que outra pessoa saísse da lista em nome dele. Avisos de plano, pagamento e créditos ao administrador da conta continuam com a preferência própria da entrega anterior. Respostas solicitadas pelo lead, atendimento humano e notificações transacionais de pedidos não foram transformadas em follow-up nesta alteração.

## Validação e publicação

- 79 testes passaram em 11 arquivos: saída pública, SQL transacional, isolamento entre empresas, idempotência, filas, integração de envio, recuperação/follow-up, agenda, reuniões, webhook, intervenção humana e identidade do lead.
- Build de produção concluído, incluindo a rota pública nova; TypeScript validado no build.
- ESLint sem erros nos arquivos alterados.
- Confirmação pública exercitada em navegador headless a 390 px e 1440 px: sem rolagem horizontal, GET sem alteração, POST real do formulário com cabeçalhos do navegador aceito e estado final de saída exibido.

Antes de publicar o aplicativo, aplicar `supabase/migrations/0123_lead_contact_opt_out.sql` no ambiente de destino com as migrações anteriores já presentes. A migração também cancela pendências de leads que já tinham opt-out. Depois, publicar o código e validar uma entrega controlada pelo provedor e o processamento dos agendadores. Não houve aplicação de migração, deploy, push ao GitHub ou envio real de WhatsApp nesta revisão.
