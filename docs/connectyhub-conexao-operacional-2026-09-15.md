# Conexão operacional da ConnectyHub — 15/09/2026

Publicado no [portal de infraestrutura](https://infraestrutura.connectyhub.com.br), em stack própria na VPS. Complementa a [primeira conexão em leitura](connectyhub-projeto-conectado-2026-09-15.md): o administrador agora consulta funções e execuções reais do Inngest e pode baixar os arquivos selecionados da organização ConnectyHub Interno. Não migra Betel/Vision nem altera a hospedagem da aplicação na Vercel.

## Origem e controles

- Coletor fixo consulta o Inngest existente pela API GraphQL, aplicativo `connectyhub` e callback da Vercel verificados. Observados 45 cadastros de funções, uma amostra das 100 execuções mais recentes em 24 horas e nenhuma execução FAILED na consulta específica desse período. A interface informa truncamento e distingue conclusão técnica de sucesso de negócio. Não expõe payloads, resultados de atendimentos, chaves ou comandos administrativos.
- Banco produtivo consultado por SELECTs fixos em transação READ ONLY. Snapshot minimizado e datado no banco independente do portal, atualizado a cada minuto. Credenciais produtivas permanecem no host, fora do processo web. A coleta usa acesso administrativo local do Docker; ainda não é uma credencial SQL de privilégio mínimo.
- Downloads GET/HEAD exigem sessão administrativa, projeto conectado e registro selecionado. O leitor relê a organização e a origem no banco produtivo. Dois objetos vêm do Supabase Storage privado e um objeto antigo do R2, usando requisição S3 autenticada. Nenhuma ACL foi aberta. Chaves do fornecedor não chegam ao navegador.
- Leitor sem porta pública, por socket Unix e segredo próprio, com caminho restrito a UUIDs, consulta fixa e destinos permitidos. Não aceita URL arbitrária, redirecionamento, escrita ou exclusão. Respostas são anexos binários, `no-store` e `nosniff`, limitados a 20 MB. O diretório do socket é preservado entre reinícios; isso foi corrigido e retestado.
- Seleção atual: três registros `lead_files` da organização interna. Não é inventário completo de todos os clientes, nem cópia integral do R2. Metadados de contabilidade podem ter outro escopo/data e não equivalem aos três downloads.

## Evidência funcional

| Verificação | Resultado |
|---|---|
| Build Linux Next.js e TypeScript | Aprovados; imagem `sha256:9aad1d3646d597c4693bee71750cb7b43836df2135b7d6dc584502667e5134a0` publicada |
| Autorização/sessão/arquivos | 16 testes Vitest aprovados |
| Gateway Unix e restrição de destinos | Três testes Python aprovados |
| HTTP real após recuperação do portal | 69 verificações aprovadas: leitura administrativa, cinco seções, fonte recente, telemetria recente, arquivos e recusas de acesso/escrita |
| RLS SQL | Seis verificações com rollback, incluindo cliente explicitamente vinculado como operador recusado |
| Objetos físicos | GET e HEAD dos três arquivos aprovados; tamanho e SHA256 registrados |
| Diagnóstico no Inngest existente | Um único `connectyhub/admin.ping`: COMPLETED, resultado funcional `online`, etapa `record-ping` concluída |
| Persistência após backup/reinício | Login, registro, arquivo QA e um job diagnóstico concluído preservados |
| Navegação autenticada | Arquivos e links privados, automações reais e métricas administrativas observados no Chrome |
| Serviços anteriores | 16 containers ativos, nenhum reinício nesta entrega; 15 healthchecks healthy |

O diagnóstico não enviou WhatsApp, não gerou IA, não cobrou e não repetiu um atendimento. Seu sucesso prova esse percurso diagnóstico; não certifica todas as automações de negócio. Nenhum novo runtime Inngest foi instalado.

Evidências sem segredos ou conteúdo dos arquivos: [diretório desta entrega](evidence/managed-connectyhub-operational-2026-09-15). O manifesto de fontes confere bytes publicados normalizando somente finais de linha. A imagem de rollback anterior foi preservada sob `connectyhub-managed-portal:before-operational-20260915`.

## Recuperação

Backup do portal `20260915T155319Z` restaurado em PostgreSQL isolado e sem rede. Verificados banco, RLS, fonte administrativa, objeto privado QA e os três objetos selecionados por SHA256. Cópia privada fora da VPS salva no computador do titular e conferida por hash. Arquivos de segredo permanecem somente nos arquivos privados de recuperação, fora do Git.

Também foi copiado para fora da VPS o arquivo produtivo existente `connectyhub-20260915T063618Z.tar.gz`, de 674.711.126 bytes, com SHA256 de origem/destino conferido. **Não foi realizado novo ensaio de restauração integral desse arquivo produtivo nesta etapa.** A restauração do portal não substitui um ensaio integral de desastre da produção. Os dumps de Supabase/Inngest e Redis têm momentos de coleta distintos; não representam uma transação única entre serviços.

O backup diário do portal às 02:30 BRT pausa brevemente somente o portal. A cópia de objetos selecionados é limitada a 50 MB totais; exceder esse limite falha explicitamente. Retenção e exportação externa recorrente continuam manuais. A cópia local privada já existe, mas ainda falta automatizar sua recorrência e definir RPO/RTO para recuperação integral. Esta entrega não comprova backup integral de todos os buckets R2.

## Preparação da Betel

A conexão administrativa e a recuperação do portal estão validadas o suficiente para iniciar **preparação isolada**: inventário, contrato de dados, desenho de destino e plano de importação/reconciliação. Não há bloqueio técnico conhecido nesta conexão que impeça esse levantamento.

Ainda não é autorização nem prova para trocar a produção da Betel. Antes do cutover, são necessários inventário de schema/Auth/arquivos/funções/agendamentos, destino dedicado com isolamento confirmado, mapeamento de endpoints/segredos, importação reconciliada, acesso real com usuário cliente, teste de fluxos e rollback. O portal não provisiona automaticamente um Supabase completo por projeto e não move os handlers da Vercel. Betel e Vision permanecem nos destinos atuais.
