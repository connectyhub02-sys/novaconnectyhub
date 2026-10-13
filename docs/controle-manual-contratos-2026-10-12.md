# Controle manual de contratos — 12/10/2026

## Problema e correção

O controle administrativo desabilitava a ativação quando a versão personalizada já estava vinculada, mesmo com acesso expirado. O seletor e a API também impediam qualquer plano de catálogo quando existia histórico de contrato personalizado.

- Contrato vigente: botão **Liberar acesso do contrato**, prazo de 1 a 365 dias (padrão 30), motivo e auditoria. Não altera prazo financeiro, não quita fatura, não concede créditos. Repetição durante a mesma liberação retorna o prazo existente.
- Start/Pro/Scale selecionáveis. Troca transacional com idempotência, snapshot de preço e recursos do catálogo, créditos somente se marcados pelo admin, sem criação/envio de cobrança. Contrato antigo preservado no histórico; consulta e renovação deixam de aplicar suas condições quando o modo vigente é catálogo.
- Assinatura recorrente/Pix ativo, pagamento em processamento e cobrança externa atual impedem troca até conciliação. Tentativa rejeitada anterior ao contrato aceito fica no histórico; a ordenação existente do fulfillment impede que um pagamento antigo substitua o plano novo.
- Suspensões administrativas permanecem respeitadas. Restauração de APIs afeta somente pausas registradas pelo bloqueio financeiro, mantendo pausas manuais e revogações.

## Verificação

53 testes passaram em quatro suítes: ativação SQL, endpoint admin, contratos/topups e contrato financeiro SQL. TypeScript sem erros; lint sem erros (aviso preexistente de função não usada no customer-control).

Migration 0203 ensaiada no esquema real dentro de transação com ROLLBACK: liberação da Vision, repetição sem extensão, carteira/faturas invariáveis e troca para Start sem créditos. A troca foi desfeita no ensaio. Migration aplicada e registrada em supabase_migrations. Backup privado de esquema na VPS: /opt/connectyhub/app/releases/before-0203-schema.sql.

## Vision Business Group

Ativação real autorizada aplicada pelo RPC auditado em 12/10/2026 às 22h21 BRT. Contrato v1 preservado; acesso até **11/11/2026 às 22h21 BRT** (2026-11-12T01:21:29.672906Z). Resolver confirmou allowed=true, reason=admin_manual_access. Carteira e registros de cobrança comparados integralmente antes/depois: sem alteração. A assinatura financeira continua past_due; isso não significa quitação e não bloqueia a liberação administrativa vigente. Nenhum pagamento ou mensagem foi enviado.

Código e produção: `0fb345fe`, slot b/3131, fallback `5e61d212` no slot a/3130. Build completo, health 200, Inngest assinado 200/58 funções, endpoints administrativos anônimos 401. UI de produção no Chrome confirmou Vision como Ativo/Personalizado, saldo 127.001, prazo 11/11/2026, botão de liberação habilitado e Start/Pro/Scale selecionáveis. Não houve troca efetiva de plano da Vision.
