# Campanhas Meta e créditos de IA — 12/10/2026

## Escopo autorizado

Implementar criação e ativação no admin e em todos os planos ativos, com prévia e aprovação de verba. Testes exclusivamente pausados, sem gasto publicitário. Google Ads fora deste incremento. IA de cliente deve consumir a carteira responsável, com as tarifas atuais; acesso administrativo assistido não transforma uso do cliente em consumo interno.

## Fluxo implementado

Criativo → análise editorial → escolha orgânico/pago → proposta por IA → aprovação da proposta → escolhas finais → prévia imutável → criação pausada → aprovação explícita do limite de gasto → ativação. O executor inicial é de tráfego para site (OUTCOME_TRAFFIC, LINK_CLICKS), imagem JPG, carrossel de 2–10 imagens JPG ou vídeo MP4, Feed Facebook ou feeds Facebook/Instagram, CBO/ABO, público amplo por país e idade 18–65+. Mesmo criativo com variações de texto; não produz vídeos alternativos a partir da orientação editorial. CTA Saiba mais. Categorias especiais não suportadas neste executor; não são convertidas silenciosamente em campanha comum. Outros objetivos/posicionamentos exigem evolução específica.

Conta/Página/Instagram derivam da conexão da própria empresa, nunca de IDs livres do navegador. Moeda deve corresponder à conta. Cada proposta tem uma execução única, snapshot/hash, IDs remotos e intenção persistida antes de cada criação. Resultado incerto bloqueia repetição automática. Vídeo em processamento pode ser conferido novamente sem novo upload. Todos os níveis são criados PAUSED. Prazo começa na criação pausada e é exibido antes da ativação; gasto total limitado por spend_cap. A média diária não é promessa de teto diário fixo da Meta.

Antes de ativar: conferência ao vivo da hierarquia, orçamento, destino, criativos e segmentação; fingerprint divergente bloqueia. Aprovação registra pessoa, data, versão, moeda e teto. Filhos são habilitados mantendo a campanha pausada; campanha ativada por último. Falha tenta pausa compensatória e exige conferência, sem declarar sucesso incerto. Pausa autenticada não exige saldo/contrato ativo; permanece restrita ao gestor da organização e aos ativos conectados.

## Créditos

Análises de imagem/carrossel/vídeo, propostas e análise de resultados Meta usam reserva e liquidação atômica por solicitação. Tarifas centrais por modelo, recurso e plano da carteira responsável. Tokens reais incluem saída de raciocínio e desconto de cache previsto na tabela central. Reserva ocorre antes de generateContent. Sem tarifa, saldo ou limite, não gera. Resultado e consumo são persistidos antes de liquidar; consulta posterior não repete inferência. Falhas ambíguas retêm a reserva para conferência.

Cobrança do cliente ocorre no seu usage_events/credit_transactions, inclusive trial, sem fallback para carteira interna. internal_shadow permanece apenas para operação própria de plano internal. Criar, consultar, pausar e ativar campanhas são operações determinísticas, sem nova inferência nem débito fictício de IA. Verba Meta é separada dos créditos ConnectyHub. Tarifas de referência por mil tokens e consumo final ficam visíveis no estúdio. Google Search mantém o mecanismo de consumo publicado anteriormente.

## Verificações

93 testes dirigidos passaram (90 de campanhas/créditos/criativos e três de isolamento do acesso de revisão): isolamento e permissões, todos os planos ativos, categorias/valores inválidos, soma ABO, teto CBO, criação pausada, aprovação exata, fingerprint alterado, compensação, duplicidade e timeout; banco verifica reserva, débito único, preservação de outras reservas, estado incerto e recusa de acesso authenticated. TypeScript e ESLint passaram. Teste antigo que esperava bloquear Starter foi atualizado para testar bloqueio explícito de recurso, conforme a decisão vigente de todos os planos.

Migrations 0198/0199 aplicadas e registradas em transação, após backup privado de schema `config/before-0198-0199-schema.sql`. SELECT/EXECUTE direto por authenticated recusado. Não confundir testes automatizados de ACTIVE com ativação real autorizada: nenhum teste deve veicular anúncios.

## Referências oficiais consultadas

- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py
- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py
- https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi


## Direção final do produto

Criação/melhoria/análise de roteiros removida da interface, prompt, exportação, API de novas solicitações e planejamento, por instrução posterior do titular. Histórico financeiro anterior preservado. Entrada comum em Publicações e Meta Ads é análise de criativo, com seleção opcional do produto da própria empresa, prévia e avaliação separada orgânico/pago. O relatório traz evidências, adequação à oferta, público como hipótese e hashtags. Nota baixa não desabilita as duas vias. Sem produto/contexto suficiente, não afirmar adequação comercial nem prever fracasso/resultado.

Carrossel preserva a ordem de até dez imagens; vídeos são analisados individualmente. Orgânico prepara rascunho com todas as mídias, legenda e hashtags, sujeito à revisão/aprovação no calendário. Pago reaproveita o diagnóstico pertencente à mesma organização e mídias, gera estratégia e textos com nova cobrança de IA visível, depois exige prévia e autorização de verba. O executor inicial usa público amplo por país/faixa etária; hipóteses textuais não viram interesses ou audiências personalizadas automaticamente. Categorias especiais e objetivos de conversão/leads/mensagens permanecem fora deste executor inicial.

## Testes reais e limites

- Operação própria: campanha `120256771503150051`, conjunto `120256771503450051` e criativo `1096183689685543` criados. A Meta recusou criar o primeiro anúncio: HTTP 400, código 100/subcódigo 1359188, nenhum método de pagamento válido. Consulta do conjunto confirmou zero anúncios. Campanha confirmada PAUSED. Nenhuma aprovação de ativação registrada, nenhum gasto publicitário. Não cadastrar pagamento automaticamente.
- Execução local `037bc6c1-95b5-4093-9b15-55aaab63fd72` reconciliada de uncertain para blocked após confirmação da recusa definitiva e da ausência de anúncio. IDs preservados. Retomada explícita reaproveita objetos existentes; timeouts continuam incertos, sem retry de criação.
- BuffaloMass: carteira tinha saldo, mas o limite mensal já estava atingido. Reserva recusou antes de geração; zero débito. Limite preservado e mensagem corrigida. Job `9e9e7fcd-29d7-4245-a9dd-fb94cc06ab8d` marcado failed após verificar ausência de resposta do provedor e charge failed.
- Conta isolada de revisão mantém sua restrição de rotas; não foi ampliada para o estúdio. A cobrança foi validada por harness do próprio serviço no servidor, sem sessão forjada, usando a carteira isolada. Isso não equivale a teste de autorização de cliente comum pela UI.
- Piloto final de carrossel `d401bef2-de61-4418-a2fe-b1a0dad38c86`: Gemini recebeu dois slides reais, retornou score 43/100, recomendações orgânico/pago e hashtags. 3.307 tokens de entrada, 1.200 de saída e duas mídias faturadas pelas tarifas centrais. Débito único de 20,7526 créditos: saldo 964,3288 → 943,5762; reserva final zero. Repetir consulta da mesma solicitação não gerou outra inferência/débito. Evento `6402923e-4ed1-4979-ac6c-83896d5cd00f`.
- Pilotos anteriores: roteiro antes da retirada de escopo (8,379 créditos) e carrossel antes da correção de quantidade de mídia (18,4196). Não corrigir cobranças retroativamente nem apresentar esses valores como tarifa fixa. Final cobra cada slide quando há tarifa por mídia; vídeo segue tarifa vigente e consumo real.
- Carrossel pago foi validado em testes de payload e hierarquia pausada; entrega real de anúncios e ativação permanecem não testadas, devido ao requisito de pagamento da conta Meta. Ativação foi exercitada somente em testes automatizados.
- Migrations 0198/0199/0200 aplicadas/registradas; acesso direto authenticated negado. Suíte principal: 90 testes em 16 arquivos, mais três testes de isolamento da revisão; TypeScript e ESLint aprovados.

- UI admin em produção: job `f6efd6e4-d165-4905-a40c-875ef3c2c0f6` concluiu análise real do card próprio, nota 14/100 e recomendações nas duas vias. Botão orgânico criou item `877f4725-8646-4369-9edf-e356506c3162` confirmado `draft` no banco; a via paga reaproveitou mídia e objetivo e abriu a preparação da proposta. Nenhuma publicação ou ativação. Evidência `output/meta-campaigns-20261012/analise-duas-vias.png`. Painel cliente conferido em acesso assistido, evidência `painel-cliente-jornada.png` na mesma pasta.
- Corrigida a saída do acesso assistido da conta isolada: allowlist inclui exclusivamente `/api/auth/assisted-access/end`; início de acesso, admin e estúdio seguem bloqueados para o avaliador. Retorno pela UI confirmado após publicação em /admin/clientes.

## Publicação

Produção d01a8d6e7608fb410e8f6bff74ee527a2c01ee5c, slot b/3131, em 12/10/2026 às 18h39 BRT. Fallback 8f24904b4f5cd39a7c33f594647af56fe3d37644, slot a/3130. Smoke candidato e público aprovado: health com SHA exato, login e JS 200, rotas privadas 401, Inngest assinado 200/58 funções/autenticado. Builder parado. Evidência visual e rascunho descritos acima; nenhum conteúdo social publicado nem anúncio ativado.
