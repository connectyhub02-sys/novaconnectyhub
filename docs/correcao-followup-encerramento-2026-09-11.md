# Follow-up e encerramento de conversa — 11/09/2026

## Falha investigada

Na consulta restrita dos registros da VPS, uma retomada por abandono foi marcada como enviada com um fragmento inválido no texto principal. O provedor aceitou esse conteúdo acompanhado da saída da lista. Não foi um texto correto ocultado pelo WhatsApp. O registro não preservou a resposta bruta da geração; não comprova se aquele fragmento veio de raciocínio ou de truncamento.

## Correção no código compartilhado

- Geração exige um único candidato, conclusão normal e JSON válido com decisão de enviar ou não contatar. Partes de raciocínio são excluídas do texto entregável. Respostas vazias, truncadas, fragmentos conhecidos de instrução, URLs não autorizadas e placeholders falham antes de criar a mensagem com opt-out.
- Falhas de geração ficam separadas de falhas ou incerteza de entrega. Consumo efetivo continua registrado; texto inválido não vira uso gratuito. Não foram adicionadas novas tentativas pagas automáticas. O teto de saída passou de 200 a 1.024 tokens; consumo real depende da geração.
- O follow-up recebe o prompt e o DNA habilitado do agente, respeitando preferências de conversa. Para abandono, a instrução exige uma necessidade concreta dependente do cliente e manda desistir diante de encerramento, inclusive despedida do próprio agente.
- Atendimento direto individual e follow-up usam o mesmo reconhecimento conservador de despedidas em português. Histórico persistido distingue despedida já respondida de nova solicitação. Uma cortesia posterior não produz outro envio; nova pergunta/pedido segue o atendimento normal. A resposta final controlada é curta e não chama o modelo de texto.
- Uma despedida reconhecida impede criar o agendamento de abandono; tarefas antigas também conferem o histórico antes de gerar. A regra se aplica ao caminho compartilhado dos agentes WhatsApp, independentemente da atividade. Não depende de editar cada agente.

## Critérios e limites

O padrão de espera continua em 120 minutos. O limite padrão de dois follow-ups conta mensagens proativas desde a última mensagem recebida, dentro da janela de histórico consultada. Não equivale a uma sequência obrigatória de dois envios. O agendamento é por oportunidade vinculada ao atendimento; tarefas duplicadas da mesma oportunidade continuam deduplicadas.

Permanecem as verificações de resposta posterior, atendimento humano, conversa explicitamente encerrada, agente/instância, janela de contato, consentimento e situação financeira. Recuperação de pedido e retornos têm critérios próprios; despedida de uma conversa não cancela pedido, agendamento comercial nem revoga consentimento.

A proteção determinística reconhece formas explícitas de despedida e cortesia; não é uma classificação semântica universal. Mensagens ambíguas, anexos e textos com nova necessidade continuam no atendimento normal. Outros encerramentos contextuais dependem da interpretação do modelo. O reconhecimento usa o histórico recente persistido (até 80 mensagens), não uma nova memória permanente nem mudança global de status da conversa.

## Validação e publicação

Testes locais cobrem resposta única, silêncio após agradecimentos, nova solicitação, confirmação pendente, anexos, despedida do próprio agente sem resposta, bloqueio de agendamento novo/antigo, geração inválida e preservação das verificações antes do envio. Testes externos são simulados; nenhum reenvio real do teste foi executado. Não requer migration SQL. Aplicação e handlers continuam na Vercel, com Supabase e Inngest na VPS.

Após os ajustes, a suíte completa passou com **1.245 testes em 145 arquivos**; TypeScript e ESLint também passaram. O titular pediu explicitamente para não publicar ainda e agrupar com a simplificação do painel. Alterações permanecem locais, sem commit/push desta rodada e sem verificação de envio em produção.

Posteriormente, em 11/09, o titular autorizou publicar o conjunto acumulado, incluindo estas correções. A autorização substitui a suspensão anterior. O envio real de follow-up continua sem novo teste; implantação e testes locais devem ser distinguidos desse resultado externo.
