# Plano — reforma de Redes sociais, Contas e Sala de Manutenção (24/11/2026)

Pedido do titular após revisar a versão publicada `b1abeefe` (checkout
`ConnectyHub-admin-support`, branch `codex/social-publishing-workspace-20261124`).
Status: Fases 1 a 4 publicadas em 24/11 (registro no estado operacional); Fase 5 pendente. Vale para os painéis admin e cliente.

## 1. Publicações (referência: Conteúdos do Meta Business Suite)

Problemas verificados no código:
- `social-content-browser.tsx` consulta Instagram e Facebook separadamente e cria
  uma linha por rede; não há agrupamento do mesmo conteúdo.
- Sem paginação: "Carregar mais" empilha tudo na mesma página (47+ linhas).
- Menu lateral repete Publicações/Calendário/Biblioteca, que já são abas da página.
- Única métrica é comentários; alcance/visualizações não são consultados.
- Conferência autenticada do Codex foi só no admin.

Proposta:
- Menu lateral com um item só ("Redes sociais"); dentro da página: botão
  **Criar publicação** (vídeo/reel, foto/carrossel, story), seletor Lista |
  Calendário, acesso a Contas conectadas. Biblioteca vira seletor no compositor.
- Abas: Publicado, Agendado, Rascunhos, Com erro. Filtros: tipo, rede, busca,
  período (padrão 90 dias), colunas.
- Uma linha por conteúdo com ícones das redes e selo "Publicado em N redes";
  expandir mostra resultado por rede. Paginação de 25.
- Agrupamento: posts da ConnectyHub pelo próprio registro; posts externos quando
  legenda normalizada igual e diferença de até 15 minutos.
- Métricas em etapa posterior, após confirmar permissão de insights na Meta.

## 2. Contas conectadas

Decisão: **permanece separada da Sala de Manutenção.** Manutenção guarda as
credenciais do aplicativo ConnectyHub em cada plataforma; Contas guarda as contas
da empresa (operação própria ou cliente) autorizadas por OAuth.

- Sai do grupo "Sistema" do menu admin (rótulo "Conexões") e passa a ser aba
  **Contas conectadas** dentro de Redes sociais, igual ao painel cliente.
- Layout compacto: logotipo colorido oficial de cada rede (Instagram, Facebook,
  WhatsApp, YouTube, TikTok), nome, conta conectada e estado em poucas linhas.
  - Desktop: todas as redes numa faixa horizontal ou lista de uma linha por rede.
  - Celular: grade de 2 colunas; ações (Reconectar, Trocar contas, Desconectar,
    Ver permissões) num menu ou painel ao tocar no card.
  - Textos explicativos longos saem do card (ajuda/tooltip ou rodapé único).
- Ligação entre telas: se a credencial do app faltar, Contas mostra
  "App não configurado" com link para Manutenção.

## 3. Sala de Manutenção

Problemas verificados:
- Falso "Ausente": `maintenance-vault.ts` sabe se o valor vem do cofre, da
  variável de ambiente ou falta (`source`), mas `maintenance-room.tsx` descarta
  essa informação e o formulário só considera o que foi salvo pela tela.
- 19 integrações e 106 campos (26 obrigatórios) abertos numa única página; campos opcionais
  misturados; integrações em standby exibem campos "Obrigatória".

Proposta:
- Resumo no topo (OK / incompletas / desativadas) e filtro "só pendências".
- Abas por área: IA e voz; WhatsApp; Redes e anúncios; Pagamentos; Infraestrutura.
- Cada integração recolhida numa linha (nome, estado, obrigatórias x/y, Testar).
- Três estados por campo: Salva na tela, Configurada no servidor, Faltando.
- Opcionais em "Avançado"; integrações desligadas em grupo próprio, fora das
  pendências. Aviso Meta do topo vai para dentro do card Meta.
- Cards de Meta/YouTube/TikTok indicam se a conta da operação própria está
  conectada, com link para Contas conectadas.

## Base de código

O `master` local está em `4a9a9b4e` (26/10) e não contém a linha publicada
(`b07379f2`, com `b1abeefe` ativa desde 24/11). As publicações recentes foram
feitas em checkouts isolados sobre a produção. Trabalhar sobre a linha da
produção, confirmar o SHA ativo pelo health antes de cada release e não publicar
a partir do `master` local, que reverteria as entregas de novembro.

## Fases

Entrega em fases independentes, cada uma testada, publicada e conferida antes da
seguinte. Nenhuma fase prevista exige migration.

**Fase 1 — Sala de Manutenção.**
1. Repassar a origem de cada campo (tela, servidor ou faltando) e exibir os três
   estados; corrigir o falso "Ausente".
2. Integrações desligadas/standby em grupo próprio, sem contar como pendência.
3. Resumo no topo e filtro "só pendências".
4. Abas por área e cada integração recolhida numa linha; opcionais em "Avançado".
5. Aviso Meta para dentro do card Meta.

**Fase 2 — Navegação e Contas conectadas (admin e cliente).**
1. Menu lateral com um item "Redes sociais"; Calendário, Biblioteca e Contas
   como abas internas. "Conexões" sai do grupo Sistema do admin.
2. Contas conectadas compacta: logos coloridos, faixa/lista no desktop, 2 colunas
   no celular, ações em menu, textos longos fora dos cards.
3. Ligação entre Contas e Manutenção (app não configurado / conta própria).

**Fase 3 — Lista de Publicações.**
1. Uma linha por conteúdo com agrupamento (registro próprio; posts externos por
   legenda igual e até 15 minutos).
2. Abas Publicado, Agendado, Rascunhos, Com erro; filtros tipo, rede, busca,
   período (90 dias); paginação de 25.
3. Linha expansível com resultado por rede; "Criar publicação" em destaque com
   tipos; Biblioteca como seletor no compositor.

**Fase 4 — Métricas.** Conferir permissão de insights da conexão Meta; então
alcance, visualizações e seguidores ganhos por conteúdo, com seletor de colunas.
YouTube/TikTok quando as respectivas conexões estiverem ativas.

**Fase 5 — Conferência com cliente e redes novas.** Validar os painéis numa conta
comum de cliente; conectar YouTube da operação própria; TikTok segue o processo
de aprovação do aplicativo (hoje Sandbox), fora do controle do código.

**Fase 6 — YouTube e TikTok na mesma linha.** Pedido do titular em 24/11: ver Instagram,
Facebook, TikTok e YouTube na mesma linha, com visualizações de cada rede e o total, sem abrir a
publicação. Instagram e Facebook já mostram total e valor por rede. YouTube: com o canal conectado,
`youtube.readonly` permite listar os vídeos e ler `viewCount`; agrupar por título/descrição e horário
próximos, como no Meta. TikTok: listar vídeos e visualizações exige o escopo `video.list` (Display API),
hoje não solicitado, e aprovação do aplicativo pelo TikTok. Shorts do YouTube podem divergir na legenda.

Cada fase: testes focados, TypeScript, ESLint, build, prints desktop 1440 px e
celular 390 px nos dois painéis, release pela VPS e registro no estado operacional.
