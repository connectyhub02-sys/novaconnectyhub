# Quantidade explícita de produtos e áudio nas campanhas — 15/10/2026

O titular pediu informação explícita sobre quantos produtos entram no carrossel,
seleção de vários produtos e combinações de carrossel/enquete/texto com áudio.
Reforçou disponibilidade para clientes e admin, com contexto próprio de cada conta.

## Implementação

- Nas rotinas de grupos, carrossel oferece 2, 3 ou 4 produtos por publicação.
  Esse é o intervalo desta interface, não uma afirmação do máximo do WhatsApp.
  Seleção manual exige exatamente a quantidade escolhida; seleção automática
  mantém a quantidade e alterna produtos elegíveis. O resumo mostra cartões e áudio.
  Não há opção de produto único para novos carrosséis. Outros formatos a preservam.
- Validação no servidor confere produtos ativos, mídia com URL válida e isolamento
  da organização. A quantidade é revalidada ao planejar e ao criar os cartões.
  Se faltarem produtos elegíveis, falha com motivo em vez de reduzir silenciosamente.
- Carrossel, enquete e texto oferecem áudio opcional. Os cartões continuam com
  botões; desmarcar áudio mantém apenas a publicação. Produto com botão e produto
  com botão + áudio continuam disponíveis. Áudio não foi acrescentado a Status.
- A fala do carrossel é montada a partir dos textos dos cartões efetivamente
  enfileirados, na mesma ordem, com introdução e convite. A enquete usa sua pergunta
  e opções. Não há geração adicional de benefícios, preços ou ofertas para essa fala.
  A síntese usa a voz configurada e a medição de créditos existente.
- Antes de enviar carrossel/enquete com áudio, prepara e persiste a mídia sonora.
  Envia primeiro o conteúdo, depois a voz. Uma geração por publicação é reutilizada
  em seus destinos. Geração sem confirmação exige revisão; não é repetida sozinha.
  O transporte central usa os IDs estáveis de conteúdo e áudio, mantendo recibos e
  proteção contra repetição. Falha parcial deixa a publicação em revisão.
- A API e o estúdio administrativo recebem quantidade e áudio nos envios manuais
  e planos. A voz interna usa a organização da instância e escopo de consumo
  `platform`, seguindo a convenção existente do console interno. Não usa carteira
  de outra empresa. Tela administrativa ainda é o estúdio avançado por setor;
  não foi convertida nesta entrega para o editor de rotinas dos clientes.
- Migration `0206` adiciona `carousel_size` e `include_audio`, incluindo-os no
  cancelamento transacional dos posts pendentes ao editar a rotina. Registros
  antigos ficam com tamanho nulo (regra anterior até quatro) e áudio desmarcado;
  não são ativados nem reconfigurados automaticamente. Cópia preserva os campos.

## Evidências

- Testes funcionais de quantidade exata, seleção duplicada/estrangeira, mídia
  removida, ordem de cartões/fala, carrossel/enquete com e sem áudio, consumo
  compartilhado entre destinos, escopo administrativo e falhas de voz/provedor.
- Teste SQL real em PGlite: migration, preservação de valores antigos, restrição,
  cancelamento seletivo e rollback. Testes existentes do transporte e deduplicação
  também passaram. Última bateria focada: 70 testes em seis arquivos; bateria de
  regressões da campanha: 59 testes em oito arquivos (há sobreposição).
- TypeScript, ESLint e diff check passaram. Navegador local com dados fictícios:
  cliente desktop/mobile, contador 3 de 3, bloqueio de seleção excedente, busca,
  resumo e payload; admin desktop/mobile, carrossel de três e áudio no payload.
  Nenhum envio externo nem geração de voz/IA reais realizados nesses testes.
- Migration aplicada às 13h56 BRT, com backup de esquema em
  `/var/backups/connectyhub/manual/pre-0206-20261015T165645Z`.
  SHA256: `03a140cd93e2bd7d998a8925b3ec2d6e6e5cbd76adf408207dfc99f8d59aa202`.
  Uma rotina e 14 posts pendentes antes/depois; trigger ativo e colunas conferidas.

Código `c0e443bf` publicado no slot a/3130; fallback `c8b44d98` no b/3131.
Build de 120 páginas concluído. Candidato e HTTPS público passaram nas checagens
de versão/saúde, páginas/assets, Inngest assinado e métricas. GET/POST sem sessão
nas rotas de campanhas do cliente e admin retornaram 401. Schema cache atualizado;
consulta REST das novas colunas retornou 200. Builder parado após publicação.

Pendente: confirmação pelo titular da tela publicada e envio real em grupo
autorizado, incluindo reprodução do áudio. Carrossel no follow-up privado continua
fora desta entrega. Não há promessa de entrega baseada apenas nos testes simulados.

## Correção da descoberta dos formatos na lista — 15/10/2026

O titular não encontrou as combinações porque a primeira versão mostrava áudio
em uma caixa separada, somente após escolher carrossel, enquete ou texto.
A correção `9db04b5f` apresenta diretamente na lista Carrossel com botões,
Carrossel com botões + áudio, Só texto, Texto + áudio, Enquete e Enquete + áudio.
Produto com botão, Produto com botão + áudio e Automático permanecem disponíveis.

As escolhas da interface preservam o formato base e o campo `include_audio`
existentes; não há migration ou mudança de rotinas salvas. Ao editar uma rotina
com áudio, a combinação correspondente já aparece selecionada. O resumo também
identifica a combinação. O estúdio administrativo recebeu as mesmas combinações
explícitas em seu seletor principal e no seletor de enquete manual.

TypeScript e ESLint passaram. Navegador local conferiu formatos com e sem áudio,
troca de combinação para opção sem áudio e payload correspondente, carrossel
com três produtos, restrições por destino e layout desktop/mobile de cliente
e admin, sem erros JavaScript. Não houve envio externo ou geração real de áudio.
Publicada `9db04b5f` no slot b/3131, fallback `c0e443bf` no a/3130.
Build de 120 páginas, checagens do candidato e HTTPS público passaram. O arquivo
JavaScript público de Automações contém as opções explícitas e seus rótulos.
Rotas de campanha cliente/admin rejeitam GET/POST sem sessão com 401.
Builder parado após publicação. Confirmação do titular na sessão dele pendente.
