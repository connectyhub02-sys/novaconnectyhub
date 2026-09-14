# Auditoria de prontidão da API de IA da ConnectyHub

Auditoria iniciada em 13/09 e concluída em 14/09/2026, horário de Brasília. Base local examinada: `2301a69311e006348e35052f5899425902ebd491`. Escopo: API externa, documentação, paridade com Gemini Developer API, preços/créditos, autorização, painel e recarga automática. Documento interno: contém achados de segurança, sem credenciais nem dados identificáveis de clientes.

## Parecer

**Não pronta para liberação geral a integradores nem para ser anunciada como idêntica à Gemini Developer API.** Há implementação extensa, documentação pública acessível e 135 testes locais aprovados, mas a auditoria encontrou um bloqueador de segurança em produção e não encontrou um percurso externo faturável concluído que comprove o conjunto chave → modelo → débito → painel.

O bloqueador principal é a concessão de execução a `anon` e `authenticated` em sete funções financeiras `SECURITY DEFINER` da VPS. As migrations locais exigem acesso exclusivo do serviço. O resultado de testes locais de permissões não representa o estado publicado.

Não houve alteração da aplicação, configuração, permissões, tarifas ou saldo; nenhuma chave criada, cobrança, geração paga ou envio a cliente. As consultas de produção usaram transações somente leitura no SQL Editor; a única escrita de interface foi o texto de uma consulta privada da própria auditoria. Este relatório e sua evidência sanitizada são os únicos artefatos novos. Não houve commit, push ou deploy. A auditoria terminou; correções e homologações listadas abaixo permanecem pendentes.

| Dimensão | Parecer | Fundamentação |
|---|---|---|
| Segurança financeira no banco publicado | Bloqueada | Funções privilegiadas executáveis por papéis de cliente; achado A01 |
| API básica de texto | Implementada, homologação externa pendente | Autenticação, reserva e liquidação no código; nenhuma chave ativa e nenhuma geração de cliente com débito observada |
| API completa, mídia, recursos e Live | Não pronta para promessa geral | Recursos sem registros de uso; Live retornou 503; upload anunciado conflita com limite da hospedagem |
| Documentação própria | Utilizável com restrições | HTML/Markdown/OpenAPI públicos; 37 caminhos e 62 operações, com lacunas de disponibilidade, tamanho e preço |
| Compatibilidade Gemini | Parcial e deliberadamente adaptada | Autenticação, IDs, corpos, respostas, SSE e métodos diferem |
| Tarifas | Configuração nominal identificada | 4× o custo estimado nas 168 tarifas de operações; custo real faturado não conciliado |
| Débito por plano e painel | Implementado, não comprovado de ponta a ponta | Código diferencia acesso/plano/carteira; produção só tem uma geração interna sem débito e duas falhas |
| Recarga automática no cartão | Implementada, não homologada | Nenhuma política, cartão ativo ou execução em produção; risco de ACL também se aplica |

## A01 — crítico: permissões financeiras divergentes na VPS

Leitura direta do catálogo PostgreSQL confirmou, para todas as funções abaixo:

- `prosecdef = true`, proprietário `postgres`;
- ACL explícita `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`;
- `has_function_privilege(..., 'EXECUTE') = true` para `anon`, `authenticated` e `service_role`;
- `anon` e `authenticated` têm `USAGE` no schema `public`, não são superusuários e não têm `BYPASSRLS`;
- a busca textual dos corpos não encontrou `auth.uid()` nem `current_user`. Essa busca não substitui revisão integral de autorização, mas confirma que não há esses guardas diretos.

| Função | Papel previsto no código |
|---|---|
| `claim_ai_request(uuid,text,text)` | Registrar/reutilizar identidade da operação |
| `reserve_ai_credits(uuid,numeric,text,jsonb)` | Reservar saldo antes de despachar |
| `finish_ai_request(uuid,text,jsonb,jsonb,text)` | Finalizar uso e débito |
| `settle_ai_operation(uuid,text,jsonb,jsonb,text)` | Liquidar recursos avançados |
| `save_credit_topup_policy(uuid,uuid,jsonb)` | Gravar consentimento/condições de recarga |
| `claim_credit_topup(uuid)` | Preparar tentativa financeira automática |
| `fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb)` | Liberar créditos/entitlements de pagamento confirmado |

As migrations `0086`, `0106`, `0110` e `0128` revogam execução de papéis públicos/de cliente. `0119` substitui funções de solicitação/reserva; o estado resultante da VPS não preserva a restrição esperada. Não foi determinada a operação que concedeu essas permissões, nem se ocorreu durante restauração, implantação ou administração posterior.

**Impacto:** a segurança da rota Next.js não basta se um papel de cliente puder invocar diretamente funções que operam com privilégios do proprietário e recebem identidades/valores como parâmetros. Há risco de manipulação de solicitações, reservas, liquidações ou autorizações fora do fluxo previsto. Não foi tentada exploração, chamada financeira por HTTP, alteração de saldo ou cobrança; não há evidência de abuso nesta auditoria.

Prioridade: corrigir ACLs em uma mudança controlada, verificar funções irmãs, permissões de tabelas e privilégios padrão; depois testar com papéis reais e entrada fictícia em ambiente isolado, comprovando bloqueio antes de qualquer mutação. Preservar as concessões legítimas de serviço. Não aplicar uma revogação global indiscriminada que interrompa funções destinadas ao cliente. A causa do desvio deve ser removida para que uma restauração não o reproduza. A semântica de `SECURITY DEFINER` e o cuidado com permissões estão na [documentação do PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html).

## Evidência observada em produção

Consultas agregadas feitas no Supabase da VPS, sem ler prompts, respostas privadas, hashes de chaves ou tokens de cartão:

| Objeto | Resultado |
|---|---|
| Projetos da API | 3 na leitura inicial |
| Chaves | 3 revogadas; 0 ativas |
| Solicitações externas registradas | 3: uma concluída e duas falhas, todas em 08/09 |
| Última conclusão | 08/09/2026 16:08:16 UTC; `internal_shadow` |
| Conclusão interna | Custo estimado R$ 0,002475; 0 créditos cobrados/reservados |
| Duas falhas | `customer_billable`; custo e débito zero |
| Transações de créditos ligadas ao uso `external_ai%` | 0 |
| Recursos em `ai_resources` | 0; nenhuma evidência de arquivo, cache, lote, Live, webhook ou trigger de cliente |
| Políticas e execuções de recarga automática | 0 e 0 |
| Cartões ativos no cofre Asaas | 0 |

Isso não indica que toda a IA da plataforma esteja sem uso: agentes WhatsApp e outras funcionalidades possuem percursos e classificação próprios. Indica que **o produto API externa não tem evidência observada de consumo faturável bem-sucedido após a migração**. O custo da geração interna não é uma fatura do Google nem uma venda a cliente.

O painel `/dashboard/api-ia` abriu, exibiu saldo, gráficos, seleção de período/projeto, atividades recentes e início de criação de projeto. A organização selecionada não tinha projetos ou uso da API. `/dashboard/creditos` exibiu os quatro pacotes e informou a necessidade de cartão ativo antes da autorização automática. Não foram acionados botões de compra/criação/salvamento. A sessão era administrativa no contexto de cliente: isso confirma renderização/leitura, não prova isolamento com credenciais reais de dois clientes.

### Verificações HTTP sem credencial

Na coleta inicial, foram usadas requisições mínimas sem chave válida, sem disparar modelo:

| Chamada em `/api/v1/ai` | Resultado |
|---|---|
| `GET /models` | 401 |
| `POST /chat/completions` | 401, `invalid_api_key` |
| `POST /models/flash-3.5:generateContent` | 401 |
| `POST /embeddings` | 401 |
| `GET /files` | 401 |
| `GET /models` com `x-goog-api-key` sintética | 401 |
| `POST /models/flash-3.5:countTokens` | 404, operação não encontrada |
| `POST /live` | 503, `live_unavailable` |

O código de `createAiLive` verifica URL WSS/segredo do relay antes de autenticar. Portanto o 503 observado comprova indisponibilidade dessa configuração no caminho publicado testado; não prova funcionamento de WebSocket nem de qualquer modelo Live. O 401 dos demais endpoints só prova a barreira inicial, não a execução autenticada.

## Caminho de acesso, consumo e plano

Fluxo identificado: cadastro/acesso ao painel → projeto na organização responsável → chave vinculada a modelo → `authenticateAi` → contrato e entitlement `llm_api` → tarifação pelo plano da carteira → identidade idempotente → contagem/reserva → fornecedor → medição/liquidação → `usage_events` e `credit_transactions` → consulta da operação e gráficos.

| Etapa | O que foi verificado | Limite atual |
|---|---|---|
| Onboarding | Painel orienta criar projeto/chave; código exige conta operacional e papéis de gestão | Cadastro externo, compra inicial e chave nova não executados |
| Chave | Segredo aleatório `chy_ai_`, hash SHA-256 no banco, revelação na criação; revogação e projeto pausado são verificados | Três chaves revogadas; nenhuma válida para teste autorizado |
| Identidade | Chave → projeto → organização; contrato resolve organização da carteira | Necessário teste real de duas organizações e grupo com carteira compartilhada |
| Plano | `plan-entitlements.ts` libera `llm_api` a partir de Starter e no trial permitido, sujeito a estado/overrides | `module_codes` do catálogo não é sozinho a decisão de acesso à API |
| Modelo | Vinculado à chave; não permite trocar silenciosamente; disponibilidade combina catálogo, provedor e tarifas | Flag de catálogo não comprova quota/acesso real no Google |
| Reserva | SQL bloqueia carteira e desconta reservas concorrentes do disponível | ACL de produção invalida a confiança no acesso exclusivo a essas RPCs |
| Liquidação | Medição inclui entrada, saída/raciocínio e dimensões cobradas; consumo incerto mantém reserva | Nenhuma venda API observada para reconciliar com débito real |
| Idempotência | Mesma chave de idempotência/corpo reutiliza operação; corpo divergente conflita | Ainda requer teste publicado com chave de homologação |
| Painel | Usa carteira, últimas 50 solicitações e resumo SQL para 7/30/90 dias, por projeto | Gráficos zerados não comprovam que um débito futuro aparecerá corretamente |
| Reconciliação | Rotina Inngest de cinco minutos reconcilia IA, recursos, Live e recargas | Recursos/tentativas inexistentes não exercitam reconciliação de falha real |

Planos ativos lidos no banco: Trial R$0/1.000 créditos; Internal R$0/0; Starter R$97/3.000; Pro R$247/10.000; Scale R$497/25.000. Os valores representam catálogo, não necessariamente contratos negociados. `internal_shadow` absorve o uso; trial e clientes são medidos conforme o estado de cobrança. A tarifa admite precedência por plano, mas as tarifas ativas examinadas da API estão com `plan_code = null`: **não foi encontrada diferença de preço unitário da API entre Starter, Pro e Scale**. A franquia, o acesso e termos contratados podem diferir.

Não se deve confundir `billing_plans.auto_recharge_min_credits` ou preço de excedente com autorização de cartão. O consentimento operacional usa `credit_topup_policies` e o pacote escolhido.

## Preço, markup e margem

### O que está configurado

O código usa valor nominal de **R$0,01 por crédito** para estimativas. As tarifas lidas usam custo de referência em BRL, com metadados de câmbio de planejamento **R$6/US$**, e preço de créditos equivalente a **4× esse custo**. Não é cotação cambial atual, preço pago por todo cliente, margem líquida ou garantia de custo do Google.

- Multiplicador = receita nominal / custo estimado = 4.
- Markup sobre custo = (4 − 1) × 100 = **300%**.
- Margem bruta nominal = (4 − 1) / 4 = **75%**.
- Mínimo de 1 crédito e arredondamento para cima podem aumentar a relação em operações pequenas.

Nas **168 tarifas ativas de operações**, mínimo e máximo de `credit_price × 0,01 / provider_cost` foram ambos 4, sem especialização por plano. Entrada/saída básicas e contexto longo seguem a mesma relação. As tabelas abaixo mostram valores configurados por um milhão de tokens, antes do mínimo; não são débitos já realizados.

| Modelo Google / perfil | Custo estimado entrada / saída em BRL | Créditos entrada / saída | Receita nominal entrada / saída em BRL |
|---|---:|---:|---:|
| Gemini 3.1 Pro Preview e Customtools, até 200 mil tokens | 12 / 72 | 4.800 / 28.800 | 48 / 288 |
| Mesmos modelos, contexto acima de 200 mil | 24 / 108 | 9.600 / 43.200 | 96 / 432 |
| Gemini 3.5 Flash | 9 / 54 | 3.600 / 21.600 | 36 / 216 |
| Gemini 3.5 Flash-Lite | 1,80 / 15 | 720 / 6.000 | 7,20 / 60 |
| Gemini 3.6, 3.7 e 3.8 Flash | 4,50 / 22,50 | 1.800 / 9.000 | 18 / 90 |
| Gemini Embedding 001, texto | 0,90 / — | 360 / — | 3,60 / — |
| Gemini Embedding 2 e Preview, texto | 1,20 / — | 480 / — | 4,80 / — |

Conferência oficial amostral de Standard: Pro 3.1 US$2/12 (contexto longo 4/18), Flash 3.5 1,50/9, Flash-Lite 3.5 0,30/2,50 e Flash 3.6–3.8 0,75/3,75 até 31/12/2026 correspondem às referências configuradas. A tabela do fornecedor já prevê aumento de Flash 3.6–3.8 em janeiro de 2027. **Não foi certificada a correspondência individual de todas as 168 tarifas**, descontos negociados, Flex/Priority ou franquias gratuitas. [Preços oficiais](https://ai.google.dev/gemini-api/docs/pricing).

### Outras unidades efetivamente presentes

| Exemplo lido no banco | Unidade | Custo estimado BRL | Créditos | Receita nominal BRL |
|---|---|---:|---:|---:|
| Flash 3.8, leitura de cache | 1 milhão de tokens | 0,45 | 180 | 1,80 |
| Flash 3.8, armazenamento de cache | 1 milhão de tokens × hora | 3 | 1.200 | 12 |
| Flash 3.8 Batch, entrada / saída | 1 milhão de tokens | 2,25 / 11,25 | 900 / 4.500 | 9 / 45 |
| Pro 3.1 Preview, cache | 1 milhão de tokens × hora | 27 | 10.800 | 108 |
| Embedding 2, imagem/documento | 1 milhão de tokens | 2,70 | 1.080 | 10,80 |
| Embedding 2, áudio | 1 milhão de tokens | 39 | 15.600 | 156 |
| Embedding 2, vídeo | 1 milhão de tokens | 72 | 28.800 | 288 |
| Music 3.5 | música | 0,48 | 192 | 1,92 |

O catálogo tem medidores próprios para imagem gerada, áudio, vídeo/duração/resolução, música, pesquisa, Maps, indexação, cache e lotes. `priceAiUnits` exige tarifa positiva para toda dimensão usada e não inventa custo zero. Não aplicar o preço de token textual a mídia, nem assumir que toda operação de lote/cache custa metade: a seleção é por medidor e o fornecedor tem condições próprias. A presença das tarifas não comprova o funcionamento de cada recurso.

### Efeito dos pacotes vendidos

Valores confirmados tanto no catálogo de produção quanto no painel de créditos. Hipótese de cálculo: todo o pacote consumido em operações com tarifa nominal 4×, sem mínimos, bônus, impostos, estornos ou custos de infraestrutura.

| Pacote | Preço / créditos | Receita efetiva por crédito | Multiplicador sobre custo | Markup efetivo | Margem bruta estimada |
|---|---:|---:|---:|---:|---:|
| Resposta Rápida | R$47 / 5.000 | R$0,009400 | 3,760× | 276,00% | 73,40% |
| Venda Mais | R$97 / 12.000 | R$0,008083 | 3,233× | 223,33% | 69,07% |
| Alta Performance | R$197 / 30.000 | R$0,006567 | 2,627× | 162,67% | 61,93% |
| Escala Total | R$397 / 75.000 | R$0,005293 | 2,117× | 111,73% | 52,77% |

Logo, **75% não é a margem de caixa de todos os pacotes**. Nos planos mensais, não é correto atribuir toda a assinatura aos créditos: ela também remunera plataforma, agentes e outros serviços. Créditos incluídos, promoções, rollover e franquias precisam de uma política de alocação para apurar margem por cliente.

### Custo real ainda não demonstrado

Não foi acessada uma fatura/exportação de Cloud Billing com projeto, SKU, modelo, moeda, descontos e período que permita conciliação. `provider_cost`, `connecty_revenue_estimate` e `gross_margin_estimate` são estimativas internas. Não equivalem ao custo efetivamente cobrado, receita reconhecida ou lucro líquido. Há ainda taxas do gateway, impostos, câmbio efetivo, Vercel/VPS, armazenamento, operações incertas, reembolsos e eventual custo absorvido.

Próxima validação financeira: executar consumo controlado autorizado; casar ID da operação, medição, versão da tarifa, débito único e carteira; depois conciliar agregados por SKU/modelo/dia com o custo real do fornecedor. Definir margem desejada é decisão comercial do titular; esta auditoria não alterou preços.

## Recarga automática: percurso e limitações

Fontes: `credits-console.tsx`, rota `/api/dashboard/credits`, `automatic-topups.ts`, migration `0110`, `native-card-checkout.ts`, webhook de plataforma Asaas e `0086_atomic_billing_fulfillment.sql`.

| Passo | Implementação encontrada | Evidência/pendência |
|---|---|---|
| Cartão salvo | Cofre Asaas com token criptografado, vinculado à organização e status ativo | Zero cartões ativos; UI informa pré-requisito de autorização de renovação do plano |
| Consentimento | Titular escolhe pacote, cartão, limiar e teto; checkbox/versionamento `credit_topup_v1` | Nenhuma política salva; não foi autorizado nem ativado nesta auditoria |
| Integridade do pacote | Servidor confere preço/créditos acordados contra produto ativo e venda direta | Mudança de preço exige nova autorização |
| Gatilho | Inngest a cada cinco minutos; até cinco políticas por rodada; ordenação por última conferência | Não é recarga instantânea; limiar precisa comportar essa latência |
| Saldo | Claim lê saldo da carteira e limiar | Usa saldo contábil, não necessariamente disponível após reservas: testar esse caso |
| Limites | No máximo uma tentativa por hora; teto mensal; pendência/incerteza impede outra tentativa | Validado localmente; nenhuma execução real |
| Débito | Cria/vincula cobrança antes de pagar com token; marca despacho antes da mutação externa | Timeout não autoriza duplicar cobrança |
| Resultado | Aprovação passa pela conciliação comum; recusa/erro definitivo desativa política | Reteste autorizado deve incluir recusas, incerteza e desativação concorrente |
| Créditos | `fulfill_confirmed_billing_payment` usa pagamento aprovado e registro único por pagamento | Simulado localmente; ACL publicada está incorreta |
| Webhook | Confere token, recupera pagamento e reconcilia identidade/estado | Não houve webhook real de recarga automática nesta auditoria |
| Painel | Pacotes e explicação de recarga disponíveis; sem cartão, não oferece autorização completa | Não houve teste de compra, concessão de créditos ou confirmação pelo titular |

**Conclusão:** existe um sistema de recarga automática; ele não pode ser anunciado como operacionalmente homologado só porque o código existe. Antes da ativação: resolver A01, testar cartão/consentimento em sandbox suportado e homologar cobrança limitada com autorização específica, se necessária. Validar também grupos cuja organização executora difere da responsável pela carteira. Nenhuma cobrança foi criada para provar funcionamento.

## Matriz de paridade com Gemini Developer API

Alvo técnico desta comparação: a API de desenvolvedor em `generativelanguage.googleapis.com`. Não confundir com aplicativo Gemini, assinatura de consumidor ou recursos empresariais/Vertex. “Idêntica” exige compatibilidade verificável de contrato e operação, não apenas acesso a modelos semelhantes.

| Área | ConnectyHub examinada | Parecer/ação para paridade |
|---|---|---|
| Base e autenticação | `/api/v1/ai`, Bearer `chy_ai_`, chave vinculada a um modelo | Não substitui diretamente autenticação/URLs de SDK Gemini; testar adaptador ou criar contrato nativo versionado |
| Catálogo | IDs próprios e `available/capabilities`; `connectyhub-auto` legado | Não equivale a `models.list` e seus nomes/métodos/limites nativos; manter mapeamento explícito |
| Geração | `:generateContent` recebe subconjunto de `contents`, config e tools | Presença de nome semelhante não garante passthrough |
| Ferramentas | Nomes como `webSearch` e `maps` são traduzidos; `googleSearch/googleMaps` não são aceitos nesse parser | Corpos nativos copiados da referência podem falhar |
| Histórico/config | Um candidato; allowlist de campos/partes; instrução de sistema textual | Falta matriz campo a campo por versão/modelo |
| Contagem | Usada internamente; `:countTokens` público retorna 404 | Falta método esperado por integradores Gemini |
| Resposta nativa | Envelope próprio, créditos, candidatos filtrados; vários metadados removidos | Não preserva integralmente `usageMetadata`, feedback, versão/ID do fornecedor, segurança, citações e logprobs |
| Pensamento | Assinaturas preservadas em partes admitidas; partes `thought=true` removidas | Não prometer retorno idêntico de pensamento/resumo; validar tool round-trip |
| Streaming de conteúdo | Upstream incremental, mas eventos e envelope próprios; final `content.completed` e `[DONE]` | Não é o stream nativo intercambiável com qualquer SDK |
| Chat Completions | Subconjunto próprio; SSE emitido após geração concluída | Compatibilidade parcial, sem resposta incremental nessa rota; já declarado no guia |
| Embeddings | Texto/lista/mídia, tarefa e dimensão; `/embeddings` e envelope próprios | Implementado com contrato próprio; homologação real pendente, não exigir refatoração por suposta ausência de `embedContentConfig`, pois a referência atual já o inclui |
| Files | JSON/base64 até 20 MB no código; IDs locais; ciclo de vida por projeto | Não equivale ao upload retomável nativo; incompatível com teto atual da Vercel |
| Cache | Recurso próprio, TTL e cobrança de armazenamento | Testar expiração, renovação, saldo insuficiente e cache usado em contextos/lotes distintos |
| Batch | Lotes e consulta/cancelamento próprios; reconciliação por operação | Não assumir contrato e resultados nativos; zero recursos reais observados |
| Imagem/voz/transcrição/música/vídeo | Adaptadores, famílias e tarifas, rotas conteúdo/interações/vídeos | Zero evidência API externa em produção; testar retorno, download, filtros e medição por modalidade |
| Search/Maps/URL/Files Search | Ferramentas e medição separadas; Maps direcionado a interações | Conferir contratos, atribuições, contagem e condições de repasse antes da venda |
| Live | Serviço de relay separado, ticket e orçamento reservado; apenas subconjunto de configuração | 503 observado; não operacional no teste |
| Agentes/ambientes/interações | Rotas próprias e recursos controlados por projeto | Exige acesso real aos recursos do fornecedor; não equiparar agentes próprios à totalidade do catálogo Google |
| Webhooks/triggers | Recursos ConnectyHub, HMAC, destino HTTPS público/DNS fixado e reconciliação | Não são automaticamente compatíveis com webhooks Google; nenhuma entrega real observada |
| Quotas | Saldo limita consumo; migration `0119` remove caps por minuto/conta | Não há prova de controle de concorrência por integrador contra a quota compartilhada do fornecedor |
| Erros/retries | Códigos públicos próprios, distinção de erro definitivo/incerto, consulta idempotente | Preservar essa segurança ao adicionar compatibilidade; SDK com retry automático precisa de teste |

Referências oficiais usadas para os contratos: [geração](https://ai.google.dev/api/generate-content), [contagem](https://ai.google.dev/api/tokens), [embeddings](https://ai.google.dev/api/embeddings), [arquivos](https://ai.google.dev/api/files), [lotes](https://ai.google.dev/gemini-api/docs/batch-api), [cache](https://ai.google.dev/gemini-api/docs/caching), [Live](https://ai.google.dev/gemini-api/docs/live-api) e [compatibilidade OpenAI oferecida pelo próprio Google](https://ai.google.dev/gemini-api/docs/openai). Esta última é diferente do contrato próprio ConnectyHub.

O catálogo oficial atual inclui Flash 3.8/3.7/3.6/3.5 e distingue modelos estáveis, previews, imagem, transcrição e outras famílias. A base local contém muitos desses IDs, mas a disponibilidade precisa combinar catálogo remoto, estágio, quota, credencial, tarifa e operação realmente testada. Não foi realizada uma geração em cada modelo nem certificação de todo catálogo. [Modelos oficiais](https://ai.google.dev/gemini-api/docs/models). Limites reais dependem de projeto/tier/modelo, e não desaparecem com a revenda por uma chave própria. [Quotas oficiais](https://ai.google.dev/gemini-api/docs/rate-limits).

### Condições de uso relevantes ao produto

Os termos consultados distinguem serviços pagos por projeto com faturamento ativo e tratamento dos dados; impõem restrições de público/uso e preservação das proteções. Search e Maps têm condições específicas de exibição, atribuição e uso em aplicações próprias; Search inclui restrição expressa à revenda/sindicação dos resultados. Isso exige avaliar o produto de repasse a integradores e eventual autorização do fornecedor, **sem concluir que toda API comercial de texto é proibida**. Não foi auditado contrato privado do Google nem emitida aprovação jurídica. [Termos Gemini](https://ai.google.dev/gemini-api/terms).

## Documentação pública e experiência do integrador

Superfícies verificadas:

- [Documentação navegável](https://www.connectyhub.com.br/docs/api#ia).
- [Guia Markdown](https://www.connectyhub.com.br/docs/api/ia/guide.md).
- [OpenAPI JSON](https://www.connectyhub.com.br/docs/api/ia/openapi.json).
- [Painel de projetos e consumo](https://www.connectyhub.com.br/dashboard/api-ia), autenticado.
- [Créditos e recargas](https://www.connectyhub.com.br/dashboard/creditos), autenticado.

Markdown e JSON responderam HTTP 200. OpenAPI 3.1.0, versão de produto 1.5.0, 37 caminhos/62 operações. Hashes dos downloads constam na evidência anexada. O guia contém início de integração, exemplos, autenticação, modelos, créditos, idempotência, operações, SSE, polling e links para painel. A ressalva de compatibilidade parcial é correta e deve ser mantida até haver certificação.

Pendências concretas:

1. **A02 — limite de arquivos:** guia/código anunciam 20 MB; JSON/base64 chega à função Node da Vercel. O teto da função é 4,5 MB por corpo, anterior ao limite do código. Um arquivo binário de 20 MB ocupa aproximadamente 26,7 MB em base64. Corrigir transporte para upload direto/retomável autorizado ou anunciar um limite compatível. Não foi enviado arquivo grande nem provocada carga em produção. [Limites oficiais da Vercel](https://vercel.com/docs/functions/limitations).
2. **A03 — disponibilidade:** separar “implementado” de “habilitado e testado”. Live está indisponível; tabelas de capacidades não são prova operacional. Tornar indisponibilidade e pré-requisitos claros por modelo/rota.
3. **A04 — coerência de ferramentas:** o guia geral diz que busca aberta/Maps aguardam liberação, enquanto tabelas avançadas os apresentam em Interações. Explicar explicitamente a diferença entre protocolo, modelo, credencial e recurso liberado; validar retorno/atribuições.
4. **A05 — previsibilidade de preço:** os exemplos avisam que créditos são ilustrativos, mas não entregam uma tabela contratual completa de tarifas vigentes, mínimos, unidade, versão e modalidades para o integrador orçar. Publicar o preço em créditos não exige expor custo privado do fornecedor. Mostrar as consequências do pacote escolhido.
5. **A06 — continuidade e limites:** documentar latência/timeout, concorrência, tamanho real, duração Live, retenção, expiração, versão e campos não suportados. O teste SQL local demonstra ausência intencional de caps de conta/minuto; saldo não protege outros clientes de esgotamento de quota compartilhada.

## Testes e alcance da conclusão

**135 testes aprovados em 22 arquivos**, executados nesta auditoria antes da retomada. Nenhum teste foi repetido apenas para gerar novo número. Grupos:

- 76 testes/16 arquivos: `ai-api-docs`, `ai-api-input`, `ai-model-gateway`, `ai-model-catalog`, `ai-dashboard`, `ai-credit-reservations`, `ai-advanced-input`, `ai-files`, `ai-resource-billing`, `ai-resource-admin`, `ai-resource-lifecycle`, `ai-public-response`, `ai-models-sql`, `ai-cookbook`, `ai-cache-update`, `ai-automation`.
- 59 testes/6 arquivos: `automatic-topup-outcomes`, `custom-contracts-topups-meetings`, `native-billing-sql`, `native-billing-card`, `usage-billing-integrity`, `ai-relay`.

Comando-base: `npm test -- <arquivos acima com caminho tests/ e extensão> --maxWorkers=2`. O arquivo relay é `.test.mjs`; os demais `.test.ts`. As duas rodadas usaram fixtures, harnesses e banco local/PGlite conforme o teste; nenhum resultado simulado foi tratado como fatura, geração pública ou recarga real.

Cobertura relevante: reserva concorrente, insuficiência de saldo, repetição idempotente, divergência de corpo/modelo, revogação, isolamento de recursos, campos públicos, medição de modalidades, falha incerta, cobrança e consentimento/limites de recarga. **A01 demonstra o limite dessa cobertura:** as ACLs locais esperadas passam, mas a produção diverge.

Não realizado: pentest completo, carga/concorrência real, geração em todos os modelos, entrega real de webhook, cadastro como usuário novo, chamadas com chave ativa, migração de SDK Gemini real, conciliação de fatura Google, débito externo/painel e pagamento automático real. Esses limites são explícitos; não são aprovação implícita nem falhas comprovadas desses fluxos.

## Plano de fechamento, sem mudanças nesta auditoria

| Ordem | Entrega | Critério de aceite |
|---|---|---|
| 1 — urgente | Corrigir ACLs financeiras e investigar sua origem | `anon/authenticated` sem execução nas RPCs de serviço; papéis legítimos preservados; evidência antes/depois e testes isolados |
| 2 | Resolver contrato de upload e disponibilidade Live | Limites publicados correspondem à hospedagem; Live habilitado e homologado ou explicitamente indisponível |
| 3 | Homologar API básica com organização/chave de teste autorizadas | Geração, replay, insuficiência, falha definitiva/incerta, débito único e leitura do mesmo valor no painel |
| 4 | Testar planos e isolamento | Trial/Starter/Pro/Scale/Internal, pausa/revogação, duas organizações, grupo com carteira compartilhada |
| 5 | Homologar modalidades/recursos vendidos | Caso mínimo e falha por família; consumo e tarifa demonstráveis; o que não passar permanece indisponível |
| 6 | Fechar preço e margem | Tabela de créditos versionada; custo estimado conciliável; pacote/franquia e fatura real separados |
| 7 | Homologar recarga automática | Consentimento, cartão, limiar, teto, concorrência, recusa, timeout, webhook repetido, crédito único e desligamento |
| 8 | Definir compatibilidade Gemini versionada | Matriz campo/método/SDK e testes de contrato; preservar consumidores existentes e billing sem duplicidade |

Para avançar além da auditoria, será necessário um ambiente/cliente de homologação e autorização específica para eventual criação de chave e consumo limitado, além de acesso de leitura à fatura/quota Google para custo real. Não é necessário gerar cobrança de cliente para corrigir a ACL ou testar contratos localmente. Nenhuma decisão de margem ou novo serviço pago foi tomada.

## Fontes locais para revisão

Todos os caminhos abaixo são relativos à raiz `C:/Users/conne/Documents/ConnectyHub`:

- `src/lib/ai-api/gateway.ts`, `operation-ledger.ts`, `operation-pricing.ts`, `content-metering.ts`, `interaction-metering.ts`.
- `src/lib/ai-api/native-input.ts`, `public-response.ts`, `streaming.ts`, `files.ts`, `extended-embeddings.ts`, `live.ts`, `webhook-transport.ts`.
- `src/app/api/v1/ai`, `src/app/api/dashboard/ai/route.ts`, `src/app/api/dashboard/credits/route.ts`.
- `src/lib/ai-api/documentation.ts`, `openapi.ts`, `model-catalog.ts`, `model-definitions.ts`, `resource-capabilities.ts`.
- `src/lib/billing/credit-economics.ts`, `metered-usage.ts`, `plan-entitlements.ts`, `access-control.ts`, `contract-access.ts`, `automatic-topups.ts`, `native-card-checkout.ts`, `platform-billing-webhook.ts`.
- `src/components/connectyhub-os/credits-console.tsx`; painel de IA e seus componentes; `src/lib/inngest/functions.ts`; `services/ai-relay`.
- Migrations `0086_atomic_billing_fulfillment.sql`, `0106_ai_credit_reservations.sql`, `0110_automatic_credit_topups.sql`, `0119_simple_ai_usage.sql`, `0125_ai_models_and_keys.sql`, `0127_usage_billing_integrity.sql`, `0128_ai_resource_operations.sql`, `0129_ai_automation_delivery.sql`.
- [Evidência sanitizada desta auditoria](evidencias/auditoria-api-llm-2026-09-14.json).

O relatório não substitui o estado de produção futuro. Não apagar projetos antigos nem declarar a plataforma inteira homologada com base nesta revisão da API externa.
