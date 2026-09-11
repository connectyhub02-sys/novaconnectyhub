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

Atualização posterior em 11/09: o titular autorizou publicar o conjunto acumulado de follow-up/encerramento, simplificação dos painéis, qualificação por atividade e leitor do catálogo WhatsApp. As menções abaixo à suspensão registram a etapa anterior; envio e implantação deste conjunto estão em andamento. O lote incorreto do teste da Renata já não aparece no painel: zero sincronizações recentes e nenhum produto publicado. A nova sincronização deve ocorrer após a implantação corrigida.

Validação consolidada antes do envio: 1.293 testes aprovados em 146 arquivos. TypeScript e ESLint dos arquivos alterados passaram nas verificações direcionadas. Nenhuma migration SQL necessária para este conjunto.

Correção em 11/09 da personalidade por atividade: o painel e os salvamentos de cliente/admin passaram a aplicar o perfil mesmo com prompt técnico manual. Na abertura de agente legado, campos vazios recebem padrões da atividade no rascunho editável; textos personalizados, perfis importados do histórico e desativações identificáveis são preservados. O preenchimento não escreve no banco até salvar. Passaram 206 testes direcionados, TypeScript e ESLint; não requer migration SQL. Enviada à master em `9506984`; o titular confirmou a implantação. A verificação funcional completa do agente Renata em produção não foi refeita nesta tarefa. A configuração local do Supabase foi conferida e aponta para o domínio próprio da VPS; não houve alteração de destinos ou credenciais.

Correção de follow-up e encerramento em 11/09: validação da resposta final da IA antes do envio, personalidade do agente na retomada e reconhecimento compartilhado de despedidas no atendimento individual WhatsApp e no abandono de conversa. Bloqueia cortesia repetida e agendamentos de abandono após despedida, inclusive do próprio agente; nova necessidade retoma atendimento. Não altera recuperação de pedido nem requer SQL. Passaram 1.245 testes em 145 arquivos, TypeScript e ESLint. Evidência, escopo e limites em [correcao-followup-encerramento-2026-09-11.md](correcao-followup-encerramento-2026-09-11.md). Publicação suspensa por pedido explícito do titular para agrupar mudanças; nenhum reenvio real executado.

Simplificação local do painel em 11/09: a aba Conhecimento foi removida nos agentes cliente/admin, e a lista/anexo de arquivos passou para Prompt → Informações extras do seu negócio, junto do complemento em texto. Permite texto, arquivo ou ambos; mantém endpoints, arquivos existentes e preservação do rascunho ao anexar. O aviso de redirecionamento de follow-up em Comportamento do cliente também foi removido, sem criar outro atalho no lugar. Não requer SQL. Publicação permanece suspensa pelo titular.

Qualificação por atividade em 11/09: ao abrir o agente, perguntas genéricas intactas recebem no rascunho o perfil da profissão/empresa selecionada, mesmo que o padrão genérico já tenha data de salvamento. A mesma regra compartilhada vale na troca de atividade e na aplicação do perfil, inclusive com prompt manual. Perguntas, objetivo, pesos, desativações e demais ajustes que diferem do padrão são preservados. As atividades cadastradas já fornecem perguntas e encaminhamento específicos; foram conferidas as perguntas no texto de atendimento e o vínculo de campos/pesos na análise do CRM. Passaram 130 testes direcionados, TypeScript e ESLint. O rascunho precisa ser salvo para aplicar ao atendimento; nenhuma alteração direta em agentes de produção ou migration. Tudo ainda local por orientação do titular.

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
| Catálogo UAZAPI | Reteste em 11/09: documentação retornou HTTP 200 com dez imóveis e imagens. Na loja, gerou dez rascunhos sem imagens e com preços dez vezes maiores; parou na primeira página. Leitor corrigido localmente para o formato real de imagens/cursor/escala monetária, com 51 testes direcionados aprovados. Publicação suspensa; dez rascunhos existentes não alterados, nenhum produto publicado e sincronização corrigida em produção ainda não revalidada. [Evidências do reteste](reteste-catalogo-uazapi-2026-09-11.md). |
| Preview e desenvolvimento | Origens Inngest na Vercel foram vistas como Production-only; comportamento fora de produção ainda não foi auditado por completo. |

Print posterior da qualificação confirmou as quatro perguntas genéricas com objeção marcada como obrigatória. A regra local passou a preservar essa opção sem tratá-la como edição do texto inteiro do playbook. Teste reproduz o preenchimento por profissão e nova troca de atividade mantendo a obrigatoriedade; perguntas efetivamente reescritas continuam preservadas. A suíte direcionada passou a 131 testes aprovados.

No Catálogo de Vendas → Configuração, o bloco informativo “Automações do checkout” foi removido por solicitação do titular, incluindo aviso e botão de redirecionamento. Era apenas navegação para Automações; nenhuma configuração ou rotina de envio foi alterada. Checagem ESLint concluída. A mudança segue local, junto das demais alterações ainda não publicadas.

## Auditoria geral em curso

Solicitada conferência dos painéis dos clientes, agentes, agenda/follow-up, API IA/LLM, cobrança por crédito e dependências Supabase/Inngest. Revisão inicial leu os commits `917410c` e `586ce3c` e confirmou reserva/liquidação no código. Suíte completa executada em 11/09 com `npm test -- --maxWorkers=2`: **1.172 testes aprovados em 143 arquivos**, duração aproximada de 98 segundos. São testes locais, com fronteiras externas simuladas; não comprovam geração paga, todos os fluxos publicados ou entrega externa. Uma revisão não está encerrada pela existência deste arquivo.

Próxima atualização deve separar resultados de código, testes simulados, configuração publicada e operação real por módulo, com falhas acionáveis. Evitar novas cobranças/envios reais sem cenário e destinatário apropriados ao teste.

## Decisões mantidas

Diretriz de orçamento do titular em 11/09: não aumentar custos antes de começar a vender. Manter Observability Plus por enquanto e reduzir frequência de deploys, priorizando validação local e publicação de conjuntos de mudanças necessários. Não contratar serviços nem ativar extras pagos por iniciativa própria. Isso não constitui autorização para pausar atendimento ou desativar serviços existentes. Consumo variável pode continuar crescendo; não prometer teto sem controle configurado e validado.

Referência financeira informada/observada: UAZAPI R$ 138/mês (valor corrigido pelo titular), Contabo US$ 28,70/mês com backup/região e Vercel Pro US$ 20/mês mais consumo excedente. Aproximadamente R$ 400 é estimativa cambial, não custo total garantido: IA, conversão do cartão e assinaturas antigas ainda ativas são adicionais. Na consulta do ciclo Vercel 22/08–22/09, excedente perto de US$ 1,81; alerta de US$ 200 adicionais e pausa automática desativada. Nenhuma configuração de cobrança foi alterada.

Não migrar a hospedagem da Vercel nesta etapa. Não excluir projetos Cloud como consequência implícita da auditoria. Multi-projetos, dashboard operacional central e possível n8n ficam para etapa futura. Nenhuma credencial pertence a este arquivo.

Depois da migração, novas escritas só existem na VPS. Retorno ao Cloud exige reconciliar essas escritas; reverter URLs ou remover modo somente leitura não é um rollback completo.
