# Cobertura dos avisos financeiros da conta

## Regra de remetente e destinatário

A regra padrão é usar um agente WhatsApp disponível do próprio cliente. Sem agente disponível, inclusive para contas que usam somente API, o WhatsApp de cobrança da ConnectyHub assume. O destinatário principal é o titular da conta (`organizations.owner_id` → `profiles.phone`). Cópias a responsáveis continuam dependendo da configuração existente.

A seleção ocorre no envio, considera agentes da mesma conta de faturamento e não exige saldo positivo nem plano vigente. Os avisos usam textos diretos e não consomem créditos de IA. A preferência de agente em Minha conta é compartilhada pela conta; a opção explícita de usar sempre ConnectyHub continua disponível.

Na revisão seguinte desta mesma data, os avisos passaram a adaptar a voz ao remetente efetivamente usado: primeira pessoa com identificação de assistente virtual para o agente do cliente, texto institucional para a plataforma. O catálogo `catalogo-mensagens-avisos-conta-2026-09-10.md` contém as duas versões geradas do código, com dados fictícios para revisão. Instâncias avulsas da API permanecem fora da seleção automática.

## Eventos conferidos

| Situação | Origem do aviso / comportamento |
| --- | --- |
| Cadastro e teste: início, saldo, vencimento, conversão | Fluxo de ciclo de teste existente, com o remetente comum |
| Plano contratado ou renovado | Pagamento confirmado e benefícios efetivados; inclui ativação/renovação administrativa |
| Pagamento pendente ou em conferência | Checkout/webhook/reconciliação; não anuncia aprovação antecipada |
| Pagamento recusado | Resultado da cobrança; orienta correção antes de nova tentativa |
| Pagamento cancelado ou estornado | Webhook e nova fila transacional para alterações diretas do pagamento |
| Plano perto de vencer, vencido e em carência | Rotina de ciclo pago e política de renovação existente |
| Assinatura pausada ou cancelada | Sincronização com o provedor; atualização de assinatura ativa não é descrita como pagamento pendente |
| Plano sem renovação: acesso prestes a terminar ou terminado | Novo aviso informativo, sem gerar fatura de renovação ou inventar dívida |
| Saldo baixo e esgotado | Alertas existentes da carteira compartilhada (20%, 10% e zero); mesma regra de remetente |
| Recarga manual ou automática pendente, aprovada, recusada, cancelada ou estornada | Contexto recuperado do pagamento; texto sobre créditos e link para Créditos e recargas |
| Recarga automática autorizada/desativada pelo titular | Nova intenção de aviso registrada junto ao evento de alteração |
| Recarga impedida por cartão indisponível, valor mensal autorizado ou oferta alterada | Novo aviso específico; informa que essa verificação não efetuou nova cobrança |

## Lacunas corrigidas nesta revisão

- Autorizações de recarga e impedimentos agora registram intenção de aviso na mesma transação do evento. A fila só remove a intenção após registrar o aviso definitivo ou verificar que ele ficou desatualizado.
- Cancelamentos e estornos atualizados diretamente no pagamento também geram intenção de aviso. A confirmação de compra continua vinculada à efetivação dos benefícios, não apenas à mudança de um campo.
- Uma mesma situação do mesmo pagamento usa uma chave comum entre checkout, webhook e fila. Avisos antigos equivalentes também são considerados, evitando duplicação na transição.
- Avisos de créditos deixam de herdar texto e link de contratação de plano. Uma atualização genérica não é anunciada como recusa.
- Recarga retornada como recusada, cancelada ou erro definitivo pausa a autorização original. A atualização não desativa uma autorização mais recente. Resultado incerto fica para reconciliação, sem segunda tentativa imediata de cobrança.
- Planos sem renovação recebem aviso de término de acesso; os controles SQL continuam bloqueando cobranças desatualizadas e avisos de dívida sobre renovação cancelada.

## Entrega e limites operacionais

Uma falha definitiva do agente permite uma tentativa pelo remetente da plataforma dentro do mesmo aviso. Em timeout ou resposta incerta, não se envia imediatamente de outro número: é necessário conferir o resultado para não duplicar a mensagem. Se os dois canais estiverem indisponíveis, registra-se falha para as tentativas existentes. Sem telefone no perfil do titular ou com notificações globais desativadas, o registro fica como ignorado com o motivo; esta entrega não acrescenta um canal alternativo por e-mail.

Os avisos gerados pela fila e verificações de saldo dependem do processamento periódico existente. A revisão não transforma a recarga em operação instantânea, não muda os percentuais de alerta e não aumenta a capacidade da rotina de recarga (atualmente até cinco políticas por execução). Dimensionamento para milhares de contas permanece uma etapa separada.

## Validação e publicação

- 131 testes distintos aprovados em 12 arquivos: seleção/remetente/endpoint/SQL, entrega de eventos financeiros, conteúdo e destinatário, fila de avisos, resultados de recarga, contratos, checkout nativo e recuperação de Pix.
- SQL executado em banco local de teste, incluindo os novos gatilhos, permissões, deduplicação, condições de recarga e exceção informativa para renovação cancelada.
- ESLint sem erros; permanece o aviso preexistente de `addMonths` não utilizado.
- Compilação de produção concluída: TypeScript aprovado e 93 páginas estáticas geradas.

As alterações desta entrega estão locais. Aplicar `0120_notification_sender_preferences.sql` e depois `0121_account_billing_notice_outbox.sql` antes de publicar o código. Nenhuma mensagem ou cobrança real foi disparada e nenhuma migração foi aplicada em produção nesta revisão. A cobrança automática real ainda exige validação operacional com cartão autorizado; a auditoria anterior não encontrou cartões ativos nem políticas habilitadas.
