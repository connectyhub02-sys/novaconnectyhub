# Estado operacional da ConnectyHub

Atualização: 11/09/2026. Este é um ponto de continuidade, não monitoramento em tempo real. Revalidar antes de decisões de produção. A auditoria geral solicitada pelo titular está em andamento e ainda não autoriza declarar todos os recursos prontos para a próxima fase.

## Verificado ou confirmado

- Aplicação/handlers permanecem na Vercel; Supabase e Inngest de produção foram migrados para VPS Contabo; R2 permanece. [Relatório Supabase](migracao-supabase-vps-2026-09-11.md), [relatório Inngest](migracao-inngest-vps-2026-09-11.md).
- Migração Supabase: snapshot com 181 tabelas, 421.808 registros, 25 usuários e 83 registros de migrations; contagens sem divergência antes de retomar escrita. Arquivos do snapshot conferidos. Esses números não são contagens atuais.
- Titular confirmou login de administrador e de cliente Buffalo Mace, e respostas dos agentes Gustavo e Kalum. Não confirma todos os papéis, agentes ou caminhos de autenticação.
- Acesso do painel Inngest: titular confirmou normal e anônimo após correção de autenticação no proxy. As chamadas de checkpoint foram ajustadas preservando autenticação.
- Auditoria das 43 funções registrada em [auditoria-automacoes-vps-2026-09-11.md](auditoria-automacoes-vps-2026-09-11.md), publicada no commit `0fbc215`. 33 com alguma execução observada e dez sem ocorrência na janela; vários resultados eram fila vazia. 200 testes selecionados passaram nessa auditoria.
- Ensaio de restauração em 11/09: dumps Supabase e Inngest do backup das 16:10 UTC restaurados com saída zero em bancos separados dos de produção; seis arquivos internos passaram em checksum. O ensaio utilizou os clusters existentes, não uma máquina vazia. Detalhes privados em `/opt/connectyhub/closure-audit`.
- Nova conferência: 16 assets da página de login sem URL do Supabase Cloud; consulta anônima não expôs carteiras. Varredura de 29 colunas textuais de URL/endpoint não encontrou origens Cloud antigas; não foi varredura universal de JSON/segredos.
- Inngest Cloud verificado no plano Hobby gratuito; titular decidiu mantê-lo sem uso por enquanto. O histórico antigo não foi importado, e retenção observada do Hobby é de um dia. Supabase Cloud foi preservado somente leitura; cancelamento da assinatura não foi confirmado.

## Pendências concretas

| Item | Estado e próximo critério |
|---|---|
| Backup fora da VPS | Arquivo cifrado transferido ao computador do titular; transferência da chave/manifesto não concluída e decifragem local ainda não validada. Não declarar cópia externa recuperável antes dessa verificação. |
| Auto Backup Contabo | Habilitado; painel consultado não tinha cópia disponível, primeira prevista para 12/09 às 02h de Brasília. Confirmar conclusão, não apenas habilitação. |
| Recuperação de senha | Fluxo usado antes da migração é WhatsApp; titular ainda não confirmou teste completo. SMTP Resend autenticou, mas entrega de e-mail não foi testada; e-mail era etapa futura, não funcionalidade anterior comprovada. |
| Histórico de conversa WhatsApp | Caso real rejeitado pelo provedor por terminar em turno do modelo; nenhuma correção de código aplicada até este registro. Inngest marcou Completed porque o handler retornou falha como objeto. |
| Relatório diário administrativo | Função agenda/retorna ready, sem compilar nem entregar relatório de negócio. |
| Novas modalidades IA | Adaptadores, tarifas e documentação foram ampliados, mas nem todas as famílias passaram por geração real com cobrança/recuperação conferidas. |
| Serviço Live/WebSocket | Código existe; publicação e configuração operacional precisam ser conferidas. Não afirmar ativo apenas pelo endpoint/documentação. |
| Agendamentos e webhooks IA | Registrados na VPS; auditoria observou varreduras sem execução de IA/entrega elegível na janela. Falta cenário funcional controlado. |
| Isolamento e acesso | Conferência de produção/anon parcial. Inspeção atual no navegador está em acesso administrativo ao painel de cliente, não substitui teste de usuário comum. |
| Catálogo UAZAPI | Titular confirmou falha pré-existente de importação; proposta de leitor auxiliar é exploração futura, não solução instalada/validada. |
| Preview e desenvolvimento | Origens Inngest na Vercel foram vistas como Production-only; comportamento fora de produção ainda não foi auditado por completo. |

## Auditoria geral em curso

Solicitada conferência dos painéis dos clientes, agentes, agenda/follow-up, API IA/LLM, cobrança por crédito e dependências Supabase/Inngest. Revisão inicial leu os commits `917410c` e `586ce3c` e confirmou reserva/liquidação no código. Suíte completa executada em 11/09 com `npm test -- --maxWorkers=2`: **1.172 testes aprovados em 143 arquivos**, duração aproximada de 98 segundos. São testes locais, com fronteiras externas simuladas; não comprovam geração paga, todos os fluxos publicados ou entrega externa. Uma revisão não está encerrada pela existência deste arquivo.

Próxima atualização deve separar resultados de código, testes simulados, configuração publicada e operação real por módulo, com falhas acionáveis. Evitar novas cobranças/envios reais sem cenário e destinatário apropriados ao teste.

## Decisões mantidas

Não migrar a hospedagem da Vercel nesta etapa. Não excluir projetos Cloud como consequência implícita da auditoria. Multi-projetos, dashboard operacional central e possível n8n ficam para etapa futura. Nenhuma credencial pertence a este arquivo.

Depois da migração, novas escritas só existem na VPS. Retorno ao Cloud exige reconciliar essas escritas; reverter URLs ou remover modo somente leitura não é um rollback completo.
