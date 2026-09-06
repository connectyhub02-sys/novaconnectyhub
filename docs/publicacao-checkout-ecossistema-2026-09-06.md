# Checkout do ecossistema — 6 de setembro de 2026

Liberação autorizada pelo operador para testes da própria operação, inclusive com cobranças reais. A autorização não é apresentada como homologação ou certificação do Asaas.

## Fluxos

- Clientes das lojas permanecem no checkout ConnectyHub, com Asaas como processador. As 581 organizações existentes receberam a habilitação; novas organizações ficam habilitadas por padrão, preservando uma desativação explícita por organização.
- Clientes que compram planos ConnectyHub preenchem o cartão no próprio painel. Nome, contato e documento vêm do cadastro; endereço do titular é reutilizado quando disponível.
- O primeiro pagamento inclui os adicionais escolhidos. A assinatura no Asaas começa no mês seguinte e inclui somente o plano e os adicionais mensais. Uma assinatura já existente não é duplicada silenciosamente.
- Uma tentativa persistida precede o envio ao processador. Concorrência, timeout e troca entre Pix e cartão têm travas compartilhadas. Resultado incerto permanece em conciliação e não autoriza um segundo débito.
- A primeira cobrança recusada cancela a assinatura futura preparada para aquela tentativa. Cada renovação tem fatura e pagamento próprios, sem reaplicar adicionais avulsos.
- Avisos de pendência, recusa, cancelamento, aprovação e estorno usam o mecanismo de WhatsApp e histórico do sistema. As lojas registram os eventos do pedido e as mensagens no CRM do lead. Os planos registram tentativas e resultados nos eventos da organização e na fila de notificações de cobrança.
- PAN, CVV e tokens não entram no CRM nem no histórico de auditoria. O navegador envia os dados do cartão apenas para a rota de pagamento; os campos são limpos depois da tentativa.

## Verificações

- Migração `0078_ecosystem_native_billing` aplicada no projeto correto e registrada no histórico de migrações. Acesso anônimo às novas tabelas negado.
- Testes de banco cobrem concorrência, escopo da organização, revisão do carrinho, exclusão entre Pix e cartão, resultados fora de ordem, renovação idempotente e entrega dos diferentes estados.
- Testes do adaptador e da orquestração cobrem uma única cobrança, timeout, cancelamento da assinatura futura após recusa e valores diferentes do primeiro pagamento e da recorrência.
- Formulário exercitado em 360, 390 e 1366 pixels, com requisições simuladas, sem erro de JavaScript ou rolagem horizontal.
- Build de produção e lint verificados localmente.
- Asaas da plataforma consultado por API: webhook habilitado, sem interrupção, com eventos de pagamento e assinatura cadastrados. Agente de cobrança Eliane e WhatsApp conectados.

As transações reais de aprovação, recusa e estorno serão exercitadas pelo operador. A configuração e os testes automatizados não equivalem à comprovação de entrega de cada webhook e WhatsApp de uma transação real.
