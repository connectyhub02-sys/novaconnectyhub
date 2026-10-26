# Correções da auditoria de cobrança — 26/10/2026

## Escopo e autorização

Titular autorizou corrigir avisos, Pix Automático e recargas, testar sem cobranças reais e reconectar o WhatsApp da Eliane. Nenhum teste dispara débito, pagamento, mensagem a cliente ou evento financeiro em produção. Valores, cartões, contratos e consentimentos existentes são preservados.

## Implementação

- Avisos: ausência de remetente e canal desativado passam a aguardar a dependência, sem consumir tentativas de envio. Migração 0213 recupera somente falhas comprovadamente anteriores ao envio; entrega incerta permanece retida. O claim descarta lembretes de dias anteriores e avisos cujo saldo, ciclo ou autorização já mudou.
- Pix Automático: validação de origem usa a origem pública canônica, inclusive atrás do proxy. Pagamento inicial RECEIVED/CONFIRMED pode liberar o ciclo mesmo antes de ACTIVE ou com recorrência recusada. Valor, titular técnico, identificador de conciliação e unicidade continuam obrigatórios. A ativação posterior vincula recorrência sem conceder créditos novamente. Recusa só libera nova tentativa após consulta completa ao provedor sem pagamento inicial; incerteza não autoriza outro POST. Estorno não aparece como plano pago.
- Recargas: gatilho usa saldo disponível após reservas e exige carteira ativa. Erro do claim deixa de parecer fila vazia; resultado fica registrado, com reserva e conciliação para resposta incerta. Mantidos consentimento, preço autorizado, teto mensal, cartão escolhido e bloqueio contra duplicidade. Erro de persistência posterior não reclassifica resultado conhecido do provedor.
- Operação: recargas ganham rotina Inngest independente das tarefas de IA/mídia. Nova conferência de saúde consulta atrasos, bloqueios, entregas incertas, conciliações, recargas e renovações elegíveis sem tentativa. Pendências fazem a rotina falhar de forma visível, sem repetir o passo de débito. Admin Financeiro mostra os mesmos indicadores; isso não comprova aprovação bancária.

## Verificação

- Suíte completa antes dos últimos dois ajustes defensivos: 4.491 testes aprovados, 15 falhas em oito arquivos. As mesmas 15 falhas foram reproduzidas em checkout isolado da revisão anterior b8faced7 (159 aprovados nesses oito arquivos). São falhas anteriores de mocks/expectativas de agentes, autenticação, Meta, layout, custos e escopo CRM; não foram alteradas neste trabalho.
- Verificação final focalizada: oito arquivos, 127 testes aprovados, incluindo SQL real em PGlite, idempotência, limites, consentimento, origem, autenticação, recibo independente da recorrência, estorno e retomada segura de avisos. TypeScript sem erros.
- Ensaio transacional das migrações no PostgreSQL de produção com ROLLBACK: sem alteração de pagamentos, tentativas, contratos, carteiras ou condições das recargas. Sete avisos elegíveis para recuperação e dois incertos retidos. ACLs de serviço conferidas.
- Eliane reconectada pelo painel durante o trabalho: conexão connected e credencial presente confirmadas às 17h08 BRT. Nenhuma mensagem de teste enviada.

## Publicação e limites

Migrações 0213–0216 aplicadas com transação e registro, após backup privado de schema e tabelas financeiras na VPS e cópia local com SHA-256 idêntico. Verificação interna da transação confirmou preservação de pagamentos, tentativas, assinaturas, carteiras e condições de recarga.

Aplicação funcional d2d2651c publicada no slot a às 17h22 BRT. Health, home/login, 19 assets, redirecionamento de dashboard sem sessão, APIs financeiras 401 e GET assinado Inngest com 59 funções passaram no candidato e no domínio público. Registro do mesmo app atualizado por PUT, sem publicar evento financeiro. Revisão final b4775d7b publicada no slot b às 17h34 BRT, com nova validação no candidato, no domínio público e no navegador autenticado. Slot a (d2d2651c) preservado para retorno. O Financeiro só pede reconexão quando há aviso bloqueado e distingue pendência de tarifa de falha de carregamento.

A agenda normal de 17h20 retomou quatro avisos com ID de mensagem persistido (saldo crítico e recarga autorizada da Vision, dois lembretes válidos) e descartou três desatualizados. Aceitação pelo provedor não comprova leitura humana. Bloqueados e esgotados: zero; dois avisos antigos incertos continuam retidos, sem reenvio.

Às 17h25: rotina geral conferiu 12 contratos, sem falha e sem tentativa de cartão; reconciliação Pix conferiu o mandato existente, sem pendência. A nova rotina independente conferiu a política de recarga (last_checked_at atualizado, last_error_code nulo), sem cobrança, e terminou Failed intencionalmente com a indicação dos dois avisos incertos. Essa falha é o alerta operacional esperado, não uma recusa de pagamento ou uma segunda execução do débito. Total de tentativas de cartão segue quatro, nenhuma criada desde o início da correção; zero execuções de recarga.

O Admin Financeiro autenticado foi aberto e confirmou o quadro de saúde com somente as duas entregas incertas. Conferência final às 17h34: nenhum novo débito/tentativa, política de recarga conferida novamente às 17h30 sem erro e Eliane connected com credencial. Também identificado aviso anterior de duas operações sem tarifa (whatsapp_traffic_routine_ai / gemini-3.6-flash); precificação e eventual conciliação desse consumo permanecem pendentes, sem inventar tarifa ou debitar retroativamente.

Ainda não existe prova de liquidação de recarga automática ou renovação via Pix Automático real; gerar uma cobrança para obtê-la violaria a restrição dos testes. Betel permanece com tentativa anterior recusada pelo banco; correção técnica não equivale a pagamento. Pix diretos sem referência local exigem conciliação comercial. Entregas incertas exigem conferência antes de eventual reenvio.

Referência do comportamento Pix: [FAQ oficial do Asaas](https://docs.asaas.com/docs/faq-2), item 11: pagamento inicial e consentimento para recorrência são eventos independentes.
