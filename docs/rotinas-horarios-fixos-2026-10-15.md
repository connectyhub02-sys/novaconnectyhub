# Horários fixos nas rotinas WhatsApp — 15/10/2026

O titular pediu uma rotina diária às 09h ou três publicações às 09h, 14h e 18h,
com horários independentes para campanhas de agentes diferentes.

## Comportamento

- Editor de rotinas do cliente: horários fixos com horas e minutos, de 1 a 5 por
  dia e por destino; contador, validação de repetidos e resumo antes de ativar.
  Novas rotinas sugerem 09:00. Status, Grupos e Canais usam a mesma configuração.
  No Status em sequência, cada horário inicia três partes, separadas por 2 minutos.
- Estúdio administrativo: o plano finito usa a mesma seleção de horários fixos.
  Datas operacionais são de Brasília. Alterar horários invalida a prévia anterior.
  O editor administrativo continua com seu período finito existente (até 14 dias).
- Rotinas continuam vinculadas à organização e ao agente selecionados. Uma pode
  usar 09h; outra, de outro agente, 14h. A mesma rotina aceita vários horários.
  Horários não reservam exclusividade do grupo nem modificam a sala de dúvidas.
- A IA recebe os horários para escrever conteúdo adequado à hora, mas o servidor
  determina os instantes da fila. Horários já passados na ativação/planejamento
  são ignorados, sem encaixe automático em outro horário. O próximo dia mantém
  a mesma lista. Data futura e fim do período são respeitados.
- A fila existente executa a partir do horário agendado; processamento, conexão
  e provedor podem atrasar a entrega. Não há garantia de entrega no segundo exato.
- Rotinas existentes mantêm `daily_times = null` (distribuição automática anterior).
  Usuário pode selecionar o modo automático. Cópia preserva a lista e chega pausada.
- Migration `0207` adiciona a lista opcional com validação no banco. Alterar uma
  configuração arquiva apenas posts pendentes da própria rotina e zera a janela
  planejada e o bloqueio temporário de replanejamento, na mesma transação.
  Histórico publicado e outras organizações/rotinas são preservados.

## Verificação

Testes de cálculo de horários cobrem minutos, meia-noite local, dia futuro,
primeiro dia parcial, dia seguinte, fim do período, formatos inválidos e repetidos.
Testes do planejador e da fila cobrem horários fixos mesmo quando a IA fornece
datas incorretas ou nenhum item. Teste SQL real em PGlite cobre migration,
preservação de registros antigos, restrições, rollback e cancelamento seletivo.
Navegador local com dados fictícios: cliente/admin, payload de três horários,
validação de duplicados, resumo e layout desktop/mobile. Sem envio externo,
geração real de IA ou áudio e sem alterar rotinas reais de clientes nos testes.

Migration `0207` aplicada em 15/10 às 15h47 BRT. Backup do esquema e função
anterior: `/var/backups/connectyhub/manual/pre-0207-20261015T184716Z`.
SHA256 do SQL: `81be653c37510a2121f8b59cc5a3c520bf5a141c28432c4cc029636a46fd6ce9`.
Uma rotina e sete itens pendentes antes/depois, nenhuma rotina convertida para
horários fixos, trigger ativo. Consulta REST da nova coluna retornou 200.

Publicada `2e3f3ef8` no slot a/3130, fallback `9db04b5f` no b/3131.
TypeScript, ESLint e 55 testes focados passaram (incluindo reexecução dos testes
de normalização/fila após ajuste de tipagem). Build das 120 páginas concluído.
Candidato e HTTPS público passaram nas checagens de saúde, páginas, proteção de
rotas cliente/admin, Inngest e métricas. O bundle público de Automações contém
os controles novos. Builder parado após publicação.
Pendente: confirmação do titular na sessão dele e entrega real em grupo autorizado.
