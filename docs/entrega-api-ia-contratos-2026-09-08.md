# Entrega — API de IA e soluções personalizadas

Data: 08/09/2026. Marca: ConnectyHub.

## Entregue

- `/solucoes-personalizadas`: apresentação responsiva de software sob medida, sem preços ou portfólio de clientes. Links na navegação e nos planos. CTA para a agente comercial configurada, com atribuição da visita.
- `/admin/contratos`: condições individuais por conta, com preço, franquia, permissões, limites, vigência e histórico. As condições entram na próxima cobrança elegível; faturas existentes preservam seus valores. Editar contrato não comprova pagamento nem concede créditos.
- `/admin/reunioes`: agenda real, solicitações e reservas. A Eliane coleta uma breve descrição, oferece horários disponíveis e confirma após a reserva. Lembretes de 24 horas e 1 hora, com deduplicação e registro na jornada. Sem horários cadastrados, registra a pendência em vez de inventar uma reunião.
- `/dashboard/api-ia` e `/admin/api-ia`: projetos, chaves exibidas uma única vez, revogação, limites, teste e consumo detalhado. API de IA independente da permissão da API de WhatsApp, com carteira compartilhada da conta.
- `/docs/ia`: contrato de integração, exemplos, idempotência e erros. Endpoints `/api/v1/ai/models`, `/api/v1/ai/chat/completions` e consulta de solicitação.
- `/dashboard/creditos`: explicação simples, tarifa aplicada, consumo preciso, recarga manual e autorização separada de recarga automática. A autorização define pacote, limiar e teto mensal; requer cartão salvo disponível. A recarga só credita após confirmação do provedor e não troca o plano.
- `/admin/api-ia/operacao`: custos estimados internos, solicitações e conciliação de reservas incertas. Custos e margens não são enviados na resposta ao cliente.
- Avisos de saldo em 20%, 10% e zero, com limiar absoluto, rearmamento após recarga e intervalo mínimo. O consumo pela API externa também aciona esses avisos no contato de cobrança da própria ConnectyHub.
- Canonical de produção, conteúdo em HTML, metadados, JSON-LD, links internos, sitemaps paginados de catálogo, robots e índices auxiliares atualizados. Áreas privadas permanecem fora da indexação pública.

## Controles financeiros e de acesso

A API reserva orçamento antes de gerar. Reserva e liquidação usam bloqueios transacionais da carteira e do projeto. Idempotência evita execução e débito repetidos. Falhas definitivas liberam reserva; resposta incerta mantém conciliação, sem repetir cegamente a execução. O custo acima do orçamento reservado não vira um débito surpresa ao cliente.

As tarifas são fotografadas por chamada. O extrato mantém casas decimais e separa uso interno do uso cobrável. O consumo legado respeita reservas de chamadas simultâneas.

Limites de empresas, membros, agentes, instâncias e armazenamento consideram a conta raiz e suas empresas. Os limites de quantidade protegem novas criações, preservando configurações existentes. O bloqueio contratual e as permissões continuam sendo aplicados aos recursos contratados. A edição de contrato não marca faturas como pagas.

## Validação

- Build de produção do Next.js: aprovado, incluindo TypeScript e geração das rotas.
- 14 arquivos de testes, 113 testes aprovados: concorrência de carteira, idempotência, reservas, reconciliação, contratos, campanhas, limites, pagamentos, concessão única de créditos, recarga e agenda.
- Landing page e documentação verificadas em 360, 390, 768 e 1440 px: HTTP 200, sem overflow horizontal ou erros JavaScript; H1 único, canonical de produção e JSON-LD válido.
- Migrações `0106` a `0113` aplicadas em transações no Supabase e registradas no histórico. Tabelas novas com RLS; operações sensíveis exclusivamente no servidor.
- Piloto real em produção, pelo endpoint publicado na Vercel: catálogo e geração HTTP 200, resposta `OK`, 10 tokens de entrada e 108 de saída/raciocínio. Custo estimado registrado de R$ 0,002475; reserva final zero. Conta interna em modo `internal_shadow`, sem débito de cliente.
- Repetição com a mesma chave de idempotência: HTTP 200, `Idempotency-Replayed: true`, resposta idêntica e um único registro de consumo. Após revogação, a chave retornou HTTP 401.
- O teste a partir do computador local retornou HTTP 403, `PERMISSION_DENIED`, sem consumo ou reserva. Isso não se reproduziu na geração pelo ambiente de produção. Não foi determinada a causa da diferença entre ambientes; não é uma pendência de liberação comprovada da conta em produção.
- Débito cobrável e concorrência foram validados nos testes transacionais. O piloto real usou a conta interna, sem cobranças reais de clientes ou envio de lembretes comerciais de teste.
- Publicação do código `31814df52eef1a638ee9c219bf7f209cf4c0c49e`: Vercel Ready, ambiente Production, domínio `www.connectyhub.com.br`. Landing page, documentação, sitemap principal e de catálogo, robots e llms retornaram HTTP 200; a API sem chave retornou HTTP 401.
- Conferência autenticada: API e créditos abriram na conta BuffaloMass, com carteira, pacotes reais e exigência de cartão para autorizar recarga. Agenda e navegação administrativa carregaram corretamente. O seletor de contratos foi ajustado para as contas dos usuários cadastrados, com identificação por e-mail, excluindo organizações históricas sem vínculo primário.

Evidências locais de QA e do piloto estão em `tmp/custom-review/` e não contêm chaves de API. Chaves temporárias do piloto foram revogadas e os projetos pausados.

## Modelo e tarifa da API externa

O catálogo antigo da conta foi recusado na consulta de tokens pelo Google. O modelo configurado da plataforma, Gemini 3.6 Flash, passou na consulta de tokens e na geração real em produção. Os modelos antigos foram preservados no histórico e excluídos apenas da seleção desta API externa.

A tarifa `external_ai` usa o preço oficial publicado do Gemini 3.6 Flash e mantém a política comercial já configurada: referência de câmbio R$ 6/USD, multiplicador 4, R$ 0,01 por crédito e mínimo de 1 crédito por chamada. O custo em reais é uma estimativa, não uma conciliação cambial da fatura do Google. A mudança de preço publicada para janeiro de 2027 tem vigência própria.

Fontes verificadas em 08/09/2026:

- [Tabela oficial de preços Gemini](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)
- [Contagem de tokens](https://ai.google.dev/api/tokens)

## Configurações e etapas restantes

1. Monitorar as primeiras integrações de clientes e a conciliação. A geração, liquidação e replay já passaram no piloto em produção. Para desenvolvimento local, o acesso ao Google precisa de diagnóstico específico caso o HTTP 403 persista.
2. Cadastrar valores acordados e limites de cada contrato personalizado. Nenhum preço foi inventado para Betel, Vision ou outros clientes.
3. Cadastrar horários reais da reunião no admin; a qualificação não discute preço ou orçamento do projeto.
4. Cada titular habilita a recarga automática com consentimento próprio e cartão disponível. A disponibilidade do cartão continua dependente da integração e liberação do provedor de pagamento.
5. Esta primeira versão suporta texto e imagens inline. Não oferece ferramentas arbitrárias, documentos/áudio/vídeo externos ou roteamento automático entre fornecedores. Novos adaptadores e leilão de modelos são evolução futura prevista no plano.
6. O modo SSE é compatível com o formato de resposta, mas entrega após geração e liquidação; não é streaming incremental do fornecedor. Isso está explicado na documentação pública.
7. Indexação e citações por buscadores dependem dos mecanismos externos. A entrega valida as condições técnicas, sem prometer ranking.
8. O envio opcional por IndexNow foi consultado, mas a chave ainda não está configurada em produção (`/indexnow-key.txt` retorna 404). Os novos endereços já estão nos sitemaps e links públicos.
