# Matriz de paridade Gemini — 14/09/2026

Inventário REST público, revisão 20260910. Implementação local deste pacote; publicação não implica homologação paga ou disponibilidade de todos os modelos. A meta de cobertura integral aplicável continua aberta.

O discovery contém 85 métodos; Interactions e os protocolos WebSocket Live/música precisam de referências complementares e não entram nesse total. Métodos legados, tuning e permissões precisam de avaliação de aplicabilidade, não devem ser silenciosamente contados como implementados.

| Método oficial | HTTP | Estado neste pacote |
|---|---|---|
| `auth_tokens.create` | POST | Pendente de classificação/implementação/homologação |
| `batches.cancel` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `batches.delete` | DELETE | Contrato próprio existente; equivalência nativa ainda a auditar |
| `batches.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `batches.list` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
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
| `fileSearchStores.create` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.delete` | DELETE | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.documents.delete` | DELETE | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.documents.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.documents.list` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.importFile` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.list` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.operations.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `fileSearchStores.upload.operations.get` | GET | Contrato próprio existente; equivalência nativa ainda a auditar |
| `files.delete` | DELETE | Adaptador nativo implementado; limites documentados |
| `files.get` | GET | Adaptador nativo implementado; limites documentados |
| `files.list` | GET | Adaptador nativo implementado; limites documentados |
| `files.register` | POST | Pendente de classificação/implementação/homologação |
| `generatedFiles.list` | GET | Pendente de classificação/implementação/homologação |
| `generatedFiles.operations.get` | GET | Pendente de classificação/implementação/homologação |
| `media.upload` | POST | Transporte próprio PUT na VPS; não equivale ao upload SDK nativo |
| `media.uploadToFileSearchStore` | POST | Pendente de classificação/implementação/homologação |
| `models.asyncBatchEmbedContent` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
| `models.batchEmbedContents` | POST | Adaptador nativo implementado; limites documentados |
| `models.batchEmbedText` | POST | Pendente de classificação/implementação/homologação |
| `models.batchGenerateContent` | POST | Contrato próprio existente; equivalência nativa ainda a auditar |
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

1. Adaptadores nativos de lotes/operações, preservando identidade, consultas sem débito repetido e cancelamentos incertos.
2. Interactions, File Search/documentos, ambientes e arquivos gerados: mapear schemas oficiais, autoria por projeto e cobrança de recursos duráveis.
3. Protocolos SDK de upload/Live, aliases e famílias avançadas; conferir tarifas e disponibilidade sem geração paga de teste.
4. Classificar métodos legados/tuning, quotas e restrições de Grounding com evidência oficial.
5. Testes de SDK, integração e limites; publicação incremental e relatório final por método.

Nenhum método pendente acima é promessa de disponibilidade atual. O inventário factual está em [JSON](evidencias/gemini-discovery-methods-2026-09-14.json).
