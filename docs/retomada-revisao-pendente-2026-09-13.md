# Retomada de revisão antiga e resumo não executado — 13/09/2026

## Evidência do reteste

O titular mostrou novo erro após a publicação `17f17c6`: uma mensagem automática afirmou ter incluído o item; na retomada, a agente enviou lista completa, total e cartão e pediu confirmação. A resposta “sim” voltou à solicitação de nome, versão e quantidade.

Consulta somente de leitura, restrita ao atendimento do reteste, confirmou revisão ainda não aplicada: operação de inclusão com quantidade, identidade do produto vazia, sem prévia pronta e com a mesma revisão esperada do pedido. O pedido salvo não continha o novo item. O histórico continha as respostas explícitas de produto/quantidade recebidas antes da correção anterior. Não houve edição manual dos dados para desbloquear o atendimento.

## Causas e correções

1. Corrigir o parser não reprocessava esclarecimentos já salvos. A retomada agora pode recuperar a operação a partir das mensagens do cliente no mesmo escopo e posteriores à última atualização do pedido, dentro de sete dias e das mensagens disponíveis no contexto (até 80). Novas pendências registram a mensagem de origem. Pendência antiga sem origem exige comando explícito compatível no histórico; texto da agente não fornece autorização nem identidade.
2. O bloqueio de falsas alterações reconhecia verbos como “adicionei”, mas deixava passar um resumo pronto para fechamento sem esses verbos. Propostas de fechamento com revisão pendente agora passam pela mesma verificação e não alimentam outro carrinho a partir da prosa da IA.
3. O follow-up de silêncio/recuperação ignorava a revisão por conversa. Agora verifica a revisão antes da geração e novamente antes do envio, priorizando o mapa por conversa e preservando isolamento de organização/instância. Descartes ficam registrados com o motivo; lembretes independentes mantêm suas próprias regras. O prompt também proíbe afirmar alterações que o follow-up não executa.

Dados recuperados produzem uma **nova prévia calculada pelo catálogo e frete atuais**. Somente outro aceite da prévia permite aplicar a revisão no mesmo pedido e continuar o pagamento. Repetições de esclarecimentos não acumulam quantidade. Recusa, pergunta, alternativa, outra compra, item não identificado ou evidência fora do escopo/limite impedem reaproveitar a escolha antiga. As palavras originais são examinadas antes da normalização para preservar negações e interrogações.

Sem migration SQL, mudança de catálogo, envio de teste no WhatsApp, cobrança, exclusão de conversa ou alteração manual de pedido. O trabalho mantém o fluxo compartilhado da plataforma; cenários especializados por profissão continuam fora deste pacote.

## Validação e limites

Foram acrescentados 41 cenários de recuperação de histórico, dez de retomada completa e 17 de follow-up. A rodada direcionada com os casos anteriores de oferta/versão passou **112 testes**. A suíte completa passou **2.364 testes em 183 arquivos**, sem falhas. Revisão independente, TypeScript e ESLint aprovados. Publicação autorizada em preparação.

Os cenários usam produtos comuns fictícios, as funções reais do runtime e substitutos de banco, transporte e provedor. Verificam a persistência, a prévia calculada, o novo consentimento, a ausência de pagamento antecipado e repetição sem duplicação. Não provam entrega real do WhatsApp nem aprovação financeira.

Reteste previsto na mesma conversa: retomar, conferir a prévia calculada pelo sistema e confirmar uma vez. Se o histórico necessário não estiver mais no contexto, a agente ainda precisa esclarecer a alteração; não deve apresentar uma confirmação pronta enquanto falta identificá-la.

## Publicação verificada

Publicado em 13/09/2026 às **09:36:43 BRT**, commit `de5165771f3adef1dd57d6e89787819182a3dd64` na master, implantação Vercel `dpl_F5YMhvcFCXFkursEr7BxDkx9UoXk` **Ready / Latest / Production**, domínio principal associado. Após a publicação: inicial e login HTTP 200; Inngest HTTP 200, assinatura aceita e 43 funções; checkout inexistente HTTP 404 esperado. Nenhuma intervenção em conversas/pedidos, envio de teste ou cobrança. Reteste liberado na conversa existente; a nova entrega real do fluxo ainda depende da observação do titular. Registro posterior ao push mantido local para evitar outra implantação apenas documental.
