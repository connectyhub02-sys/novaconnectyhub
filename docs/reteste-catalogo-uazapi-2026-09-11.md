# Reteste do catálogo WhatsApp — 11/09/2026

## Resultado final após implantação

Correção enviada à master em `aece285`. Vercel confirmou Ready no domínio principal às 17:01 de Brasília. Após recarregar a loja e executar uma nova sincronização às 17:02, o painel confirmou duas páginas (dez + três), 13 imóveis únicos, 13 imagens principais detectadas e preços corrigidos. Ipiranga: R$ 850.000,00; Rita Vieira: R$ 220.000,00. Novo lote ficou em REVISAR com 13 rascunhos sem categoria; nenhum produto publicado. As imagens estão detectadas com ingestão definitiva pendente, não comprovada nesta etapa. O lote antigo já não aparece no painel. Registro posterior ao push mantido local para evitar deploy adicional apenas documental. As seções seguintes descrevem a sequência histórica do diagnóstico.

Teste autorizado pelo titular, realizado no navegador pela documentação UAZAPI e depois pelo Catálogo de Vendas da Renata. Horários de Brasília. Nenhum produto publicado e nenhum deploy realizado.

## Documentação, 16:46

- Servidor: `connectyhub.uazapi.com`; endpoint `POST /business/catalog/list`.
- Instância Renata conectada; primeira página solicitada somente com `jid`, autenticada com a credencial da própria instância.
- HTTP 200 em 1.355 ms. Dez produtos, todos com referências de imagens; nove com descrição. O erro HTTP 500 / QueryCatalog anterior não se repetiu nessa chamada.
- Resposta real: `response.products`, `response.next`, `product.media.images[].original_image_url`, preço inteiro em string. A página de documentação ainda descrevia `Products` e `Paging.After`.
- Uma tentativa inicial sem autenticação retornou HTTP 401; não é evidência de falha de catálogo. Credencial removida do formulário depois do teste; nenhum segredo registrado neste documento.

## ConnectyHub, 16:47

- No painel da Renata, categoria Imóveis existente e instância conectada selecionada, executado uma vez “Trazer produtos do WhatsApp”.
- A fila foi processada e a interface terminou em REVISAR: dez itens importados para rascunho, dez pendentes, zero imagens, zero publicados. Histórico mostra uma página recebida.
- Exemplo concreto de preço: Ipiranga, descrito como R$ 850 mil, apareceu como R$ 8.500.000,00. Rita Vieira, descrito como R$ 220 mil, apareceu como R$ 2.200.000,00.
- Os rascunhos permanecem para revisão. Não foi selecionada categoria, marcado como pronto nem acionado Publicar.

## Diagnóstico e pendências

O serviço voltou a fornecer dados neste cenário, mas a importação completa não está operacional. A inspeção de `src/lib/sales-catalog/whatsapp-sync.ts` explica as divergências observadas:

1. `readCatalogPage` aceita produtos em minúsculas, mas busca cursor apenas em `Paging.After`/`paging.after`; ignora `response.next` recebido. A busca encerrou na primeira página apesar de a resposta direta conter cursor.
2. `readProductImages` procura imagens na raiz do produto e chaves camelCase/PascalCase; não lê `media.images` e URLs snake_case recebidas.
3. `readCatalogPrice` divide inteiros por 100. Nos exemplos reais observados, a escala enviada corresponde ao valor descrito multiplicado por 1.000, resultando em preço dez vezes maior na prévia atual. Confirmar o contrato por formato antes de mudar a conversão de todos os formatos legados.
4. `readCatalogCurrency` também não considera `product.currency` em minúsculas na raiz.

Próximo passo: compatibilizar o leitor com o formato real, testar preço/imagens/paginação e repetir a sincronização controlada. Não afirmar quantidade total de imóveis nem funcionamento da publicação: todas as páginas e a publicação não foram validadas neste teste.

## Correção local após autorização do titular

Atualização posterior: titular autorizou excluir o lote incorreto e publicar as correções acumuladas. Verificação no painel confirmou zero sincronizações recentes e nenhum produto publicado após a exclusão. A implantação e uma nova sincronização corrigida ainda precisam ser confirmadas.

O leitor passou a aceitar `response.next`, imagens em `media.images` com URLs snake_case, moeda/estado oculto/status/disponibilidade/SKU no formato recebido. Preço inteiro plano com `currency` na raiz usa milésimos; os formatos legados `Price`/`Amount` mantêm centavos. Valores inteiros fora da faixa segura ficam sem preço para revisão. A foto original tem preferência sobre a miniatura; o fluxo de rascunho mantém a foto principal, como já previsto pelo importador.

Passaram 51 testes em sete arquivos, incluindo o caso de R$ 850 mil, centavos, moeda diferente, produto oculto, leitura de duas páginas com cursor opaco, deduplicação, limite de páginas e formatos legados. São testes locais com respostas simuladas a partir do formato observado; não comprovam importação corrigida em produção. TypeScript e ESLint passaram. Nenhuma migration, alteração direta dos dez rascunhos existentes ou publicação foi realizada. Publicação continua suspensa por orientação do titular; depois dela será necessário refazer a sincronização e revisar os itens antes de publicar na loja.
