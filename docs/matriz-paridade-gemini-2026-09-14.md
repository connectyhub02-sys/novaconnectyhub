# Matriz de paridade Gemini — 14/09/2026

Inventário REST público, revisão 20260910. Implementação local deste pacote; publicação não implica homologação paga ou disponibilidade de todos os modelos. A meta de cobertura integral aplicável continua aberta.

**Checkpoint publicado:** 30 métodos em b742e91 + correção 508953c, domínio principal conferido em 14/09 às 13:09 UTC. As referências abaixo a complementos locais descrevem sua etapa anterior; agora esses lotes e File Search estão publicados. Os demais métodos pendentes continuam pendentes. Quatorze probes públicos passaram, sem geração paga; [evidência](evidencias/gemini-publicacao-complementos-2026-09-14.json).

O discovery contém 85 métodos; Interactions e os protocolos WebSocket Live/música precisam de referências complementares e não entram nesse total. Métodos legados, tuning e permissões precisam de avaliação de aplicabilidade, não devem ser silenciosamente contados como implementados.

| Método oficial | HTTP | Estado neste pacote |
|---|---|---|
| `auth_tokens.create` | POST | Pendente de classificação/implementação/homologação |
| `batches.cancel` | POST | Adaptador nativo local; lotes inline até 100 itens, limites documentados |
| `batches.delete` | DELETE | Adaptador nativo local; lotes inline até 100 itens, limites documentados |
| `batches.get` | GET | Adaptador nativo local; lotes inline até 100 itens, limites documentados |
| `batches.list` | GET | Adaptador nativo local; lotes inline até 100 itens, limites documentados |
| `batches.updateEmbedContentBatch` | PATCH | Contrato próprio existente; equivalência nativa ainda a auditar |
| `batches.updateGenerateContentBatch` | PATCH | Contrato próprio existente; equivalência nativa ainda a auditar |
| `cachedContents.create` | POST | Adaptador nativo implementado; limites documentados |
| `cachedContents.delete` | DELETE | Adaptador nativo implementado; limites documentados |
| `cachedContents.get` | GET | Adaptador nativo implementado; limites documentados |
| `cachedContents.list` | GET | Adaptador nativo implementado; limites documentados |
| `cachedContents.patch` | PATCH | Adaptador nativo implementado; limites documentados |
| `corpora.create` | POST | Pendente de classificação/implementação/homologação |
| `corpora.delete` | DELETE | Pendente de classificação/implementação/homologação |
| `corpora.get` | GET | Pendente de classificação/implementação/homologação |
| `corpora.list` | GET | Pendente de classificação/implementação/homologação |
| `corpora.operations.get` | GET | Pendente de classificação/implementação/homologação |
| `corpora.permissions.create` | POST | Pendente de classificação/implementação/homologação |
| `corpora.permissions.delete` | DELETE | Pendente de classificação/implementação/homologação |
| `corpora.permissions.get` | GET | Pendente de classificação/implementação/homologação |
| `corpora.permissions.list` | GET | Pendente de classificação/implementação/homologação |
| `corpora.permissions.patch` | PATCH | Pendente de classificação/implementação/homologação |
| `dynamic.generateContent` | POST | Pendente de classificação/implementação/homologação |
| `dynamic.streamGenerateContent` | POST | Pendente de classificação/implementação/homologação |
| `environments.create` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `environments.delete` | DELETE | Contrato próprio existente; equivalência nativa ainda a auditar |
| `environments.files.media.download` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `environments.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `environments.list` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.create` | POST | Adaptador nativo local; displayName até 200, embeddingModel personalizado pendente |
| `fileSearchStores.delete` | DELETE | Adaptador nativo local; force explícito e proteção de indexação em andamento |
| `fileSearchStores.documents.delete` | DELETE | Adaptador nativo local; force explícito e exclusão confirmada pelo provedor |
| `fileSearchStores.documents.get` | GET | Adaptador nativo local; identidade de projeto/coleção validada |
| `fileSearchStores.documents.list` | GET | Adaptador nativo local; snapshot local, página até 20 documentos |
| `fileSearchStores.get` | GET | Adaptador nativo local; consulta autenticada ao fornecedor |
| `fileSearchStores.importFile` | POST | Adaptador nativo local; arquivo próprio previamente enviado, cobrança existente |
| `fileSearchStores.list` | GET | Adaptador nativo local; snapshot local, página até 20 coleções |
| `fileSearchStores.operations.get` | GET | Adaptador nativo local; reconciliação da indexação sem novo envio |
| `fileSearchStores.upload.operations.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `files.delete` | DELETE | Adaptador nativo implementado; limites documentados |
| `files.get` | GET | Adaptador nativo implementado; limites documentados |
| `files.list` | GET | Adaptador nativo implementado; limites documentados |
| `files.register` | POST | Pendente de classificação/implementação/homologação |
| `generatedFiles.list` | GET | Pendente de classificação/implementação/homologação |
| `generatedFiles.operations.get` | GET | Pendente de classificação/implementação/homologação |
| `media.upload` | POST | Transporte próprio PUT na VPS; não equivale ao upload SDK nativo |
| `media.uploadToFileSearchStore` | POST | Pendente de classificação/implementação/homologação |
| `models.asyncBatchEmbedContent` | POST | Adaptador nativo local; lotes inline até 100 itens, limites documentados |
| `models.batchEmbedContents` | POST | Adaptador nativo implementado; limites documentados |
| `models.batchEmbedText` | POST | Pendente de classificação/implementação/homologação |
| `models.batchGenerateContent` | POST | Adaptador nativo local; lotes inline até 100 itens, limites documentados |
| `models.countMessageTokens` | POST | Pendente de classificação/implementação/homologação |
| `models.countTextTokens` | POST | Pendente de classificação/implementação/homologação |
| `models.countTokens` | POST | Adaptador nativo implementado; limites documentados |
| `models.embedContent` | POST | Adaptador nativo implementado; limites documentados |
| `models.embedText` | POST | Pendente de classificação/implementação/homologação |
| `models.generateAnswer` | POST | Pendente de classificação/implementação/homologação |
| `models.generateContent` | POST | Adaptador nativo implementado; limites documentados |
| `models.generateMessage` | POST | Pendente de classificação/implementação/homologação |
| `models.generateText` | POST | Pendente de classificação/implementação/homologação |
| `models.get` | GET | Adaptador nativo implementado; limites documentados |
| `models.list` | GET | Adaptador nativo implementado; limites documentados |
| `models.operations.get` | GET | Pendente de classificação/implementação/homologação |
| `models.operations.list` | GET | Pendente de classificação/implementação/homologação |
| `models.predict` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `models.predictLongRunning` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `models.streamGenerateContent` | POST | Adaptador nativo implementado; limites documentados |
| `tunedModels.asyncBatchEmbedContent` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.batchGenerateContent` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.create` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.delete` | DELETE | Pendente de classificação/implementação/homologação |
| `tunedModels.generateContent` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.generateText` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.get` | GET | Pendente de classificação/implementação/homologação |
| `tunedModels.list` | GET | Pendente de classificação/implementação/homologação |
| `tunedModels.operations.get` | GET | Pendente de classificação/implementação/homologação |
| `tunedModels.operations.list` | GET | Pendente de classificação/implementação/homologação |
| `tunedModels.patch` | PATCH | Pendente de classificação/implementação/homologação |
| `tunedModels.permissions.create` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.permissions.delete` | DELETE | Pendente de classificação/implementação/homologação |
| `tunedModels.permissions.get` | GET | Pendente de classificação/implementação/homologação |
| `tunedModels.permissions.list` | GET | Pendente de classificação/implementação/homologação |
| `tunedModels.permissions.patch` | PATCH | Pendente de classificação/implementação/homologação |
| `tunedModels.streamGenerateContent` | POST | Pendente de classificação/implementação/homologação |
| `tunedModels.transferOwnership` | POST | Pendente de classificação/implementação/homologação |

## Próximos blocos concretos

1. Publicar os complementos locais de lotes e File Search após resolver a autorização pendente; validar o contrato publicado sem geração paga.
2. Interactions, ambientes e arquivos gerados: mapear schemas oficiais, autoria por projeto e cobrança de recursos duráveis.
3. Protocolos SDK de upload/Live, aliases e famílias avançadas; conferir tarifas e disponibilidade sem geração paga de teste.
4. Classificar métodos legados/tuning, quotas e restrições de Grounding com evidência oficial.
5. Testes de SDK, integração e limites; publicação incremental e relatório final por método.

Nenhum método pendente acima é promessa de disponibilidade atual. O inventário factual está em [JSON](evidencias/gemini-discovery-methods-2026-09-14.json).

## Complemento de lotes em validação local

Seis métodos nativos adicionais (21 no total), ainda não publicados neste registro. SDK oficial JavaScript `@google/genai` 2.22.0 conferido com transporte totalmente simulado: geração, contagem, criação/consulta de lotes e criação de lote de embeddings. A verificação detectou e corrigiu a necessidade de `metadata.output` para o SDK expor o destino do lote. Metadados de cliente não são confundidos com o índice interno da liquidação.

Reprodução: instale o SDK em diretório temporário isolado, defina `CONNECTYHUB_SDK_TEST_ROOT` e execute `node scripts/verify-gemini-sdk-contract.mjs`. O script impede destinos externos e não usa credenciais reais. Lotes por arquivo, prioridade, webhooks e filtros continuam pendentes; exclusão de operação em andamento é recusada para preservar a apuração financeira.

## Complemento File Search local

Nove métodos adicionais, somando **30 métodos nativos locais e 15 publicados** no último checkpoint. Dez chamadas do SDK oficial 2.22.0 passaram com transporte simulado, incluindo criação/consulta de coleção, importação, consulta da operação e geração com referência à coleção. O campo nativo `parent` e as referências `fileSearchStores/UUID` são traduzidos sem remover a validação de propriedade. Uma indexação sem identidade confirmada do documento não é liquidada como sucesso.

Limites explícitos: upload binário nativo e sua rota de operações permanecem pendentes; o cliente usa o transporte ConnectyHub até 20 MB antes de importar. Seleção de embeddingModel ainda não suportada. Listagens retornam o último estado persistido, não uma leitura em tempo real de cada documento. Consulta individual atualiza o resultado; excluir não dispensa apuração de operação pendente. Fontes: [File Search Stores](https://ai.google.dev/api/file-search/file-search-stores) e [Documents](https://ai.google.dev/api/file-search/documents). Testes simulados não homologam indexação real nem cobrança do fornecedor.
