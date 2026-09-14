# Implementação da API LLM — 14/09/2026

Estado de trabalho, distinto da auditoria inicial `auditoria-prontidao-api-llm-2026-09-14.md`. A auditoria inicial é histórica e não deve ser usada como estado pós-correção. Objetivo mantido: cobertura integral da Gemini Developer API aplicável, com experiência comercial em créditos e metadados técnicos preservados. O conjunto ainda não está concluído.

## Produção já alterada

Migration 0143 aplicada transacionalmente no SQL Editor administrativo da VPS, antes desta retomada. Registro `supabase_migrations.schema_migrations`, versão `0143`, nome `ai_financial_rpc_boundary`. Verificação posterior: sete funções financeiras sem EXECUTE para `anon` e `authenticated`, com EXECUTE para `service_role`; definições das sete funções preservadas. Nenhuma RPC financeira executada para teste, nenhum saldo, preço ou pedido alterado.

O evento `connectyhub_ai_financial_rpc_grants` ficou habilitado para `GRANT` e `CREATE FUNCTION`, com uma função de asserção disponível para conferência posterior às migrations/restaurações. Isso não impede um administrador de remover o próprio guarda; uma restauração exige validação após suas concessões finais. Privilégios padrão permissivos foram observados; não foi comprovada a origem histórica da divergência nem realizada revogação indiscriminada de funções legítimas do cliente.

Hashes antes/depois iguais, usando **md5(pg_get_functiondef(oid))**, não md5(prosrc):

| Função | Hash |
|---|---|
| claim_ai_request | eb1534563ffa1233284f134ab9d48181 |
| reserve_ai_credits | 7124aef200bbbd2fcf71f8e195ed2d0b |
| finish_ai_request | c2e8cdb51370a37339136a0a29556ec5 |
| settle_ai_operation | fdc4bf5e59f253f45d9433dff62dbf75 |
| save_credit_topup_policy | 7255043f9f838aa4ee53b8feb946be63 |
| claim_credit_topup | 59c59f849668030be5de031b0d5fd532 |
| fulfill_confirmed_billing_payment | 5a4164fc4c35017c69cc726464b06eb0 |

MD5 do texto SQL registrado no banco: `ee67f972f4442651512ab0b54f786e1d`. O texto registrado foi compactado; não se afirma igualdade binária com o arquivo de migration. Evidência proveniente das consultas antes/depois preservadas na tarefa, consolidada aqui nesta retomada; não houve nova consulta de produção para criar este registro.

## Implementação local e limites

Base remota conferida na retomada: `66e740f8b41a259cb4212c77e8a088eb2e5832a2` (alimentação, outra entrega). Worktree `codex/llm-readiness`, sem publicação própria até este registro.

- Streaming Chat incremental; contabilidade continua após desconexão, reserva/liquidação e identidade idempotente preservadas. Streaming nativo também mantém a tarefa de liquidação durante a vida permitida pelo runtime.
- Contrato Gemini v1beta inicial: modelos, geração, streaming, contagem e embeddings; metadados nativos e assinaturas opacas preservados no contrato versionado. Não representa paridade total.
- Consulta de preços em créditos com versão da tabela pública, sem custo privado do provedor. Preços/pacotes/multiplicadores existentes preservados.
- Migration 0145 publicada: limites globais e por carteira, inclusive chamadas de agendamentos. São guardas operacionais conservadores, não a quota confirmada do projeto Google nem um teto financeiro.
- Upload: autorização direta do titular obtida nesta tarefa após rejeição da confirmação encaminhada. Patch de transporte 20 MB aceito; módulo e wiring apenas locais. Tickets consumidos uma vez, isolamento, limite de memória e destinos restritos. Upload não cria geração nem débito; inferência e armazenamento efetivamente faturável seguem seus próprios registros.
- Live: ajustes locais de limite de sessões/duração e implantação privada. SSH da instalação recuperado; imagem do serviço construída, publicação e homologação em andamento. Não habilitar disponibilidade pública antes do serviço, migrations, TLS e testes.
- Documentação 1.6.0 local em fontes HTML, Markdown gerado e OpenAPI; revisão de cobertura integral em andamento.

## Validações até a retomada

O lote anterior à retomada tinha erro de sintaxe em `readiness-openapi.ts`: 73 testes passaram, duas suítes não carregaram, TypeScript falhou. Corrigida a sintaxe, TypeScript e **85 testes/21 arquivos** passaram. Depois foram adicionadas regressões de streaming desconectado, rotas Gemini, guarda de recriação de função e admissão de agendamento; a revisão atual requer novo lote final. Testes simulados/SQL isolado, sem geração paga, cartões, cobranças, envios ou arquivos reais de clientes.

## Pendências para concluir

Matriz completa de métodos/contratos oficiais; implementação dos adaptadores ainda ausentes; regressões de isolamento/medição/replay; documentação e exemplos consistentes; build/lint/testes finais; implantação e homologação do relay; conferência do acesso/quota de modelos e das condições específicas de Search/Maps para o produto proposto. Nenhuma declaração de autorização contratual especial do Google foi apresentada. Não confundir uma publicação parcial validada com encerramento do objetivo integral.

O erro histórico de WhatsApp continua fora deste conjunto, conforme decisão do titular de primeiro retestar. Não houve pausa do objetivo LLM pelo titular.

## Checkpoint de 14/09, 05:06 UTC

Migrations 0144 e 0145 aplicadas em transação pelo SQL Editor da VPS e verificadas em consulta separada. Pré-teste confirmou somente0143 registrada; depois, tickets/admissão/trigger exclusivos do serviço, tabelas de capacidade com RLS e sem leitura anon/authenticated, trigger ativo. A asserção0143 passou antes/depois. Não foram executadas reservas, recargas, cobranças nem envios de teste em produção.

MD5 do SQL registrado:0144 `5c9cf0651b9ef5c4138a8d1358bed94c`;0145 `08e2bd575c5003723fa297163f6f2310`. O editor normalizou espaços; conferência adicional de MD5 removendo whitespace coincidiu com os arquivos locais:0144 `27f10e2cf70b0b1c19887bf80c50d2bd`;0145 `27c21799f9b4ce98aea73e71b14734b6`.

Limites registrados:120 requisições/minuto global e 30 por carteira; 16 operações concorrentes global e 4 por carteira. Janela de atividade de 3 minutos; operações incertas preservam reservas, mas não ocupam slot. Esses limites não são garantias de quota ou disponibilidade do provedor.

Validação adicional:14 testes de migrations/admissão aprovados;15 testes de relay/streaming/rotas aprovados;TypeScript e lote 56 testes/13 arquivos aprovados antes dos últimos complementos documentais e metadados de arquivo. Suíte geral atual em execução. Uploads usam somente bytes sintéticos e provedor simulado; teste comprovou recuperação após reiniciar sem reenviar os bytes, registro privado contendo apenas IDs e rejeição de URL externa/ticket inválido.

Acesso SSH foi recuperado pelo método original documentado. CLI global estava em outra conta e foi preservada; login isolado da ConnectyHub autorizado pelo titular e concluído. DNS `ai-relay.connectyhub.com.br` criado; variáveis Production do relay gravadas, segredo sensível sem valor no Git. Imagem mínima usa somente ws 8.21.0, mesmo artefato fixado no lockfile original; estado persistente privado, memória 512 MB, CPU 1, porta 127.0.0.1:3120. Publicação de aplicativo/proxy e verificações finais ainda em andamento neste checkpoint.

## Validação antes da publicação do aplicativo

Suíte geral: **2.713 testes em 210 arquivos**, todos aprovados. Complemento posterior de CORS/limite de upload e recursos nativos: **13 testes**, aprovados. TypeScript e ESLint dos arquivos alterados passaram. Build de produção Webpack passou, com 103 páginas estáticas; Turbopack local recusou o junction de node_modules fora do worktree, sem alteração do bundler configurado para a Vercel.

Relay iniciado na VPS e proxy Caddy validado/recarregado com backup da configuração anterior. HTTPS público /health retornou 200; PUT sem ticket retornou 401, sem contato com o provedor. Imagem mínima, volume privado, limite de 512 MB/1 CPU e filesystem somente leitura. Preflight público confirmado: HTTP 204 com autorização de PUT e cabeçalhos do ticket. Aplicativo ainda aguarda push/deploy. [Matriz de 85 métodos REST e pendências de paridade](matriz-paridade-gemini-2026-09-14.md).

## Publicação incremental confirmada — 14/09, 05:51 UTC

Commit `68ae22b` na master, implantação `dpl_3jxPYR4jvxuVjLcLVuNYLQcsoq2r` Ready/Production. Inspeção do domínio principal confirmou a implantação e os aliases com/sem www; logs de produção confirmaram o commit e build Turbopack com TypeScript aprovados. OpenAPI ConnectyHub 1.6.0 e Gemini versionado responderam HTTP 200, com 65 e 15 operações respectivamente; tarifas públicas retornaram 35 modelos. Rotas privadas e upload sem credencial retornaram 401. Controle privado autenticado recusou ticket fictício inexistente via RPC com 401, comprovando carregamento do segredo e comunicação com o banco, sem chamada ao Google.

Relay HTTPS ativo: health 200, preflight 204; configuração de limites e volume persistente preservada. Não houve arquivo pessoal, inferência Live real nem geração paga para homologação. A compatibilidade integral permanece pendente na matriz. Este registro posterior permanece local até o próximo pacote para evitar deploy somente documental.

## Complemento de lotes antes da publicação

Adicionados seis métodos nativos, totalizando 21 adaptadores: criação de lotes de geração e embeddings e consulta/listagem/cancelamento/exclusão. A reserva e liquidação existentes continuam únicas; contagens exatas anteriores ao envio ficam preservadas por item para embeddings que omitem usageMetadata. Resultados nativos são persistidos e o envelope metadata.output é compatível com o SDK oficial. Identidades locais e metadados do cliente permanecem separados dos nomes e índices internos.

Validação: 23 testes de rotas/lotes/ciclo de recursos; teste offline com SDK @google/genai 2.22.0, sem requisições externas; lint e build Webpack com TypeScript aprovados. Suíte geral: 2.716 passaram e sete testes SQL excederam 5 segundos sob concorrência; os sete arquivos foram repetidos com dois processos e margem de 30 segundos, com 22 testes aprovados. Após a revisão documental, 13 testes de documentação/rotas passaram. Nenhuma mudança de migration, preço ou configuração real nesta etapa; nenhuma geração, cancelamento de lote real ou cobrança de teste.

### Dependências de autorização nesta retomada

A revisão automática rejeitou o comando de commit/publicação do complemento na master por exigir autorização explícita para este escopo. O comando foi bloqueado antes de executar; HEAD e produção permanecem em `68ae22b`. As alterações de lotes continuam locais, testadas e disponíveis para revisão. Solicitada autorização direta ao titular; não houve nova tentativa de publicação após a rejeição.

O envio de checkpoints à tarefa de origem também passou a ser bloqueado pela revisão automática, inclusive um retorno reduzido ao progresso. Foi solicitada autorização explícita para esse destino. Isso não representa indisponibilidade dos serviços nem falha nos testes; são permissões pendentes para publicação e comunicação entre tarefas. Não considerar a matriz integral concluída.

## Complemento File Search concluído localmente — 14/09, 06:40 UTC

Nove métodos nativos adicionados: coleções (criar/listar/consultar/excluir), importar arquivo, documentos (listar/consultar/excluir) e consultar operação de indexação. Total local de 30 métodos, enquanto o último pacote publicado mantém 15. OpenAPI e guia são gerados das mesmas definições. Coleções/documentos pertencem ao projeto autenticado, documentos são conferidos contra a coleção pai e referências do SDK são traduzidas antes da validação central. A exclusão nativa envia force=false por padrão; a regra anterior dos endpoints ConnectyHub foi preservada. Recusa do fornecedor não marca o documento como excluído.

Indexação reutiliza a operação financeira existente. A consulta não reenvia arquivo nem cria nova reserva; resposta sem identidade confirmada do documento não é liquidada como sucesso. Não houve mudança de tarifas, planos, carteira, recarga, migrations ou serviços publicados neste complemento. File Search aceita apenas arquivos previamente enviados pelo transporte ConnectyHub; upload binário nativo, embeddingModel personalizado e listagens com atualização individual em tempo real não são implementados.

Verificação: **48 testes direcionados**, **2.735 testes gerais em 213 arquivos**, ESLint e build Webpack com TypeScript aprovados. SDK oficial @google/genai 2.22.0 executou dez chamadas com transporte totalmente simulado, incluindo File Search e resultado com parent/documentName; zero chamadas externas. Não houve arquivo pessoal, indexação real ou cobrança de teste. Build compilou em 37,3 segundos e TypeScript em 25,8 segundos, gerando 103 páginas. O build local usa Webpack devido ao junction de dependências do worktree; nenhuma configuração de bundler foi alterada.

Os complementos permanecem sem commit/push após a rejeição anterior. O pedido de aprovação original cobria seis métodos de lotes; a revisão agora inclui também os nove de File Search. Ainda falta autorização direta para publicar esse conjunto e para compartilhar um checkpoint com “Correções da API LLM”. Nenhuma nova tentativa de publicação ou mensagem entre tarefas foi feita após os bloqueios. Demais métodos da matriz continuam explicitamente pendentes; esta entrega incremental não encerra a paridade aplicável.

## Autorização direta para publicação

Após receber o resumo dos complementos e dos testes, o titular autorizou verbalmente a publicação de lotes e File Search. A master remota foi conferida e permanece em 68ae22b, sem alterações concorrentes a integrar. Publicação retomada dentro desse escopo, sem alterar preços, migrations ou realizar gerações pagas de teste. A autorização de compartilhamento com a tarefa de origem não foi presumida a partir da autorização de publicação.
