# Clareza de cartões, recargas e saldo — 26/10/2026

## Diagnóstico confirmado por leitura

- A substituição de cartão relatada concluiu com sucesso. O padrão novo e a autorização de recarga foram conferidos no banco, sem iniciar pagamento.
- A recarga salva pelo titular está ativa: pacote de 5.000 créditos por R$ 47, limite de saldo 100 e teto mensal de R$ 47. Dados privados e identificadores não são registrados neste relatório.
- O indicador de 15% vinha do último ciclo, encerrado em 10/10, embora a carteira continuasse consumindo saldo sob acesso administrativo autorizado. Não representa o saldo atual.
- O resumo de 30 dias era calculado sobre apenas 1.000 eventos. Ensaio com rollback confirmou 4.584 eventos e 147.085,37316 créditos no período consultado. São totais de eventos concluídos, não conciliação financeira de todos os débitos/estornos.

## Alterações

Minha Conta reúne métodos de pagamento, recarga automática e avisos de saldo; Créditos e recargas mantém o mesmo componente. A autorização salva mostra estado, bandeira/final, pacote, limite de saldo, teto mensal e data. Formulário de edição fica separado do resumo persistente. Os textos distinguem mensalidade e créditos, inclusive no consentimento de troca de cartão para contratos com cobrança mensal automática desativada.

O cartão atual recebe “Cartão padrão para cobranças”; os antigos oferecem “Definir como padrão” e remoção com confirmação. Remover deixa de permitir a seleção futura, preservando o registro e o histórico financeiro. A função transacional bloqueia cartão ativo, vinculado a recarga habilitada, pagamentos em conferência e acessos de outra organização/usuário sem papel permitido. Nenhum cartão real foi removido para testar.

O resumo principal mostra saldo total, reservas e saldo disponível; percentual restante usa a mesma referência dos avisos, identificada na tela. Não deduz consumo mensal pela diferença entre saldo e franquia, pois há recargas/acúmulo. Os ciclos continuam no histórico com suas datas. Totais de eventos dos últimos 30 dias são agregados no banco sem truncamento; “hoje” respeita America/Sao_Paulo. Migration 0212 adiciona somente duas funções restritas ao serviço.

## Validação e publicação

67 testes dirigidos passaram, incluindo SQL real em PGlite com mais de 1.000 eventos, limite de dia em Brasília, isolamento, remoção idempotente/protegida e cartão/termos autorizados. Prévia local em 1440, 768 e 390 pixels sem overflow; autorização simulada persistiu após recarga de página; cancelamento/remoção simulados conferidos. Evidência local em output/billing-clarity-20261026, sem dados reais de cartão. TypeScript e ESLint dirigidos verificados durante a preparação.

Ensaio da migration em produção concluído com ROLLBACK, funções sem acesso por anon/authenticated. Publicação isolada em preparação; nenhuma alteração de saldo, cobrança real, autorização de recarga ou mensalidade feita pelo agente. Confirmação do deploy e aplicação definitiva serão registradas após verificação.
