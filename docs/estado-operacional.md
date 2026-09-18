# Estado operacional da ConnectyHub

## Qualificação por respostas — 18/09/2026

Editor compartilhado cliente/admin permite adicionar, editar e excluir perguntas
e respostas com pontos individuais e opção desqualificadora. Identificadores CRM
gerados automaticamente, sem campo técnico editável. Os 32 perfis de atividade
têm quatro perguntas com três respostas cada; padrões antigos reconhecidos são
atualizados na leitura. Configurações autorais e pausas são preservadas.

Runtime usa opções e evidência literal do lead, calcula pontos no servidor e
registra o detalhamento no CRM. Contexto enriquecido não aumenta pontuação.
Máximo convertido para escala 0–100; desqualificação prevalece; obrigatórias
pendentes impedem qualificado/VIP. Histórico só muda na próxima análise.

Navegador local com API simulada validou cliente/admin, desktop/celular,
edição vazia/espaços, adicionar/excluir, pontuação/desqualificação,
salvar/recarregar e estabilidade dos identificadores. Nenhuma conversa real
ou chamada paga foi feita. Build webpack, TypeScript e ESLint aprovados.

Publicação `0de6475864a90826acafdf0380cfbb0e488782ad` confirmada na master e no
health público em 18/09 às 19h10 BRT. Vercel `EjsqsMzsoXtYMqiVMpZt3gnsiyiK`
ficou Ready após 1m04s. Rubrica de oito perguntas aplicada aos dois agentes
explicitamente autorizados, com backup local privado, atualização condicionada
à versão anterior e releitura dos registros: ambos com oito perguntas, 31
alternativas, máximo 110 convertido para 100. Demais metadados preservados.
Painel real conferido após recarga: tabela e pontos persistidos, desqualificador
marcado, sem campo técnico. Acesso administrativo ao painel do cliente não
constitui teste de permissões com sessão própria do cliente.

Detalhes e limites em [qualificação por respostas](qualificacao-respostas-2026-09-18.md).

## Modal publicado após recuperação da Vercel — 18/09/2026

Commit `4f700d20f9532d0063e1c024591aa684b2053e22` confirmado na master remota
e em `https://www.connectyhub.com.br/api/health` às 18h32 BRT, com status `ok`.
Modal real da Luna conferido no domínio de produção: formulário superior em toda
a largura, conexão abaixo em três colunas e diagnóstico recolhido; todos os
controles visíveis sem rolagem no viewport desktop observado. Nenhum dado salvo
ou conexão alterada nessa conferência.

O deploy `EGJXbTRURnuoyVi9kdenuLck5U5n` concluiu o build em 1m56s às 18h27 BRT.
Inicialmente ficou Staged, com atribuição de domínios ignorada. Promoção manual
aceita às 18h28; o domínio levou alguns minutos para passar de `9eef2976` a
`4f700d2`. A tentativa inicial `2gwKaa4orH4vnkfH4RNLGoEDuRGY` ficou cerca de
22 minutos em Initializing antes de ser cancelada. O disparo automático atrasado
`FhAMyEF28WTnJUXeYXkqR1WyjSZT` também foi cancelado. Uma republicação cacheada
`3s9enMe7Kg56GjcRs4mHwKvSqHdj` foi solicitada enquanto a promoção não aparecia
no domínio, e cancelada assim que a versão correta foi confirmada em produção.

Incidente do provedor "Elevated Errors Triggering Deployments", de 17h32 a
18h22 BRT: https://www.vercel-status.com/incidents/bwkmw4hmrgmk. Correção anunciada
às 18h13. A espera ocorreu antes da compilação, sem erro de build do projeto.
Registro local posterior à publicação, sem gerar outro deploy apenas documental.

## Modal de agente em duas faixas — 18/09/2026

Formulário ocupa toda a largura superior; conexão WhatsApp fica abaixo, com
foto/QR, informações e ações em três colunas no desktop. Empresa, nome, setor e
função ficam na mesma linha. Diagnóstico detalhado inicia recolhido; Status,
Reset e Remover compartilham uma linha. Cadastro e edição internos usam a mesma
organização superior/inferior, preservando os handlers e vínculos existentes.

Conferência local no Chrome com respostas sintéticas: editor cliente sem
rolagem em 1366×768 nos modos QR e código, também conferido em 1063×946; em
390×844, campos e ações sem transbordamento horizontal. Editor interno também
conferido. Em telas pequenas ou ao expandir informações/adicionar responsáveis,
a rolagem continua disponível para não cortar conteúdo. ESLint e build webpack
com TypeScript e 108 páginas aprovados. Rota temporária e referências geradas
do ensaio removidas antes do build final. Nenhuma conexão real alterada.

## Modal de agentes, status e upload — complemento de 18/09/2026

Após o pacote `851707e2`, cadastro e edição passaram a abrir um modal no editor
compartilhado do cliente/acesso assistido e dos agentes internos. O cadastro salva
empresa/setor/nome/função antes de liberar a conexão na mesma janela. QR Code,
código por telefone, diagnóstico, status, reset, remoção e migração permanecem
no componente de conexão, agora dentro de Editar. A aba Conexão mostra somente
identidade, número, estado e preferências para leitura.

Qualificação usa quatro sanfonas compactas, empilhadas, com altura/largura iguais
às do Prompt e fechadas ao entrar. Cartões substituem estados internos do cadastro
por Online/Offline/Conectando da instância do próprio agente e organização;
consulta indisponível não é apresentada como Online. A lista consulta o estado
persistido a cada 15 segundos sem substituir rascunhos; a atualização depende
dos registros de conexão/webhooks e não constitui monitoramento externo contínuo.

Arquivos do negócio têm área clicável e de arrastar/soltar, seleção dentro da
área, indicação de envio, validação de formato/tamanho e erros locais. Mantido
o contrato existente: um arquivo por envio, até 12 MB e mesmos formatos aceitos
no servidor. Upload e edição de identidade preservam o rascunho do Prompt.

Evidências: 228 testes direcionados em cinco arquivos e ESLint aprovados.
Playwright com HTTP sintético confirmou cadastro inicial, edição com erro/retry,
ações vinculadas ao agente correto, QR em janela sobreposta, Escape, layout
em 1920/390 px, sanfonas, alteração do status de outro agente, upload por arrastar
e seletor, validação/erro/recuperação e preservação de rascunho. Variantes cliente
e interna sem erros JavaScript. Rotas temporárias de ensaio removidas.
Build `next build --webpack`, TypeScript e geração de 108 páginas aprovados.
Pacote preparado sobre `851707e2` para o envio autorizado à master. Nenhum agente,
conexão, arquivo ou provedor real foi alterado pelos testes; implantação e
pareamento/envio/extração reais ainda não foram conferidos nesta rodada.

## Auditoria dos controles de agentes — pacote para master em 18/09/2026

Auditados os caminhos de Conexão, Prompt, Qualificação e Comportamento no editor
compartilhado de clientes/acesso assistido e agentes internos. Relatório com matriz
de efeito funcional: [auditoria-controles-agente-2026-09-18.md](auditoria-controles-agente-2026-09-18.md).

Corrigidas a remoção de espaços/quebras de linha ao digitar e a restauração de
regras opcionais apagadas; rascunhos numéricos e listas; validação de limites,
perguntas e campos CRM; perda de edições durante salvamento lento; aplicação do
perfil em agentes legados. Sanfonas padronizadas e fechadas ao montar a aba,
inclusive Estilo de conversa, playbook/perguntas CRM, baixa qualificação e próximo
passo. Selecionar voz altera somente a voz, preservando Espelho, rapport e divisão
de mensagens. O runtime respeita a janela da IA mesmo com presença sempre online;
rapport e regras de qualificação receberam instruções explícitas nos prompts.
Figurinhas com URLs externas 404 foram substituídas por cinco arquivos próprios.

Cartões de seleção compactados para 88 px de altura no ensaio local, com Editar,
Testar, Clonar e Excluir na mesma linha. Seleção pelo cartão/Enter/Espaço, sem botão
Abrir. Foto do cadastro com fallback para WhatsApp do mesmo agente/organização,
ou iniciais. Conexão e Prompt mostram o nome cadastrado somente para leitura;
a alteração permanece no formulário Editar e atualiza o contexto após salvar.

Evidências: suíte completa com 3.166 testes em 263 arquivos aprovada antes dos
últimos ajustes de cartões/nome; após esses ajustes, 195 testes direcionados em
três arquivos aprovados, incluindo isolamento das fotos. TypeScript e ESLint sem
erros. Navegador local com HTTP sintético confirmou edição/limpeza, sanfonas,
independência voz/modo/rapport, falha e concorrência de salvamento nos painéis
cliente e interno; cartões e nome também validados em 1440, 390 e 320 px.
Nenhum erro de JavaScript nos ensaios. Build de produção `next build --webpack`
aprovado, com 108 páginas estáticas; o primeiro ensaio apontou apenas referências
geradas em cache às rotas temporárias, removidas antes da execução final aprovada.

Integração sobre a master remota `ac187574`, preservando os 22 commits mais
recentes de cobrança/conta. Os 222 testes direcionados de agentes passaram na
base integrada; build webpack/TypeScript e geração de 108 páginas aprovados. Envio para a master autorizado pelo titular em 18/09/2026. Sem migration ou
alteração direta de agentes reais; implantação em produção ainda não conferida. Os testes
substituem provedores externos e não comprovam envio/recepção, clonagem, extração
de arquivos ou uso pago. Pendente revisar precedência de follow-up quando uma
política de Automações substitui controles do editor interno, além de publicar e
validar as integrações em produção. Não certificar todos os recursos como operacionais.

## Faturamento reutilizável e identificação dos cartões — 18/09/2026

Pacote preparado com sugestões privadas de titular, confirmação explícita de
faturamento, proteção contra edição antiga, atualização imediata de cartões,
bandeira/final/validade e manutenção de cartões de contrato vencido sem reativação.
Betel auditada: dois cartões preservados e faturamento vazio; checkout anterior
contém dados seguros recuperáveis como sugestão, diferentes de uma recuperação
da submissão descartada na última troca. 106 testes e lint passaram; backup e
ensaio da migration 0157 concluídos com registros financeiros inalterados.
Migration 0157 aplicada às 10:32 BRT. Dados do checkout anterior da Betel foram
recuperados como sugestão privada para revisão; endereço não confirmado e hashes
financeiros preservados. Build final passou. Publicado `85efbba8` pela master;
Vercel success e health com SHA exato. Conferência real da Betel mostrou dados
recuperados para revisão e dois cartões, com apenas um padrão. Endereço continua
não confirmado; nenhuma cobrança ou alteração de cartão real foi executada.
[Comportamento, evidências e pendência de Pagar agora](faturamento-cartoes-2026-09-18.md).

## Reverificação da habilitação Pix no Asaas — 18/09/2026, 01:09 BRT

Consultas diretas, somente leitura, mantêm conta PJ e aprovação comercial,
documental e geral. A autorização criada em 17/09 às 21:49 e seu webhook
CREATED comprovam capacidade de criação nessa ocasião; GET atual retorna
CANCELLED pelo cancelamento anterior, sem pagamentos vinculados no provedor.
Não foi obtido um campo explícito de elegibilidade atual e o ciclo financeiro
completo continua não validado. Nenhuma nova autorização/cobrança foi criada.
O menu Pix Automático do painel consultado trata do papel de pagador, sem
comprovar a habilitação de recebedor. [Evidências e limites](plano-vencido-cancelamento-pix-2026-09-17.md).

## Minha Conta para planos vencidos — 18/09/2026

Correção do menu, proxy e bloqueio visual publicada: Minha Conta
e faturas passam a integrar a recuperação; APIs de conta, segurança e faturamento
mantêm autenticação e escopo. Métodos listam contratos `past_due`. Caso Andre
confirmado por leitura: owner não admin, Scale vencido e acesso pago negado.
Nove testes de ativo/vencido, ESLint e build passaram. Publicado `6b02d2e7`,
Vercel success e health com SHA exato, conferidos às 10:20 BRT.
Complemento `a71d5c41` corrige a validação UUID que fazia faturas válidas retornarem
404; quatro testes adicionais, lint e build passaram. Vercel success e health
`ok` com SHA exato. Sessão real do Andre confirmou Minha Conta pelo menu restrito,
redirecionamento de agentes para regularização e abertura da fatura com pagamentos.
Nenhuma cobrança ou liberação de recurso pago foi executada nessa conferência.
[Causa, alcance e evidências](recuperacao-minha-conta-2026-09-18.md).

## Verificação Asaas e simplificação do faturamento — 18/09/2026

Leitura em produção às 00:20 BRT confirmou conta Asaas PJ e aprovação geral,
comercial e documental. A autorização aceita em 17/09 às 21:49, com webhook
CREATED, comprova capacidade real de criação de Pix Automático; GET atual mantém
CANCELLED, conforme cancelamento anterior autorizado, sem pagamentos/créditos.
Não foi criado outro QR. Isso não comprova ativação bancária/recorrência nem
elegibilidade futura. Renovação permanece bloqueada pela regra da ConnectyHub.

Auditoria e recomendação prioritária de encerramento/reativação sem exclusão de
organização, saldo e histórico, com matriz dos bloqueios Pix, no
[plano de cancelamento e Pix](plano-vencido-cancelamento-pix-2026-09-17.md).
Não existe UI/serviço transacional pronto para cancelar plano ativo/vencido.
Nenhuma mudança de status ou cancelamento real foi executado nesta rodada.

Interface: removido “Precisa de mais créditos?” da renovação, preservando os
adicionais reais na contratação inicial. Removido o card redundante de Pix
Automático da página principal de Métodos de pagamento; motivo preservado no
modal de troca. Sem CTA novo de suporte/migração/cancelamento nessa seção,
conforme direção final do titular. Substitui a orientação anterior de recargas
separadas dentro do checkout de renovação.

CEP: sem botão permanente de busca. Consulta automática após oito dígitos,
estados acessíveis junto ao campo e “Tentar novamente” apenas em falha.
Enter/blur antecipam a consulta; guardas evitam duplicação com o debounce.
Campos editados manualmente e respostas de CEP antigo continuam protegidos.
QA local em 1280×900 e 390×844: renovação sem oferta de créditos; contratação
inicial mantém adicionais; métodos sem card Pix redundante; modal de troca com
motivo preservado. CEP automático, Enter/blur sem duplicação, erro/repetição,
não encontrado, preservação de rua editada e salvamento simulado conferidos.
Sem overflow horizontal ou POST financeiro. ESLint e 32 testes existentes
passaram. Build webpack/TypeScript concluído.

**Publicado e confirmado às 00:36 BRT:**
`a9cdb73036b2ab3d8f6130cfdfb7edb45940098b`, master oficial, Vercel success no
projeto existente e health `ok` com o SHA exato. A inspeção visual/de interação
foi local com APIs simuladas; nenhum dado real de faturamento foi submetido.

## Endereço obrigatório aberto, CEP automático e regra de vencimento — 17/09/2026

Ajuste solicitado após o redesign: endereço ainda não confirmado começa aberto,
sem opção de recolher a etapa obrigatória. Endereço válido salvo aparece como
resumo editável. Erro ao carregar permite preenchimento manual, com aviso visível.
Salvar endereço e continuar libera a etapa explícita “Confirme o pagamento”;
não submete pagamento. Essa regra substitui o recolhimento inicial descrito abaixo.

CEP com oito dígitos dispara busca automática após 400 ms. Uma consulta automática
por CEP, botão manual preservado, estados de busca/erro, campos editáveis. CEP
antigo e componente desmontado invalidam resposta; campos alterados manualmente
não são sobrescritos, sem impedir o preenchimento dos demais campos.
Build webpack/TypeScript/108 páginas, ESLint e 12 testes de endereço/rotas aprovados.
QA local desktop/mobile: vazio aberto, salvo compacto, erro aberto, máscara,
busca automática, não encontrado, alternativa manual, preservação da rua digitada,
salvar e mostrar confirmação. Sem overflow e zero POST financeiro na prévia.

Auditoria somente de leitura: contrato recorrente vencido permanece `past_due`,
sem prazo automático de cancelamento. Política real sem carência/suspensão extra;
sweep a cada cinco minutos. Esperar não converte renewal em initial/Pix Automático.
Não há RPC pronta para migração completa de contrato vencido; há peças para
retirar cobranças, mas faltam transação, idempotência e conciliação entre contratos.
[Regra verificada, mensagens e escopo da jornada guiada](plano-vencido-cancelamento-pix-2026-09-17.md).
Nenhum contrato, cobrança, QR, mandato ou política de vencimento foi alterado.

**Publicação confirmada às 23:26 BRT:** `6044c2da41c9187aa13749e944666aa4b29de316`,
Vercel success no projeto oficial e health ok com o SHA exato. Endereço aberto e
CEP automático publicados pela master. QA de interação foi local com dados
simulados; nenhuma informação real de faturamento foi submetida nesta rodada.


## Checkout compacto e motivo da restrição Pix — 17/09/2026, 23:05 BRT

SELECT direcionado confirmou que o checkout mostrado no feedback é **renewal**,
assinatura **past_due**, pagamento **pending**, sem cobrança externa, assinatura
externa ou mandato Pix vinculado. Não está preso ao QR cancelado de outro checkout.
A restrição é financeira existente: API/RPC de Pix Automático aceitam apenas
contratação inicial; aprovação da conta recebedora não torna toda renovação elegível.

Redesign compacto: cards de métodos em uma linha, badges Automático/Manual,
seleção azul, resumo colorido, adicionais verdes antes do endereço. Endereço fica
recolhido até preencher/editar; salvar e continuar não cobra. Detalhes do plano
permanecem recolhidos. API agora retorna motivo específico para renovação, troca,
assinatura existente, contratação encerrada, compra avulsa ou campanha variável,
preservando o predicado de elegibilidade. Nas contratações elegíveis, escolha do
método independe de endereço/consentimento; esses continuam exigidos para pagar.

Catálogo real ativo/selecionado: Resposta Rápida 5.000 cr/R$47, Venda Mais
12.000 cr/R$97, Alta Performance 30.000 cr/R$197, Escala Total 75.000 cr/R$397.
UI usa os produtos carregados do catálogo, sem novos produtos nem preços fixados.
Total/seleção só mudam após confirmação do carrinho; falha preserva seleção anterior,
e cliques concorrentes/pagamento em andamento bloqueiam edição de adicionais.

Renovação mantém valor congelado pela RPC `BILLING_RENEWAL_TERMS_FIXED`; oferece
recargas separadas, com orientação para regularizar primeiro. Pendência explícita:
renovação + créditos avulsos no mesmo pagamento exige regra transacional com itens,
ledger, recibo, idempotência e auditoria separados, preservando preço dos próximos
ciclos. Não há suporte seguro existente liberado por esta alteração.

QA local do componente real com APIs simuladas em 1280×900 e 390×844: seleção
dos três métodos, endereço/CEP/salvar, consentimento Pix, total R$497→R$544 com
pacote R$47 e falha de carrinho preservando total. Renovação mostra motivo correto;
CANCELLED continua sem novo QR. Sem overflow horizontal, zero POST financeiro
na simulação. 61 testes dirigidos e ESLint aprovados. Nenhuma alteração financeira,
migration, endereço real, novo QR, mandato ou cobrança. Build webpack/TypeScript/108 páginas concluído às 23:07 BRT.

**Publicado às 23:09 BRT:** `2e147555ae6f44504e70b3af8d795cd1fe6f8e86`, master
oficial, Vercel success no projeto existente e health ok com o SHA exato. A aba
separada para QA publicada redirecionou ao Admin OS: acesso assistido ao cliente
não estava ativo. Sessão do titular preservada; não alegar inspeção visual real
desse release. QA visual/interação acima foi local, com APIs simuladas.


## Checkout, faturamento e lead comercial — 17/09/2026

Cancelamento explicitamente autorizado pelo titular, concluído às **22:06 BRT**:
a única autorização do QR mostrado foi revalidada CREATED, sem pagamentos nem
instruções futuras. Um DELETE Asaas retornou 200; GET confirmou CANCELLED. RPC
oficial sincronizou CANCELLED e limpou o QR local. Zero pagamentos/instruções
após, assinatura pending, zero créditos e nenhuma ativação. Audit log
`billing.pix_automatic.cancelled_by_explicit_owner_request` persistido. Sem novo
QR, cartão, estorno ou exclusão de histórico. A trava do checkout encerrado foi
preservada; cancelamento não autoriza gerar outra cobrança.

Redesign preparado: pagamento ocupa a coluna ampla e resumo fica compacto à
direita; no celular o resumo precede a escolha. Cards separados para Cartão,
Pix Automático e Pix comum; descrição curta e detalhes recolhíveis. Conteúdo
somente do método selecionado. Endereço completo em etapa própria, com busca
por CEP e preenchimento manual, salvo para Minha Conta > Faturamento. Cadastro
inicial universal continua sem endereço obrigatório. CEP/número usados no
cartão vêm do endereço validado; preços, consentimentos e conciliação mantidos.

O dono do relacionamento define o CRM: contratação da plataforma enriquece o
lead comercial da **ConnectyHub**, usando `platform_customer_journey` e o vínculo
existente por telefone verificado, não `lead_id` de uma organização contratante.
Eventos de endereço/método entram na jornada; pagamentos e assinatura já usam
essa trilha. Arquivo recebe dados selecionados, documento mascarado e histórico;
fatos anteriores não são sobrescritos. Sem vínculo/telefone verificado, mantém
fila e nota operacional. Nenhuma associação por nome ou e-mail aproximado.

Migration 0155 aditiva preparada com tabela privada de faturamento, RLS e acesso
apenas por rotas autenticadas owner/admin; backup privado verificado das funções
afetadas, 1.328 leads, 231 eventos e sete vínculos. Ensaio transacional com rollback
aprovado. Aplicação/publicação ainda devem ser confirmadas abaixo. QA local
1280×900 e 390×844, busca CEP/salvar simulados, estado indisponível e cancelado;
66 testes dirigidos aprovados, incluindo execução da rotina real de arquivamento
em PostgreSQL local, conflitos e isolamento. Não é pagamento real validado.

[Decisões e limites desta rodada](checkout-faturamento-lead-2026-09-17.md).

**Aplicação confirmada às 22:36 BRT:** migration 0155 registrada, RLS e grants
conferidos; 13 assinaturas, 17 pagamentos, 1.328 leads e 231 eventos da jornada
preservados. Build webpack/TypeScript/108 páginas e ESLint aprovados. Nenhum
endereço real foi salvo nem worker de avisos forçado. Publicação via master
autorizada pelo titular; confirmação do deploy fica no registro posterior.

**Publicação confirmada às 22:39 BRT:** `1e06d28652a4567c0349108bae5ba93bdb170eb2`,
Vercel success no projeto oficial, health ok com esse SHA. Checkout real conferido
em aba separada: cards novos, endereço completo vazio, pagamento amplo/resumo
compacto; desktop 1280 e celular 390 sem overflow. Nenhum endereço, método ou
pagamento submetido na inspeção. A elegibilidade específica do checkout aberto
permanece restrita a primeira contratação fixa, sem alterar a conta recebedora.

Complemento 0156 aplicado às 22:41 após backup/ensaio: endereço de faturamento
fica em campo próprio no arquivo comercial, separado de entrega; nenhum fato
existente alterado pela migration. Ficha mostra o endereço completo e documento
mascarado. Testes SQL, lint e novo build aprovados; código segue pela mesma master.

## Pix real pendente e separação de métodos — 17/09/2026

Após o titular mostrar QR gerado no checkout existente, auditoria estritamente
de leitura confirmou **uma autorização real de produção CREATED**, criada às
21:49 BRT: primeiro pagamento R$ 694, recorrência MONTHLY R$ 497 com startDate
17/10/2026, modo SUBSCRIPTION e sem data final. QR com expiração retornada pelo
Asaas `2026-09-17 22:49:06`. Webhook AUTHORIZATION_CREATED recebido e processado
às 21:49:10–11. Às 21:51, assinatura local pending, zero créditos liberados, efeitos
iniciais não concluídos; Asaas sem pagamentos para o cliente e sem assinatura
recorrente externa ainda. Uma autorização viva, sem duplicidade observada.
Nenhum ID, QR ou dado bancário incluído neste registro. A criação ocorreu após a
inspeção sem consentimento anterior; esta auditoria não criou, cancelou ou estornou.
Pagar e autorizar esse QR é operação real, não teste simulado. Estado sujeito a
mudança pelo titular/webhooks; reler antes de decidir encerramento. Não regenerar.

Pix comum preservado: cria cobrança pontual, ativa/renova o período do contrato
interno quando pago, mas não cria autorização Pix Automático nem débito mensal
autorizado. A régua lê current_period_end/next_billing_at, prepara/reutiliza
checkout renewal e solicita pagamento pelo painel. Worker Inngest está conectado
a processPaidBillingLifecycleNotifications a cada cinco minutos; nenhuma execução
foi forçada nesta auditoria. Configuração real lida às 21:52: avisos WhatsApp
ligados, início três dias antes, lembretes diários. Desde 01/09 há 12 registros
paid_plan_renewal_reminder sent com método pix, além de um due_today e três expired.
Status sent no banco não comprova entrega final no WhatsApp. Preferências de
opt-out e desativação global são respeitadas; a UI não promete envio incondicional.

Checkout recorrente Asaas agora separa **Pagamento automático** (Cartão e Pix
Automático) de **Pagamento manual** (Pix comum), com aviso de pagamento somente
deste ciclo e ausência de renovação automática. Não altera POST, valores, estados,
consentimentos, agendamento ou régua. QA local do componente real com APIs
simuladas: desktop 1280×900 e celular 390×844 sem overflow horizontal; opção
manual independente, fallback disponível quando Pix Automático está indisponível,
e ambos Cartão/Pix comum bloqueados quando existe autorização Pix em andamento.
Rota temporária removida antes da publicação pela master/GitHub/Vercel.

## Pix confirmado no checkout e oferta no painel Asaas — 17/09/2026, 21:34 BRT

Nova evidência supera a dúvida do menu Pix do pagador: no formulário Asaas
**Criar cobrança → Assinatura → Boleto Bancário / Pix**, apareceu “Seu cliente
pode autorizar o Pix Automático para os próximos pagamentos.” Conforme critério
informado pelo atendimento ao titular, a conta oferece o recurso. Não é botão
separado, mas descrição da opção Boleto/Pix. Valor/data/cliente em branco;
formulário fechado sem avançar. Criação pela API e pagamento seguem não testados.

Checkout inicial real já existente inspecionado em produção, com acesso
administrativo assistido: Pix Automático habilitado e selecionável, consentimento
desmarcado e Gerar Pix Automático desabilitado. Nenhum QR, mandato ou cobrança
criado. Commit funcional `68a4356f63dad0f53fedeb8b891b0fe7303f6ff8`, Vercel success
e health 200 com esse SHA. Textos distinguem novas contratações da troca ativa;
flag ligada, nove eventos webhook e layout responsivo preservados.

[Roteiro do teste controlado](pix-automatico-teste-controlado-2026-09-17.md):
propõe organização exclusiva do titular e plano Start R$ 97 inicial/mensal, sem
adicionais. Organização não criada e teste financeiro não autorizado/executado.
O checkout de cliente usado para leitura não é alvo de teste financeiro.

Texto do checkout inicial esclarece, antes de gerar e também no estado CREATED,
que QR ou Pix Copia e Cola devem ser usados no app do banco para confirmar o
primeiro pagamento e a autorização recorrente. Não promete abrir/redirecionar ao
app bancário. Próximos ciclos dependem da autorização ativa. A checagem desse
texto não gera QR nem mandato real.

## Pix: painel Asaas e distinção entre contratação/troca — 17/09/2026, 21:22 BRT

Nova leitura API confirmou aprovação PJ geral/comercial/documental, cadastro
válido, `bankAccountInfo=PENDING`, zero autorizações e webhook autenticado com os
nove eventos Pix. Health serve `4888aba97b5a0809ddbb289d102a4add5982128d` nesta
consulta. Flag de produção segue ligada conforme configuração registrada abaixo.

Painel Asaas inspecionado: área Pix Automático oferece autorização de débitos,
pagamentos agendados e histórico do **pagador**, sem status de elegibilidade
recebedora ou etapa de ativação do recebimento. Minha Conta mostra as aprovações;
chave de produção Habilitada (sem revelar segredo); webhook ConnectyHub - Billing
Ativado e zero eventos penalizados. Isso não comprova permissão para criar mandato.

Elegibilidade explícita como recebedor continua pendente. O caminho oficial para
liberação é gerente de contas via WhatsApp **0800 009 0037**, conforme
[canais Asaas](https://docs.asaas.com/docs/entre-em-contato), ou chat da conta para
encaminhamento. Solicitar status ELIGIBLE/INELIGIBLE e motivos, situação/idade do
CNPJ, restrições Pix e efeito de `bankAccountInfo=PENDING` para
`/v3/pix/automatic/authorizations`, Jornada 3, `paymentCreationMode=SUBSCRIPTION`.
Nenhuma mensagem externa ou operação financeira enviada.

Ajuste textual desta rodada distingue novas contratações elegíveis da troca de
plano ativo, cuja jornada sem cobrança segue dependente de confirmação Asaas.
Checkout inicial mantém flag/critérios reais e informa validação pelo provedor
antes do consentimento/criação. Layout desktop sem rolagem interna preservado.
ESLint e seis testes de disponibilidade aprovados. O fluxo deste ajuste textual
é publicação pela master/GitHub/Vercel existente; não exige migration ou mudança
de configuração. O SHA efetivamente servido deve ser conferido no health.

## Modal responsivo e habilitação do checkout Pix — 17/09/2026

Nova verificação Asaas às 20:38 BRT: conta `JURIDICA`/`LIMITED`, situação geral,
comercial e documentação `APPROVED`; cadastro comercial não expirado (03/09/2027).
`bankAccountInfo=PENDING` permanece como pendência observada, sem prova de bloqueio
específico para Pix. GET de autorizações retorna 200 e zero registros. Essas
leituras e a aceitação dos nove eventos no webhook não comprovam a elegibilidade
específica como recebedor. Não foi encontrada consulta pública que a retorne;
a data de abertura do CNPJ tampouco foi retornada. Não declarar pagamento validado.

Após instrução do titular para ativar o checkout inicial e investigar a conta,
`ASAAS_PIX_AUTOMATIC_ENABLED=true` foi salva como Config somente em Production
no projeto Vercel existente. A UI confirmou sucesso; deploy GitHub/master
`16ca0e4b5125608d9dab1cfd14d3c226f56301c5` concluído, status Vercel success e health
200 com o mesmo SHA. Handler real, schema 0153/0154 e nove eventos
Pix já estão publicados/configurados. Criação continua sujeita à validação Asaas
e consentimento do titular; nenhum mandato, cobrança ou tokenização foi executado.
Troca para Pix em assinatura ativa continua indisponível porque a Jornada 3
exige primeiro pagamento, incompatível com a troca sem cobrança solicitada.

Modal de cartão ajustado para duas colunas no desktop e tela cheia no celular,
com ações fixas no rodapé. QA local no componente real: 1366×768 e 1280×720 sem
rolagem interna, inclusive 1280×720 com erros (altura 668 px); 390×844 sem overflow
horizontal, campos/consentimento alcançáveis e rodapé visível. Máscaras e erros
conferidos com dados fictícios e API local simulada. Rota temporária removida;
ESLint, TypeScript e build de produção Next/webpack (108 páginas) aprovados.
Inspeção em produção aprovada: desktop 1280×720 com diálogo 1024×608 sem rolagem
interna; celular 390×844 em tela cheia, sem overflow horizontal e rodapé em 844 px.
Formulário aberto vazio e fechado sem envio em sessão administrativa assistida;
vencimento 14/10 preservado. Conta observada tem plano ativo, portanto não houve
teste de primeira contratação em produção. Disponibilização configurada não
equivale a mandato aceito ou pagamento liquidado pelo Asaas.

## Pagamentos publicados pela master — 17/09/2026, 20:13 BRT

Push na master de `connectyhub02-sys/novaconnectyhub` concluído no commit
`a366a966a727a4a122a9810eaa0d450884d14b78`. Deploy automático GitHub/Vercel
`CbKEQomUL71xMyLUnmQVyGk7DKKu`, no projeto existente Nova Connectyhub /
novaconnectyhub, concluído com sucesso. Health HTTP 200 confirmou o SHA servido.
Nenhum deploy manual, novo projeto ou alteração de DNS.

Migrations 0153/0154 aplicadas após backup e ensaio (evidências abaixo). Webhook
Asaas atualizado às 20:13:45: nove eventos Pix adicionados aos 34 existentes;
todos os anteriores e demais campos preservados/verificados. Minha Conta abriu
o novo diálogo de troca em produção, manteve o cartão/vencimento e o bloqueio
explicado para troca a Pix. Inspeção em sessão administrativa assistida, formulário
vazio e fechado sem envio. Rotas Pix/cartão e Inngest retornaram 401 sem autenticação.

Nenhuma operação financeira real. Listagem Asaas às 20:14:50: HTTP 200, zero
autorizações. **Flag Pix não habilitada**: falta comprovar elegibilidade da conta
Asaas para criação como recebedor; a tela de autorizações do pagador não comprova
isso. Após confirmação, configurar `ASAAS_PIX_AUTOMATIC_ENABLED=true` no projeto
existente e publicar pela pipeline GitHub. Teste real depende de autorização
específica do titular. [Relatório e roteiro](metodos-pagamento-pix-automatico-2026-09-17.md).

## Regra permanente de publicação — confirmada pelo titular em 17/09/2026

Releases da ConnectyHub vão para `connectyhub02-sys/novaconnectyhub`, branch
`master`. O push aciona a Vercel existente conectada a essa branch. Não usar
Pilger Landing Page, não publicar manualmente em outro projeto, não criar projeto
Vercel novo nem alterar DNS. Branch paralela serve para trabalho, não como destino
final de produção. A falta de acesso da CLI à Vercel não impede por si só o caminho
GitHub autorizado; verificar permissão de push e o resultado da pipeline correta.

Integração do pacote realizada sobre `origin/master` em `1ebea38d`. O banco foi
relido às 20:06 BRT pelo Studio HTTPS da ConnectyHub: migrations 0150/0151 de
infraestrutura e 0152 de cartões já aplicadas, um cartão ativo e nenhuma tabela
nova deste pacote. Por isso os SQLs de troca auditada e Pix foram renumerados para
0153/0154, preservando as migrations existentes. O formulário de troca integra o
bloco Métodos de pagamento já publicado e usa o mesmo cofre/seleção de padrão.

Às 20:10 BRT, migrations **0153 e 0154 aplicadas** em transação pelo Studio HTTPS
da ConnectyHub, com histórico, auditoria e recarga do schema PostgREST. Antes,
backup privado dos registros afetados, três funções e histórico (535.081 bytes;
SHA-256 `2ec4e891838c34e7cf7a596e08f29d195e6cc459109547da27a31745818b9ba0`),
verificado por releitura, e ensaio com rollback. Snapshot direcionado, não backup
integral do servidor. Contratos antes/depois mantiveram fingerprint
`a2b020a9d628b75537f6a03440b235a9`; um cartão ativo permaneceu. RLS e restrições
de execução das RPCs conferidas, sem operação financeira real. SQL 0153 SHA-256
`1f19ba425f42bd5aec2f0077d8af97c1a61529b2095218e1115ffdd6f9b2527e`; SQL 0154
`2a32d1beb614d00e98ef13695f4160377f6a1403b3b1067b0d671c67964b5af3`.

Integração validada: 116 testes em dez arquivos mais um cenário novo de
compatibilidade com a seleção de padrão 0152 (117 distintos nesta rodada),
ESLint, TypeScript e build Next/webpack aprovados. Push/deploy e atualização do
webhook conferidos na entrada acima; flag Pix não habilitada. Elegibilidade Asaas para
criação segue sem comprovação, portanto não inferir ativação a partir de GET 200.

## Publicação do pacote de pagamentos — bloqueada em 17/09/2026, 20:00 BRT

Titular autorizou migrations 0150/0151, configuração do webhook e publicação em
lote, com parada expressa se persistisse o acesso Vercel incorreto. Revalidação:
`vercel whoami` retorna `pilgerlandingpage`; a consulta autenticada ao projeto
`prj_SVsJoIWfofx7KRpRL7bDJsL5Q8W3`, equipe `team_F30ubMSe0tNWndpvkO9dSCDA`,
retorna `404 — Project not found`. `vercel teams list` lista somente
`pilger-landing-pages-projects` (Guilherme Pilger AI), sem a equipe esperada.

Interrompido antes das mutações, conforme essa condição: nenhuma migration aplicada
nesta tentativa, nenhum webhook alterado, nenhum deploy e nenhuma flag habilitada.
Nenhuma operação financeira real. O schema e o webhook não foram relidos nesta
rodada; seu último estado observado consta abaixo e no relatório do pacote.

Pacote funcional preservado no commit `93788513`, branch
`codex/metodos-pagamento-pix-automatico`. Retomada: autenticar a CLI com acesso ao
projeto/equipe acima, ou operador já autorizado publicar o mesmo pacote nesse
projeto. Não criar projeto alternativo nem alterar DNS. Após liberar acesso,
conferir histórico remoto/migrations, backup, aplicar 0150/0151, publicar handlers
com criação Pix desabilitada, acrescentar os nove eventos ao webhook existente e
conferir conta antes da flag. Validar health, checkout e Minha Conta; o teste com
mandato/pagamento real permanece sujeito à autorização específica do titular.

## Pacote cartão + Pix Automático — implementação local, 17/09/2026

Após nova instrução do titular para continuar, o checkout inicial recebeu Pix
Automático funcional em código, com consentimento, QR integrado Asaas, mandato
persistido, confirmação remota ACTIVE + pagamento, auditoria, webhook idempotente
e conciliação Inngest. Renovações usam modo SUBSCRIPTION do Asaas, sem duplicar
worker de cartão. Migration 0151 nova, ainda não aplicada. Troca em plano ativo
continua bloqueada com causa documentada (primeiro pagamento obrigatório);
cartão implementado anteriormente permanece no mesmo pacote.

Criação em produção depende de `ASAAS_PIX_AUTOMATIC_ENABLED=true` após conferir
schema/handler/eventos/conta. Webhook local preparado para nove eventos Pix;
configuração real ainda sem esses eventos. Nenhum mandato/cobrança real criado.
Validados 210 cenários distintos, ESLint, TypeScript, build de produção e navegador.
Pacote na branch `codex/metodos-pagamento-pix-automatico`; detalhes e limites no
[relatório do pacote](metodos-pagamento-pix-automatico-2026-09-17.md).

Publicação autorizada, mas **bloqueada em 17/09**: CLI autenticada como
`pilgerlandingpage`, projeto Vercel ConnectyHub na equipe configurada retorna 404.
Sem deploy isolado do cartão, sem migrations aplicadas, sem alteração externa de
webhook. Alternativa segura: operador com acesso à equipe publicar o mesmo pacote
no projeto correto. Não contornar acesso criando outro projeto/DNS.

## Pacote de métodos de pagamento — bloqueio Asaas confirmado, 17/09/2026 19:10 BRT

Registro histórico, superado pela implementação local descrita acima. A ausência
dos eventos Pix no webhook externo permanece pendente; a parada de implementação
descrita nesta seção foi revogada pela instrução posterior do titular.

Titular determinou não publicar cartão isoladamente; autorizou publicação do pacote
completo após implementação/validação, com parada se faltar dependência Asaas.
Consulta autenticada **somente GET** `/v3/webhooks` em produção às 19:10:33 BRT
confirmou um webhook ConnectyHub em `/api/webhooks/asaas/platform-billing`, ativo,
fila não interrompida e `hasAuthToken=true`. Eventos PAYMENT estão cadastrados,
mas a lista contém **zero eventos PIX_AUTOMATIC_***. Nenhum webhook foi alterado.
Isso comprova ausência de cobertura de confirmação/encerramento de autorização;
não é prova de inelegibilidade da conta para criar Pix Automático.

Parada conforme instrução atual. Integração funcional Pix Automático permanece
pendente; não foi criada migration de mandatos, nenhum plano foi migrado e nenhum
deploy realizado. Cartão e bloqueios visuais/API continuam apenas locais, com os
100 testes e build já verificados. Primeira contratação pode usar Jornada 3 e
`paymentCreationMode=SUBSCRIPTION`; precisa de implementação e webhook habilitado.
Troca sem pagamento inicial está bloqueada pelo contrato público documentado do
Asaas (`immediateQrCode` obrigatório). Não gerar cobrança simbólica/antecipada.

Próximo passo: resolver com Asaas uma jornada sem pagamento inicial para troca;
completar armazenamento, conciliação ACTIVE+pagamento, eventos e testes locais;
configurar os eventos no webhook existente quando liberado esse passo; só então
publicar conjuntamente migrations/app e executar teste manual especificamente
autorizado. Acesso Vercel continua um bloqueio histórico de 16/09, não revalidado
nesta rodada. [Evidência, contrato e plano](troca-cartao-assinatura-2026-09-16.md).

## Métodos de pagamento e Pix Automático — auditoria local, 17/09/2026

Troca de cartão recebeu máscaras numéricas, bandeira detectada, bandeiras aceitas,
validação por campo e no servidor (validade, CVV por bandeira, CPF/CNPJ com dígitos
verificadores, telefone e CEP). Teste com migration real em PostgreSQL e worker real
de renovação confirma seleção do novo token ativo na janela futura; provedor
simulado. Plano, ciclo, valor e vencimento preservados; falhas mantêm cartão anterior.
100 testes em oito arquivos, TypeScript, ESLint e navegador desktop/celular passaram.
Build Next/webpack de produção concluído com TypeScript e 108 páginas.

Pix comum está identificado como pagamento manual. Pix Automático aparece
desabilitado com motivo no checkout Asaas de plano e em Minha Conta. API rejeita
essa modalidade sem criar autorização/cobrança ou converter silenciosamente em
Pix comum. **Integração Pix Automático completa não implementada**: persistência
de mandato, confirmação ACTIVE/primeiro pagamento, webhook idempotente e agenda
própria de instruções ainda pendentes. Não ativar assinatura recorrente apenas
por emissão/leitura de QR Code.

Consulta autenticada somente GET em produção, 17/09 às 18:39 BRT, a
`/pix/automatic/authorizations?limit=1`: HTTP 200, zero autorizações. Comprova acesso
à listagem, não elegibilidade de criação. API pública Asaas documenta Jornada 3
com primeiro pagamento obrigatório. Não foi comprovado fluxo de autorização sem
pagamento inicial para troca de método de plano ativo. Não foram criados mandato,
webhook, cobrança ou alteração financeira real.

Nenhuma publicação desta entrega. Última verificação de infraestrutura em 16/09:
migration 0150 ausente e CLI Vercel sem acesso ao projeto/equipe configurados.
O bloqueio não foi revalidado nesta rodada; não afirmar estado atual externo com
base apenas neste registro. [Evidências e pendências](troca-cartao-assinatura-2026-09-16.md).

## Troca global de cartão da assinatura — entrega local, 16/09/2026

Minha conta → Assinaturas recebe Alterar método de pagamento para owner/admin.
O fluxo tokeniza sem cobrar e substitui atomicamente o cartão ativo de renovações
Asaas gerenciadas pela ConnectyHub, preservando contrato/ciclo/valores e referências
das recargas já autorizadas. Registra executor, organização, assinatura, horário e
resultado sem PAN/CVV/token. Bloqueia acesso cruzado, plano inativo, ausência de
renovação automática, integrações legadas e pagamentos em conferência.

84 testes dirigidos (incluindo 20 SQL), TypeScript e ESLint aprovados. Prévia local
desktop/celular conferida com API simulada, incluindo erro, sucesso e limpeza dos
campos. Build Next/webpack com TypeScript e 108 páginas aprovado. Migration nova
`0150_subscription_card_replacement.sql` ainda não aplicada. Sem cobrança real,
tokenização real, push, deploy ou alteração de produção.

Leitura somente às 17:17 BRT: Betel Leiloes tem plano Asaas active/recurring,
sem acordo externo, um cartão ativo e nenhuma tentativa em andamento; período
até 14/10/2026, 10:33 BRT. Credencial Asaas cadastrada no banco. Estado compatível,
mas aceitação do novo cartão e habilitação atual de tokenização não comprovadas.
Pronto para homologação isolada; validação real depende de migration/publicação
e troca manual pelo titular, sem recriar contrato nem cobrar para testar.
[Implementação, limites e roteiro Betel](troca-cartao-assinatura-2026-09-16.md).

Publicação autorizada pelo titular em 16/09, mas interrompida antes de qualquer
mutação por bloqueio de acesso à Vercel. SSH confirmou `vmi3571281`, container
`supabase-db`, diretório `/opt/connectyhub/supabase`: alvo é ConnectyHub, separado
dos containers Betel presentes na mesma VPS. Histórico até 0149; migration 0150,
tabela/RPCs novos e coluna `last_four` ausentes. A CLI Vercel autenticada nesta
sessão só lista outra equipe; consulta do projeto `novaconnectyhub` na equipe
configurada retorna 404. Precisa autenticar a Vercel na equipe ConnectyHub para
retomar. Nenhum backup novo, SQL de alteração, commit, push ou deploy executado
nesta tentativa; ambiente publicado ainda não habilitado para a troca.
## Métodos de pagamento em Minha Conta — 16/09/2026

Implementado bloco visível em /dashboard/minha-conta, logo abaixo dos cards da conta:
cartões cadastrados, Padrão, Adicionar novo, Alterar cartão da próxima renovação e
Tornar padrão. Consentimento explícito e informação de que salvar não cobra agora.
A API aceita apenas titular/admin da organização autenticada, exige origem própria,
limita payload/tentativas e nunca recebe organização autorizadora do navegador.

Asaas: tokenização sem cobrança, reutilizando o customer do cartão ativo. Token AES-GCM
no cofre; PAN/CVV não persistidos, não auditados nem retornados. Bandeira/final/validade
somente para novos cadastros; o cartão legado permanece identificado como cadastrado
quando não possui metadados parciais. Acordos externos/compra avulsa/contrato não vigente
retornam bloqueio específico, sem criar checkout duplicado. Asaas 401/403 informa que
é preciso habilitar tokenização na conta da plataforma e mantém o cartão atual.

Migration 0152 aplicada em transação no banco da ConnectyHub, com histórico e infra_audit.
SHA-256 LF: 2e2621079525a4849f372d18d817daa18032ebc0664f5391678c641c44885df8.
Troca e recibo/auditoria atômicos, locks de organização/assinatura, revisão do cartão
padrão e período, idempotência por requestId. Pagamento em processamento/incerto bloqueia
a troca. Recarga já vinculada ao cartão anterior acompanha o novo padrão, preservando
enabled, consentimento e limites; não ativa recarga nova. Nenhuma fatura/job é criada.

Verificação de produção antes/depois da migration: fingerprint de status/plano/ciclo/
vencimento de todas as assinaturas permaneceu a2b020a9d628b75537f6a03440b235a9;
um cartão continuou ativo; authenticated sem EXECUTE na RPC. Leitura real pelo novo
código: Betel com um cartão padrão, elegibilidade sem bloqueio, vencimento 14/10/2026
preservado e nenhum campo token/customer_id/criptografia retornado. Não houve alteração
no banco Betel, tokenização real, cobrança real ou troca do cartão do titular.

73 testes em nove arquivos passaram; incluem SQL PostgreSQL descartável, rollback de
auditoria, isolamento, consentimento, replay, falha de tokenização e método da recarga.
ESLint, TypeScript e build webpack (108 páginas) passaram. Publicação será confirmada
pelo SHA servido e pela interface; homologação com novo cartão pertence ao titular.

Cockpit: cadastro Supabase/Storage Betel corrigido e auditado a partir dos destinos
verificados. UI separa quatro configurações obrigatórias SQL/jobs de complementos de
observabilidade/inventário (CH: três; Betel: sete). Vínculo organization_id não é erro
operacional enquanto client_access_enabled=false. Leituras CH 6/8 e Betel 5/8 seguem
saudáveis; não significa executor SQL/jobs ativo. Nenhum conector inseguro habilitado.


## Ativação do cofre do cockpit — 16/09/2026, 22h BRT

Cadastradas e verificadas no banco de produção, com criptografia AES-GCM e auditoria,
as configurações de plataforma INFRA_ADMIN_USER_IDS (administrador da plataforma
já existente) e INFRA_HEALTH_PROJECTS_JSON (chave pública própria da Betel).
O cockpit passa a consultar o cofre quando não há variável explícita no ambiente.
Somente registros platform, organization_id nulo, integração infrastructure são
aceitos. Erro de leitura/descriptografia bloqueia a autorização; grants não têm cache.
Configuração editável em Admin OS > Manutenção > Infraestrutura / Admin OS.
Não cadastrar estes campos em escopo de cliente. Variável de ambiente não vazia
prevalece, inclusive um JSON vazio; removê-la se a fonte desejada for o cofre.

Verificação real, somente leitura: código local leu o cofre de produção e confirmou
Auth/REST/Storage/banco HTTP 200 nos dois projetos; histórico CH contém 0151.
Betel usa scraper_targets com select=*&limit=0, sem retornar dados de negócio.
Não foi necessária chave service_role da Betel; a chave pública bastou aos probes.
Os registros do cofre e seus eventos foram relidos após a gravação. Sem SQL,
migration, alteração de cliente, job, cobrança ou emissão de mensagem de teste.

Ainda bloqueados: histórico Betel (schema supabase_migrations não exposto via REST,
HTTP 406; não há RPC de histórico); execução SQL nos dois projetos (DSN/role TLS,
INFRA_MIGRATION_EXECUTION_ENABLED e INFRA_MIGRATION_EXECUTOR); Inngest CH
(autenticação HTTP do proxy); Inngest Betel (origem conhecida somente loopback no
host); ações jobs (adaptador HTTPS por projeto não instalado); endpoints de worker,
publicadores VPS e métricas de armazenamento. DSN Betel de cloud antigo e DSN local
sem TLS foram descartados como alvos. Nenhum bloqueio foi contornado com conexão
insegura. Supabase Storage saudável não comprova R2 nem inventário/bytes de buckets.

65 testes direcionados, TypeScript, ESLint e build webpack (108 páginas) aprovados;
verificação real adicional passou. Publicação confirmada: master 15dd3977de73287604ed6a8e4f0a6c15c5e9b983; /api/health
200 com o mesmo SHA. Às 22:14–22:15 BRT, UI autenticada mostrou Admin infra,
CH com seis leituras saudáveis e Betel com app/Auth/REST/Storage/banco saudáveis.


## Complemento por fases — ConnectyHub e Betel, 16/09/2026

Prioridade mantida em ConnectyHub e Betel no cockpit oficial. Inventário agora
separa saúde e configuração (pronta/incompleta/bloqueada), lista requisitos
por projeto e deixa de chamar leitura sem endpoint de monitoramento ativo.
Betel ganha probe público do login VPS (HTTP 200 observado) e Auth Supabase
(HTTP 403 sem credencial observado), sem herdar chaves da CH. Configuração
JSON inválida e falta de chave/endpoint são diagnosticadas explicitamente.

SQL existente preservado: preparação imutável, confirmação/hash, auditoria,
TLS, transação e histórico. Complemento bloqueia comandos destrutivos por
padrão antes de executar. Cliente HTTPS de jobs implementado com leitura,
capacidades por projeto, confirmação, revisão de estado/alvo, recibo e auditoria;
sem adaptador no host, aponta INFRA_JOB_ADAPTERS_JSON.<projeto>.url/.token.
Timeout não é sucesso e não dispara retry. Credenciais de evento Inngest não
viram acesso administrativo automaticamente.

Não requer migration nova nem mudança de permissões. Camada cliente segue
fechada. Execução SQL real, jobs de produção, métricas R2 e ligação dos
publicadores VPS continuam dependentes da configuração descrita no
[diagnóstico e contrato por fases](cockpit-fases-2026-09-16.md). Nenhuma ação
de banco de cliente, pausa/replay de job, mensagem ou cobrança para validar.

59 testes direcionados em oito arquivos, TypeScript, ESLint e build webpack
com 108 páginas aprovados. Publicação do complemento em andamento. A entrega anterior já estava
publicada em 6a9cb977, Vercel E478TDcbkqNCN6ZAMdq3XfoFp58g Ready/Production,
conferida novamente no navegador às 21:36 BRT.


Publicação confirmada em **16/09/2026 às 21:42:17 BRT**: commit
`8fc412de99fc77ee57e138de135f1eb44d5fe076` na master, Vercel
[6k1Vd7UCEfaUaNJWpXHcqWbytTdt](https://vercel.com/nova-connectyhub-s-projects/novaconnectyhub/6k1Vd7UCEfaUaNJWpXHcqWbytTdt)
**Ready / Latest / Production**, vinculada ao domínio principal. Health público
200 com SHA correto; inventário sem sessão 401; alias legado 307 para a rota oficial.

Navegador autenticado conferido entre 21:42 e 21:44 BRT: quatro projetos,
estado de configuração e requisitos expandíveis; CH com seis serviços HTTP
saudáveis, Inngest 401 com variável exata e worker sem endpoint. Catálogo
filtrado mostrou 0151 aplicada (histórico do banco), auditoria mostrou
schema_install. Betel mostrou app saudável, Auth 403 com supabaseKey indicada,
REST/Storage/banco/jobs com bloqueios específicos e histórico SQL bloqueado
por DSN TLS ausente. Formulário de preparação abriu com botão bloqueado pela
allowlist ausente. Jobs CH/Betel indicaram INFRA_JOB_ADAPTERS_JSON por projeto.
Layout desktop e polling observados. Não foi criada migration, escrita de
cliente, pausa/replay ou alteração de credenciais em produção.

Ativação ainda pendente: admin infra designado; DSNs/roles TLS de migrations
por projeto; chave própria do Supabase Betel no coletor; autenticação do health
Inngest CH; adaptadores jobs no host e suas URLs/tokens; ligação dos publicadores
VPS. Métricas de buckets/bytes/R2 e portal legado permanecem fora da ativação.
Código de comandos e testes não comprovam execução de SQL/jobs de produção.
Evidência pós-publicação mantida local para evitar novo deploy só documental.

## Cockpit operacional — camada real, 16/09/2026

Implementados coleta HTTP por projeto no servidor, diagnóstico de configuração,
preparação imutável de SQL, executor PostgreSQL transacional com confirmação/hash,
auditoria e proteção contra reaplicação. Rota oficial: **Admin OS > Sistema >
Infraestrutura**. Hora Space acrescentada; vínculo de organização preparado e
acesso cliente desligado. Migration 0151 aplicada e verificada no Supabase da CH:
quatro projetos, RPCs restritas ao serviço, nenhum cliente habilitado. Sem SQL
operacional em banco de cliente durante a publicação.

Publicado em `8b0d19434c77b7d4673abb839d0845dbb567fd78`, Vercel
`dpl_3HvEPJMW4w4HKpptUed4qbhaepFL` **Ready / Production** às 21:14:36 BRT.
`/api/health` retornou 200 e o SHA publicado; API administrativa retornou 401 sem
sessão e `/infraestrutura` retornou 307 para a rota oficial. Browser autenticado
conferido: quatro projetos, seis serviços CH saudáveis (app/API/Auth/REST/banco/
Supabase Storage), Inngest 401 com diagnóstico, worker sem endpoint, catálogo
aplicado até 0151 e auditoria `schema_install`. Polling atualizou as observações.
45 testes direcionados, complementos finais, TypeScript, lint e build aprovados.

Bloqueios vistos em produção: usuário da sessão fora de `INFRA_ADMIN_USER_IDS`,
ausência de `INFRA_MIGRATION_EXECUTION_ENABLED=true`, de DSN PostgreSQL TLS em
`INFRA_PROJECT_DATABASE_URLS_JSON.connectyhub` e de `INFRA_MIGRATION_EXECUTOR=vps-sql`.
Inngest exige `INFRA_HEALTH_PROJECTS_JSON.connectyhub.inngestAuthorization`;
workers e projetos externos precisam de endpoints/credenciais próprios. R2,
telemetria de deploy VPS e redirecionamento do portal legado no subdomínio seguem
sem ativação nesta entrega. Execução remota real do cockpit não foi homologada;
validação transacional ficou em PostgreSQL descartável. Nenhuma operação de SQL
em cliente, cobrança, WhatsApp ou alteração de credenciais durante a publicação.
[Implementação, configuração, riscos e evidência](infraestrutura-operacional-2026-09-16.md).

## Histórico: cockpit de infraestrutura — MVP local, 16/09/2026

Implementadas `/admin/infrastructure` e páginas por projeto, com inventário
ConnectyHub/Betel/Vision, snapshots de Supabase/Inngest/app/worker/storage,
catálogo/preview de migrations e auditoria. Deploy VPS integra esta entrega:
histórico persistente, etapas em polling de cinco segundos, imagens, executor,
container, healthcheck, logs estruturados e acompanhamento do rollback em execução.
Betel declara publicação real em VPS/app-production com Vercel como proxy;
push GitHub, deploy Vercel/proxy e deploy VPS são distinguidos.

Migration `0150_infrastructure_cockpit.sql` aplicada no Supabase da ConnectyHub
na VPS em 16/09/2026, com seis tabelas, três projetos iniciais e duas funções
de telemetria/deploy validadas. Leitura requer administrador da plataforma;
preparação de comandos exige também
`INFRA_ADMIN_USER_IDS`, confirmação e auditoria. Execução remota de migrations,
Inngest e rollback permanece bloqueada com motivo, inclusive para admin infra.
Receptor de eventos usa hashes de tokens por projeto/escopo em
`INFRA_INGEST_KEYS_JSON`, sequência/idempotência e registro transacional. Helper
`scripts/infra-report.mjs` preparado para os publicadores; não conectado aos hosts.

Validação local: 30 testes em cinco arquivos passaram, incluindo migration/RLS,
grants, atomicidade e transições no PostgreSQL descartável PGlite, rotas de acesso,
isolamento, confirmações e reenvio do helper para servidor fictício em localhost.
ESLint, compilação e TypeScript aprovados. Navegador com componentes e shell reais,
respostas fictícias: polling, confirmação bloqueada, cinco abas em 390px, desktop,
vazio/telemetria antiga/erro, sem overflow horizontal nem erro JavaScript.
Rota temporária de prévia removida. Build sem configuração parou no sitemap
preexistente do catálogo; build Next/webpack completo depois aprovado com 108 páginas,
usando backend fictício de catálogo vazio em localhost e chaves sintéticas apenas no
processo. A fixture recebeu somente GET/HEAD; nenhum acesso ao banco real. Catálogo
de 150 migrations conferido nos traces do servidor. Esse artefato serve para QA;
uma publicação exige novo build com a configuração real autorizada.

**Ainda pendente de publicação da aplicação e coletores reais conectados.**
Inventário não é prova de saúde; falta publicar a aplicação, configurar admins e
hashes, ligar publicadores/coletores e cadastrar catálogos externos. Houve
alteração de schema no Supabase da ConnectyHub; não houve operação em Inngest,
comando remoto, rollback real ou ação destrutiva.
[Contrato, arquivos, limites e roteiro de integração VPS](infraestrutura-cockpit-2026-09-16.md).

### Desalinhamento do subdomínio — diagnóstico e correção local, 16/09/2026

`infraestrutura.connectyhub.com.br/infraestrutura` continua servindo o portal
independente de homologação em `/opt/connectyhub-managed-portal`, com sessão e
banco próprios. Ele não é a aplicação principal e por isso não recebeu a rota
`/admin/infrastructure`. A correção de roteamento foi preparada nos dois pontos:
o portal legado encaminha `/infraestrutura` e suas subrotas para
`https://www.connectyhub.com.br/admin/infrastructure`, e a aplicação principal
aceita o mesmo caminho legado. O redirecionamento é temporário (307) para evitar
cache permanente enquanto o acesso do VPS não estiver disponível. A conferência
pública ainda retorna o comportamento antigo até a imagem do portal ser
reconstruída e ativada no VPS; nenhum banco, credencial ou operação real foi
alterado nesta correção.

Após autorização do titular, o código do app principal foi enviado à `master` em
`71d73f5098bdd44aeea5f78275377e491066009d`. A produção respondeu `/infraestrutura`
com `307` para `/admin/infrastructure`, `/admin/infrastructure` com `307` para
login e a API oficial com `401` sem sessão; isso confirma a implantação da rota e
do cockpit no domínio principal. O subdomínio continua no portal independente até
o patch `eb635248` ser ativado no serviço do VPS.

## Agente Onipresente Ativo — entrega local, 16/09/2026

O agente web passou a retornar comandos limitados para destacar/abrir produto,
localizar seções e abrir a revisão do carrinho nas páginas próprias. A inclusão de
item exige botão de aceite com produto/quantidade explícitos, validação no servidor
e autorização consumida uma única vez. Observador e superfície de checkout mantêm
o comportamento anterior; Assistente/Vendedor ativo atendem aos pedidos nas
superfícies loja, produto e carrinho. Nenhum pedido, pagamento ou agendamento é
criado automaticamente.

Propostas, aceite/recusa e resultados usam `commerce_agent_actions` e eventos que
o Arquivo do Lead existente lê, com organização, lead, conversa, agente, produto,
quantidade, motivo, superfície e horário. Resultado do navegador é identificado
como tal. Reusa os tipos SQL existentes, sem migration; validade de cinco minutos,
isolamento da sessão/página e proteção contra execução repetida. Falha de registro
antes da execução bloqueia a autorização. Banco e carrinho local não são atômicos;
perda de resposta pode exigir conferência manual, sem repetição automática.

Validação local: 172 testes em 11 arquivos aprovados; após o ajuste dos rótulos do
Arquivo do Lead, os 23 testes de servidor passaram novamente. ESLint aprovado.
Navegador com componentes reais/APIs fictícias confirmou destaque, ausência de
inclusão antes do aceite, recusa e inclusão de duas unidades após confirmação,
sem chamada de criação de checkout. Layout desktop/celular conferido, sem overflow.
Prévia temporária e seu tipo gerado removidos. A primeira tentativa de build parou
no sitemap por ausência de configuração do Supabase nesta worktree. Na finalização
autorizada de 16/09, o build completo passou com 108 páginas usando somente as
variáveis necessárias do checkout principal no ambiente do processo, sem arquivo
de segredo novo ou mudança no sitemap. Compilação, TypeScript, ESLint e diff-check
aprovados. A suíte final tem **181 testes em 12 arquivos**, incluindo PostgreSQL
local/PGlite com o DDL e as políticas versionadas: gravação/aceite/conclusão,
repetição, constraints, RLS e leitura pelo código real do Arquivo do Lead.

Supabase de destino conferido por OpenAPI e SELECT com `limit=0`: as duas tabelas
e todas as colunas usadas existem; service role leu com HTTP 200, sem linhas de
clientes. Isso não equivale a testar escrita/RLS em produção: mutações e testes
de acesso ficaram no PostgreSQL descartável. O CLI Vercel não conseguiu acessar
as configurações do projeto vinculado; nenhuma configuração foi alterada. Embora
`TRACKING_PUBLIC_TOKEN_SECRET` esteja ausente localmente, HTML público retornou
HTTP 200 com token assinado para a organização em 16/09, sem executar JS ou POST
de sessão/tracking. Não foi necessário obter/copiar esse segredo para a entrega.

Revisão final restringiu modos permitidos, acrescentou negações explícitas no
parser e conferência do comando autorizado contra o produto/quantidade exibidos
no aceite. Diff restrito a esta frente, preparado sobre `origin/master` em
`e597e610`. Nenhuma migration SQL, push ou deploy nesta finalização.

**Não publicado.** Busca inicial usa título completo entre até 200 itens ativos;
composição, agendamento e site externo ficam fora da inclusão assistida. Abertura
de checkout neste recorte é revisão manual do carrinho. Falta publicar quando
autorizado e retestar navegação/consentimento/Arquivo do Lead e continuidade
WhatsApp com dados reais. Sem alterações em Voz/LLM, billing, gateways, agenda ou
infraestrutura. [Contrato, auditoria, evidências e limites](agente-onipresente-ativo-2026-09-16.md).

## Betel somente transporte — preparado em 14/09/2026

Novo escopo autorizado mantém URLs e CRM na Betel. O modo nativo da API, selecionado por configuração de organização no servidor, exige track_id, preserva links e mídia e mantém recibos técnicos/uso sem criar leads, conversas ou links CH. A mesma separação alcança os webhooks de instâncias API, para não recriar CRM no retorno do provedor. Replays e dados antigos preservados; sem migration ou alteração de tarifas. Código e testes locais; ativação em produção ainda depende da confirmação do adaptador nativo Betel. [Contrato](betel-transporte-nativo-2026-09-14.md).

## Links WhatsApp no domínio do cliente — 14/09/2026

Resolvedor autenticado `GET/HEAD /api/v1/links/{id}/resolve` implementado para a organização da chave WhatsApp (`instances:read`). Retorna somente o destino armazenado; HEAD e prévias não incrementam cliques. A origem de novos links pode ser selecionada por organização em `WHATSAPP_TRACKING_ORIGINS_JSON`, configuração exclusiva do servidor, sem aceitar Host/destino do pedido. Links antigos e demais organizações preservados. Sem migration ou alteração financeira.

39 testes offline de origem, isolamento, destino, prévia, arquivo e entrega passaram; lint, diff-check e build Next/webpack com TypeScript e 107 páginas aprovados. Publicado em `2e0409c2`; após oito HEADs conjuntos sem cliques, mapa Betel ativado no deploy `dpl_FMNemmo5JCcZtTXouewovymz7MBw`, Ready / Production às 17:07:55 BRT de 14/09. Nenhum WhatsApp, clique real, inferência ou cobrança de teste. O modo nativo posterior é uma etapa distinta, descrita acima. [Contrato e ativação](links-whatsapp-origem-cliente-2026-09-14.md).

## Administração de AI e Voz — separação local, 14/09/2026

Revisão pedida pelo titular com referência à administração da API WhatsApp. A rota `/admin/voz`, o menu e a API protegida já existiam; não foi necessário recriar o backend. A entrada administrativa agora se chama **Estúdio de Voz e Áudio**, agrupada com API WhatsApp e API de AI em **APIs e serviços**. Cliente mantém **Estúdio de Voz e Áudio AI**.

A rota `/admin/api-ia` antes reutilizava o console cliente, incluindo geração e endpoints da organização atual. Agora usa `AdminAiConsole`: operações/pendências reaproveitam `AiOperations`; clientes/projetos/chaves são consultados por novo endpoint exclusivo de administrador, com prefixos e metadados, sem segredo/hash. Configuração comercial aponta para o catálogo financeiro e a manutenção já existentes. O console cliente continua nas próprias rotas, sem alteração de suas ações de geração.

Voz administra agregados reais por cliente, modelo e operação, filtro por projeto e período, até 50 recibos recentes sem conteúdo/mídia/credenciais. Custos estimados permanecem identificados; custo efetivo mostra também quantas operações foram apuradas. Filtros preservam o RPC e suas permissões. Seletor/diretório limitados a 1.000 projetos, com aviso de truncamento; não representam um limite dos agregados de consumo. Diretório de AI é leitura; alterações comerciais e de clientes usam controles existentes, sem novo mecanismo de débito ou rotação de chaves.

Validação: 14 testes em quatro arquivos, lint, TypeScript e build Next/webpack com 107 páginas aprovados; navegação administrativa e diretório de chaves conferidos na prévia com dados fictícios, sem geração. Viewport de 390 pixels sem transbordamento na conferência. Nenhum envio, cobrança, clonagem, alteração de carteira ou migration. **Local, ainda não publicado nem confirmado em sessão administrativa de produção**. A expansão de oito recursos/Gemini e a matriz comercial continuam pendentes e não estão comprovadas por esta entrega administrativa.

## Estúdio de Voz e Áudio AI — estrutura visual local, 14/09/2026

Referência visual encaminhada pelo titular incorporada à expansão: nome do produto atualizado em menu, títulos e documentação; exatamente duas seções no cliente, Estúdio de Voz selecionado por padrão e Projetos e chaves API. Removido o cartão redundante de saldo. Uso real resumido acima das seções, com período; histórico, gráficos e detalhamento continuam acessíveis em área expansível. Visão administrativa preservada. Esta etapa não ativa modalidades, muda tarifas, clona vozes ou altera credenciais.

Lint, TypeScript e diff-check aprovados. Prévia do componente real com dados fictícios e mutações bloqueadas conferida no navegador: abertura no Estúdio, navegação para projetos, expansão do histórico e largura móvel de 390 pixels sem transbordamento horizontal. Ainda local, não publicada; integra o pacote maior de expansão em andamento. Novas modalidades e matriz de custo/acesso continuam pendentes; esta revisão visual não comprova sua implementação.

## API de Voz AI — rótulo de acesso à API, local em 14/09/2026

Pedido pontual do titular: **Projetos e chaves API** substitui **Projetos e chaves** na aba, título da seção e indicação correspondente no guia público de Voz. Alteração somente textual, conferida na prévia local ao abrir a aba, com lint e diff-check aprovados. Não publicada; aguarda autorização desta publicação. Não inclui o plano de expansão do Estúdio nem altera a API de AI, ações, permissões, credenciais ou cobrança.

## Nomes dos produtos API — publicado, 14/09/2026

Refinamento explícito do titular após conferir a publicação visual: os nomes de produto passam a **API de AI** e **API de Voz AI**. Alterados menu do cliente/admin, cabeçalhos, títulos, rótulos de acesso e referências de produto na documentação pública/guia/OpenAPI. As referências genéricas à inteligência artificial não foram traduzidas globalmente. Rotas `api-ia`, `voz`, âncoras, IDs, contratos, credenciais, tarifas e modelos permanecem iguais. Estúdio de Voz mantém o nome da funcionalidade.

Publicado em `d620d5cf14ecd4025f9ac2bd29cc2bd9710abf76`, Vercel `dpl_JADqu45RpqngkC32NztCivjwefEM` Ready / Production, criada em 14/09 às 16:00:28 BRT, ambos os domínios vinculados. Lint e build local completo com TypeScript/107 páginas aprovados. Confirmados nomes no menu, título, cabeçalho e breadcrumb das duas páginas no navegador de produção; OpenAPI público dos dois serviços responde com os novos nomes e as mesmas bases. Nenhum teste pago ou alteração operacional. Nota pós-publicação mantida local até próxima entrega, sem novo deploy apenas documental.

## API de Voz — revisão visual publicada, 14/09/2026

Após confirmação direta do titular nesta tarefa, pacote `17731ed31b326a00dad0cbc1205ccaa9509f0edf` enviado à master, preservando `878eea3`, sem force. Vercel `dpl_729JcggaNELwVjymigtPyS6P2x93` Ready / Production, URL `novaconnectyhub-l49fz1zpn-nova-connectyhub-s-projects.vercel.app`, vinculada aos domínios principal e www. Log remoto confirmou master/17731ed, compilação, TypeScript e 107 páginas; build encerrado às 18:54:14 UTC. As rejeições anteriores foram resolvidas pela autorização direta, sem execução indireta.

Conferência em produção na sessão existente do cliente: API de Voz em título, cabeçalho e menu; painel claro com gráficos/histórico carregados; Estúdio e catálogo com nomes comerciais neutros e Evelyn privada preservada. Desktop e viewport 390x844 inspecionados, com campos/abas legíveis. Guia Markdown e OpenAPI retornaram HTTP 200, sem menções à marca do fornecedor. IDs técnicos permanecem compatíveis. Nenhuma geração, clonagem, alteração de chave, tarifa, carteira ou mensagem de teste nesta publicação. Evidências locais anteriores: nove regressões, lint, tipos e build aprovados. Streaming/timestamps/dicionários não integram este pacote. Este registro posterior permanece local para evitar novo deploy apenas documental.

## API de Voz — revisão visual local, 14/09/2026

Por solicitação do titular, a interface foi alinhada ao painel existente de API de IA: nome API de Voz no menu/metadados/cabeçalho, fundo claro, ações azuis, saldo compartilhado em destaque, abas Painel de uso / Projetos e chaves / Estúdio de Voz. Gráficos de créditos e solicitações usam os agregados reais já existentes, com tabela acessível e fuso UTC explicitado. Histórico em itens expansíveis, estados traduzidos, carregamento e falha sem apresentar saldo/consumo zero fictício; botões e abas ajustados para celular. Operações, endpoints, tarifas, clones e credenciais preservados. Nenhuma migration nesta revisão.

Tipos, lint, build Next/webpack (107 páginas) e nove regressões existentes de contrato/isolamento/ledger passaram. Inspeção visual do componente real em prévia local com dados fictícios e mutações bloqueadas: desktop 1440x900 e celular 390x844, uso, Estúdio, projetos/chaves, vazio e erro. Referência comparada ao código e tela publicada da API de IA. **Correção visual ainda não publicada**; produção permanece no pacote 878eea3 descrito abaixo.

Complemento de apresentação: nomes comerciais neutros no seletor, resumo de consumo e catálogo público, mantendo os IDs técnicos aceitos pelas integrações. Guia/exemplos de Voz não exibem a marca do fornecedor; Evelyn e demais nomes de vozes dos clientes permanecem inalterados. Prévia revalidada com o CSS global real e `data-connecty-mode`, inclusive preferência escura do navegador: o painel preserva seu tema claro, textos e ações legíveis, sem transbordamento horizontal no celular. Nenhuma alteração de tarifa, carteira, chave ou mapeamento de síntese.

Homologação Betel da versão publicada: síntese única de Evelyn concluída em 14/09 às 18:13:35 UTC, geração `4b04635f-1aab-4dbc-b1fb-b1b3a71ae923`, MP3 de 119.162 bytes. A tarefa Betel confirmou recuperação do mesmo áudio e replay da mesma idempotência. Consulta independente no banco ConnectyHub confirmou completed, reserva zero, cinco créditos, exatamente um evento de uso e um débito; nenhuma nova síntese na conciliação. Sem WhatsApp nem nova clonagem. Compartilhamento do resultado financeiro entre tarefas foi bloqueado pela revisão automática por exigir autorização do destinatário/payload; não confundir com falha na geração ou cobrança.

## ConnectyHub Voz — pacote inicial publicado, 14/09/2026

Publicação confirmada após autorização específica do titular: commit `878eea363d570263f4acbb59dc6e14bd9b628058` enviado à master sem force, preservando `312a02d`. Vercel `dpl_Et3twiFZ9eNYqJFbFNPBMtPpJTfZ` Ready/Production, criada às 18:01:24 UTC e vinculada aos domínios principal/www. OpenAPI e guia de Voz retornam HTTP 200; `/api/v1/voice/models` sem chave retorna 401. Com a chave Betel existente, models/voices/generations retornaram 200 com projeto e carteira corretos; Evelyn apareceu exclusivamente como clone privado vinculado. Estúdio, API e Gestão conferidos na sessão real do cliente; painel administrativo e documentação `/docs/api#voz` também abriram. Nenhuma geração realizada nesta conferência.

Projeto Betel Voz, chave exclusiva e vínculo verificado de Evelyn já tinham sido criados com autorização direta anterior, sem recriar a voz ou cobrar vinculação; não eram pré-requisito da publicação. O teste único de síntese (teto 5 créditos), recuperação e replay foi retomado na tarefa Betel após a validação dos endpoints, mas ainda não retornou evidência de áudio ou débito. Não declarar a integração completa antes dessa conciliação. Complementos de streaming/timestamps e dicionários permanecem fora deste pacote. Pequeno texto residual no portal diz “Duas APIs”; cabeçalho/menu já incluem as três, sem impedir o contrato de Voz.

Estúdio do cliente, projetos/chaves dedicadas, clones privados, geração/download/recibos, gestão de consumo e painel administrativo implementados. Cobrança usa a carteira existente e as tarifas efetivas da operação equivalente; taxa zero explicitamente cadastrada de clonagem preservada, sem liberar TTS/LLM sem tarifa. Uma prévia fixa por clone tem custo absorvido e recibo único. Clones e mídia são isolados por organização/projeto, inclusive após rotação de chave; importação administrativa de voz existente exige evidência de consentimento e propriedade. Não houve alteração de tarifas, plano ou recarga.

Migration `0147_connectyhub_voice` aplicada na VPS após ensaio com rollback, MD5 LF `52786b3c82fdea943393d0834be76a1a`. Bucket privado, RLS e RPCs restritas ao serviço conferidos. Ensaio transacional no banco real validou reserva, conclusão repetida com débito único e contabilização de armazenamento; tudo revertido, sem síntese/cobrança persistida. Segurança de reset `0146` / aplicativo `312a02d` incorporada e preservada, assim como seu registro de observação em produção.

**2.787 testes em 221 arquivos**, lint e build/TypeScript (107 páginas) aprovados antes da publicação. Documentação pública integra `/docs/api#voz`, OpenAPI e guia. A publicação foi confirmada acima; teste integrado Betel ainda pendente, pois testes locais não comprovam síntese real. O clone Evelyn existente foi consultado no fornecedor com sucesso, sem recriação. [Cobertura integral do fornecedor, recursos implementados e dependências concretas](matriz-connectyhub-voz-2026-09-14.md). Este pacote não comprova paridade completa com ElevenLabs; streaming/timestamps e demais famílias ainda estão discriminados como não implementados.

## Reset por acesso assistido — publicado em 14/09/2026

Restrição implementada na base publicada `4c84800`: reset exclusivo de administrador da plataforma durante acesso assistido a cliente, vinculado no servidor às duas sessões Auth reais e à organização. Cliente owner/admin/comum e admin sem contexto assistido não recebem acesso. Expiração/encerramento revogam a capacidade. Inclui bloqueio de autopromoção pelo campo `profiles.is_platform_admin`, cuja permissão direta foi confirmada na VPS. Corpo do reset integral preservado.

2.774 testes gerais e três testes adicionais de visibilidade, lint e build/TypeScript aprovados. Migration `0146` aplicada após ensaio com rollback; persistência e permissões conferidas às 16:31:48 UTC. SQL MD5 `d800732b2c41189035dedeb23deda45e`, corpo do reset `c451b2107b57810d176abea29ee8871a` preservado. Publicação do aplicativo em andamento. Nenhum reset real, envio WhatsApp ou chamada faturável. [Implementação, matriz e limites](reset-acesso-assistido-2026-09-14.md).

Concluído: aplicativo `312a02d`, Vercel `dpl_HycZAX7Dyz7fA3MUN1PXdBqpqG3U` Ready/Latest/Production no domínio principal às 16:34:21 UTC. Entrada assistida pelo Admin OS observada; botão e modal apareceram no cliente e o modal foi cancelado. Retorno ao administrador revogou a capacidade no banco e removeu o botão da outra aba. Zero novos resets; último job permaneceu anterior a esta tarefa. RPCs públicas diretas negadas com 401/42501, home/login 200. Matriz adversarial e expiração testadas de forma isolada. Registro pós-publicação mantido local para a próxima entrega documental.

## Precisão de créditos da API — 14/09/2026

Publicado `4c84800`, Vercel `dpl_5tUEuN5Uw7ZD8FqcRGJnoiUkKKr9` Ready/Production e domínio principal confirmados às 11:03 BRT: cálculo decimal elimina o acréscimo espúrio de um milionésimo causado por ponto flutuante, mantendo tarifas, mínimo, pacotes e arredondamento para cima de frações legítimas. 136 testes da API, lint e build com TypeScript passaram; oito verificações públicas passaram e 35 entradas de preços ficaram idênticas. Às 11:13 BRT, leitura independente confirmou uma operação real da tarefa Betel posterior à publicação: STOP, JSON válido, mínimo aplicado, recibo/consumo/único débito coerentes e reservas zeradas. Isso fecha a pendência de observar liquidação pós-publicação; o caso numérico original e os limites de arredondamento foram reproduzidos localmente, não por nova geração real idêntica. Nenhum saldo histórico alterado; diferença histórica de 0,000001 crédito permanece pendente, sem estorno. Nenhuma geração paga duplicada nesta tarefa. [Implementação e limites](correcao-precisao-creditos-2026-09-14.md).

Atualização: 14/09/2026. Este é um ponto de continuidade, não monitoramento em tempo real. Revalidar antes de decisões de produção. A auditoria geral solicitada pelo titular está em andamento e ainda não autoriza declarar todos os recursos prontos para a próxima fase.


## API LLM — infraestrutura de 14/09/2026

Pacote incremental publicado: `68ae22b`, Vercel `dpl_3jxPYR4jvxuVjLcLVuNYLQcsoq2r` Ready/Production e domínio principal conferidos às 05:51 UTC. Relay de arquivos/Live ativo por HTTPS na VPS; upload por ticket e conexão privada com a aplicação verificados sem arquivo real nem inferência paga. Documentação 1.6.0, 15 operações nativas Gemini e preços públicos respondendo. Paridade completa e homologação real de todas as modalidades continuam pendentes.

Complementos de lotes (6 métodos) e File Search (9) publicados com autorização direta em b742e91 e correção 508953c. Vercel dpl_bgU48TSxbC7MFvu45XdHe92h2G5V Ready/Production, domínio principal e commit conferidos em 14/09 às 13:09 UTC. OpenAPI publicado contém 30 operações. O 503 na cópia do Request encapsulado pelo Next.js foi reproduzido e corrigido; 24 testes adicionais, lint e build passaram. Quatorze probes públicos finais passaram, incluindo proteção 401 das novas rotas e rejeição de chave sintética inválida. Antes da correção, o pacote completo passou em 2.735 testes e dez chamadas offline com SDK oficial. Não houve geração paga, indexação real, arquivo pessoal ou mudança financeira de teste. Próximo passo: testes controlados dos fluxos publicados; paridade integral e homologação de todas as modalidades continuam pendentes. O compartilhamento com a tarefa de origem continua aguardando autorização específica. [Matriz e limites](matriz-paridade-gemini-2026-09-14.md).

Proteção financeira 0143 aplicada e conferida. Migrations 0144 (tickets descartáveis de upload) e 0145 (capacidade por carteira/global) publicadas às 05:06 UTC no Supabase da VPS: RPCs novas exclusivas do serviço, RLS ativo, trigger habilitado e proteção financeira preservada. Nenhum saldo/preço/pedido alterado e nenhuma geração ou cobrança real de teste. A implementação LLM permanece em desenvolvimento; esta publicação SQL não comprova paridade integral nem transporte completo em produção. [Evidências, limites e etapa de publicação](implementacao-api-llm-2026-09-14.md).

## Atendimento, links globais e busca — publicado em 13/09/2026

Execução do plano retomada pelo titular, com Gustavo e Renata como prioridades. Migrações `0137`–`0139` aplicadas e verificadas no Supabase da VPS: contexto factual do item na reserva, avisos independentes por audiência, claim/versionamento final, recibos por operação de envio e busca indexada/paginada de catálogo/SKU. Hashes do SQL conferidos com os arquivos locais; permissões de execução restritas ao serviço e RLS ativo. A transação preservou os registros anteriores de reservas, ofertas, avisos e eventos, sem repetir eventos nem criar reservas. A função de reset permaneceu inalterada. Aplicativo publicado na master em `8a4d893` + `c4010b1`; Vercel `dpl_UTuojL48rHZGLvvcHEQsECVpYGgn` Ready / Latest / Production às 21:27:48 BRT, com domínio principal conferido. Home/login HTTP 200, endpoint de checkout inexistente HTTP 404 esperado. Suíte geral 2.581 testes e complementos aprovados, tipos/lint/build aprovados; sem teste real dos agentes. P1.2 e etapas seguintes continuam em desenvolvimento. [Escopo, inventário de emissores, validação e etapas pendentes](execucao-atendimento-32-perfis-2026-09-13.md).

## Entrega regional — publicado em 13/09/2026

P1.2 implementado e validado localmente: critério único de bairro/cidade, CEP, raio/polígono, prioridade de sobreposição, mínimo e isenção do carrinho, ponto vinculado ao destino e descarte ao mudar o endereço. Migration `0140_revision_delivery_snapshot` aplicada com hash do SQL `b5fc785ab7597a585615fdba84abe3da`, preservando as funções de bloqueio/claim e o reset. Sem atualização de registros de clientes pela publicação. Aplicativo publicado em `96bfae2`, Vercel `dpl_9aeetRfhCprBQ4sjSEhG1iHuTVtX` Ready / Latest / Production às 22:05:10 BRT, domínio principal vinculado; suíte geral 2.612 testes, complementos e build aprovados; revisão visual isolada desktop/celular. Horários, alimentação e serviços continuam pendentes.

Conferência posterior à 0140 encontrou `set_checkout_delivery` com execução também por anon/authenticated, apesar do contrato local de serviço. Migration adicional `0141_checkout_delivery_rpc_permissions` restringe o acesso a service_role; único chamador no aplicativo é a rota validada de checkout via serviço. MD5 do SQL normalizado `2bc6c3a2336860a4cdbce0f8506ff894`; 29 testes SQL, incluindo permissões, aprovados. Nenhum corpo financeiro ou registro de cliente foi alterado por essa correção de acesso.

## Horários de operação — publicado em 13/09/2026

P1.3 integrado ao painel, proposta/pedido, revisão, entrega e cobrança: janelas separadas com fuso, intervalos e virada do dia, pausa/datas fechadas e estimativas somente cadastradas. Configuração inicialmente desativada; nenhuma empresa real foi configurada. Consulta de pagamento em andamento e replay concluído preservados fora do horário; bloqueio de nova operação antes de aposentar o pagamento anterior. Não cancela códigos Pix já emitidos nem agenda pedidos futuros. Suíte geral 2.632 testes e complementos aprovados; TypeScript, ESLint e build Next/webpack aprovados. Publicado em `cd9f5b5`, Vercel `dpl_82VyoGrsxaG7pedfsL6WaXPyFPKc` Ready / Latest / Production às 22:32:21 BRT; domínio principal conferido. Sem migration ou transação real de teste. [Cobertura e limites](execucao-atendimento-32-perfis-2026-09-13.md).

## Atendimento, checkout e reset integral — 13/09/2026

Implementação autorizada pelo titular, incluindo envio à master e exclusão integral somente do seu contato de teste e cópias arquivadas na mesma empresa. Preservadas as correções existentes em `44e22ad` para negação financeira, cortesia e continuidade do pedido. Novas correções compartilhadas: captura do nome solicitado pelo próprio checkout, bloqueio de promessa de link sem ação e limite do histórico no inbound atual para evitar a rejeição do Gemini por turno final do modelo.

Migrations `0134_lead_reset` e `0135_lead_reset_legacy_memory` aplicadas e registradas na VPS. Funções locais/remotas conferidas por hash normalizado. Prévia real em 1,7s; exclusão integral simulada em 6,57s com rollback. Marcadores privados por transação evitam re-arquivamento durante reset. A segunda migration inclui memórias antigas com `source_conversation_id` e remove vínculos/metadados do lead em consumo, sem alterar os totais da empresa. A função de baixa de armazenamento da migration antiga `0062` estava ausente na VPS: foi restaurada a partir do código versionado, com execução somente por service_role. O job retomável concluiu as 81 baixas sem duplicar quota.

Aplicação enviada à master em `747e9da`, Vercel `dpl_6i4ghcvHr5HzZjhCX1n7HFURf6LW` Ready/Production no domínio principal às 16:12:27 BRT. Botão/modal conferidos em desktop e celular, com foco inicial em Cancelar, ciclo de Tab e Escape. A sessão atual era da Renata; apenas abrir/cancelar foi testado nessa empresa. Nenhum lead dela foi apagado.

Limpeza autorizada concluída na empresa do Gustavo: oito cópias do contato de teste, nove conversas, pedidos e demais dependências apagados; 81 objetos verificados ausentes no storage. A conferência adicional encontrou e removeu 38 memórias legadas e desassociou 1.302 registros de consumo. Verificação final: zero resíduos em 37 consultas de vínculos nativos/JSON, job concluído e zero arquivos pendentes. Sessão/lead de outra empresa preservados, desassociando apenas seu vínculo legado ao checkout apagado. Mensagem antiga e eco tardio bloqueados; mensagem nova permitida pela proteção de reset.

Passaram 2.529 testes em 191 arquivos, TypeScript e ESLint; depois do complemento SQL, os sete testes de banco passaram novamente. **Limite:** novo atendimento e checkout reais após o reset ainda não foram enviados pelo titular. O reset não cancela nem estorna transações externas. [Auditoria](auditoria-reset-lead-2026-09-13.md) e [plano](plano-correcao-atendimento-checkout-reset-2026-09-13.md).

## Controle explícito de ativação da agenda — 12/09/2026

Refinamento solicitado pelo titular após a publicação conjunta: agenda desativada deve mostrar apenas a tela de ativação e não pode habilitar Agendamento em um produto, expor seleção pública de datas ou permitir promessas/operações de agenda pelo agente. Implementada política compartilhada por empresa no cadastro, importação, loja, página do produto e APIs; configurações existentes e edições não relacionadas são preservadas. Ativação explícita vazia permite configurar os atendimentos depois, sem criar disponibilidade fictícia. A página ativa coloca o calendário em destaque e separa **Criar compromisso** de **Atendimentos e horários**; o fuso permanece manual, com nomes claros e sem alterar valores reais. [Detalhes, cobertura e limites](correcao-ativacao-agenda-2026-09-12.md).

Validação desta etapa: revisão visual local aprovada em desktop e celular com dados fictícios; regressão completa de 1.581 testes em 163 arquivos e rodada adicional de 48 testes em três arquivos após o último teste do assistente web. TypeScript, ESLint sem erros e build de produção com 100 páginas estáticas aprovados. Migration `0131_explicit_agenda_activation` aplicada transacionalmente no PostgreSQL da VPS: dois triggers protegem catálogo/importações, reserva serializada com desativação e três funções anteriores preservadas em cópia privada. Fingerprints das tabelas relevantes confirmaram ausência de alteração de dados de clientes. Assistente web e WhatsApp revalidam a ativação antes da resposta. Publicação da aplicação autorizada, em conclusão. Nenhuma agenda real ativada, configuração de cliente alterada, mensagem, reserva ou cobrança enviada. O registro histórico abaixo descreve a versão anterior e é superado por este refinamento quanto à experiência da agenda desligada.

Complemento de publicação da ativação: commit `6dbfb287cd7026a2a597279de042bac8f545ad38` enviado à master; Vercel `dpl_2J4iAUQyxAAUWo2G3r1gqy9tkCUs` Ready / Production, concluída às 14:25:50 BRT, nos dois domínios. Build remoto confirmou o commit e 100 páginas. Conferência no navegador autenticado atual (BuffaloMass) mostrou somente a tela Ativar agenda, sem calendário. Produto público Ipiranga mostrou indisponibilidade sem calendário ou botão de agendar; assistente ofereceu Tirar dúvidas e WhatsApp, sem sugestão de agendamento. A revisão identificou textos auxiliares antigos na FAQ/benefícios/detalhes, agora condicionados à ativação; complemento de publicação em validação. Não houve ativação ou envio. O aviso de hidratação do cabeçalho foi reproduzido localmente sem componentes da agenda, sem alteração do cabeçalho compartilhado.

A consulta pública de horários do mesmo produto retornou HTTP 409, `enabled: false`, `slots: []` e `Cache-Control: no-store`, com explicação de agenda desativada; foi somente leitura.

## Publicação conjunta da agenda e recuperação de cartão — 12/09/2026

O titular autorizou aguardar a agenda e publicar os dois conjuntos uma única vez. Agenda preservada em `ac655f0`; correção genérica Pix → cartão `9d44414` integrada como `21f6ee2`, sem conflitos de código. As evidências dos dois trabalhos e a nota local de publicação anterior do checkout original foram preservadas. O checkout original não foi alterado.

Validação combinada concluída: **1.568 testes em 162 arquivos**, ESLint sem erros, diff-check e build de produção local aprovados. O build compilou, passou TypeScript e gerou 100 páginas estáticas, incluindo o registro da rota dinâmica `/dashboard/agenda`. Para o sitemap, foram usadas temporariamente apenas as três variáveis Supabase do ambiente local existente, com destino confirmado `supabase.connectyhub.com.br`; o arquivo temporário ignorado foi removido após a validação. A primeira tentativa sem ambiente completou compilação/TypeScript e parou por ausência da configuração do sitemap; isso foi resolvido sem alterar o código. Os testes de reservas, banco, gateway e transporte permanecem sintéticos, sem compra, cobrança, mensagem, reserva ou mudança nas configurações dos clientes.

Publicação conjunta concluída em 12/09/2026: um único push levou a master de `1d33255` a **`1c033e15d831d9e51685a0c9afc227f61ac2cc15`**. A Vercel criou **`dpl_9XmZmN9uhtkXzvzhSEFn8kpmTCM7`**, Ready / Production, URL `novaconnectyhub-vjl06lzzx-nova-connectyhub-s-projects.vercel.app`. O build remoto confirmou o commit, compilação, TypeScript e 100 páginas estáticas. Inspeções separadas de `www.connectyhub.com.br` e `connectyhub.com.br` confirmaram a mesma implantação e ambos os aliases; nenhum deploy manual adicional.

Observação pós-publicação em navegador: a sessão de cliente existente abriu `/dashboard/agenda` com o item Agenda ativo, calendário e consulta de outro mês sem erro. A organização consultada permaneceu desativada, sem serviços e sem compromissos no período, com Nova reserva desabilitada. A central Automações abriu sem o bloco de agenda; o retorno pelo item lateral funcionou. A página pública do item abriu o calendário mensal, permitiu selecionar outro dia e manteve o aviso para combinar atendimento, sem inventar vagas. Não houve ativação, salvamento de configurações, reserva, envio de mensagem ou transação financeira. O teste usa a sessão já disponível no navegador e não é uma auditoria de todos os papéis/empresas. A entrega efetiva do botão Pix/cartão e uma nova reserva continuam para o reteste do titular. Este registro pós-push permanece local nesta cópia para evitar uma segunda implantação apenas documental; o checkout original foi preservado.

## Agenda em calendário — implementação local de 12/09/2026

Por solicitação do titular, **Agenda** passa a ser um item do menu do cliente em `/dashboard/agenda`, com título Agenda inteligente. O bloco completo foi retirado de Automações. A página preserva a seleção inicial/empresas acessíveis e a associação do agente pelo WhatsApp padrão salvo; mantém o controle de sessão/contrato e o escopo de organização já exigido pela API. Trocar a empresa reinicia o componente, sem reaproveitar formulários, horários ou detalhes anteriores. O administrador global não recebeu esse item.

O calendário oferece Hoje, anterior/próximo, mês/semana/dia, filtro por recurso, compromissos com estado e abertura dos detalhes/ações existentes. Configurações, serviços, fuso e ativação ficam recolhidos. A consulta de compromissos aceita períodos de até 45 dias com interseção do intervalo, incluindo histórico; limita a leitura a 1.000 registros e informa quando o período precisa ser reduzido. Sem período, a leitura anterior permanece disponível para os demais consumidores.

No agendamento público do item, o lead escolhe a data em calendário mensal clicável e vê somente os horários disponíveis daquele dia, no fuso da empresa. Datas passadas e além da janela pública ficam desabilitadas; dia sem vagas e agenda indisponível mantêm aviso/contato. A consulta diária usa o mesmo cálculo de disponibilidade, capacidade e bloqueios, com até 100 horários, suficiente para a grade de 15 minutos de um dia; a consulta de sugestões dos demais fluxos mantém 12 opções. A referência visual é Google Agenda, sem sincronização Google, recorrência ou arrastar reservas. Nenhuma agenda ativada, reserva, mensagem ou cobrança real realizada; sem migration.

Validação: 37 testes direcionados em seis arquivos passaram. Na suíte geral, 1.538 testes passaram e dois falharam por comparações sensíveis a CRLF em arquivos fora da alteração (guia da API de IA e fonte do atendimento). Confirmada equivalência após normalizar quebras de linha; normalização apenas local, sem diff desses arquivos, e nova rodada com esses dois arquivos e calendário passou os 19 testes. TypeScript aprovado; ESLint sem erros, com seis avisos preexistentes de parâmetros não usados no teste público de agendamento. Navegador local confirmou o redirecionamento sem sessão para o login da nova rota. Prévia com componentes reais e dados fictícios conferida em 1440 e 390 px: menu ativo desktop/móvel, mudança de período/modo, detalhes, troca de empresa sem vazamento visual, agenda desativada e seletor público sem horários/seleção antigos após trocar o dia. Sobreposição do título com o seletor no celular foi encontrada, corrigida e recapturada.

Estado: preparado em cópia isolada; **sem integração na master, push ou deploy** nesta etapa. A prévia não comprova novas reservas nem acesso de cliente autenticado em produção. Coordenar integração/publicação pela tarefa de origem para preservar a correção de pagamento e notas operacionais do checkout original. Capturas locais de dados fictícios ficam em `tmp/agenda-qa` nesta cópia (não versionadas).

## Verificado ou confirmado

- Aplicação/handlers permanecem na Vercel; Supabase e Inngest de produção foram migrados para VPS Contabo; R2 permanece. [Relatório Supabase](migracao-supabase-vps-2026-09-11.md), [relatório Inngest](migracao-inngest-vps-2026-09-11.md).
- Migração Supabase: snapshot com 181 tabelas, 421.808 registros, 25 usuários e 83 registros de migrations; contagens sem divergência antes de retomar escrita. Arquivos do snapshot conferidos. Esses números não são contagens atuais.
- Titular confirmou login de administrador e de cliente Buffalo Mace, e respostas dos agentes Gustavo e Kalum. Não confirma todos os papéis, agentes ou caminhos de autenticação.
- Acesso do painel Inngest: titular confirmou normal e anônimo após correção de autenticação no proxy. As chamadas de checkpoint foram ajustadas preservando autenticação.
- Auditoria das 43 funções registrada em [auditoria-automacoes-vps-2026-09-11.md](auditoria-automacoes-vps-2026-09-11.md), publicada no commit `0fbc215`. 33 com alguma execução observada e dez sem ocorrência na janela; vários resultados eram fila vazia. 200 testes selecionados passaram nessa auditoria.
- Ensaio de restauração em 11/09: dumps Supabase e Inngest do backup das 16:10 UTC restaurados com saída zero em bancos separados dos de produção; seis arquivos internos passaram em checksum. O ensaio utilizou os clusters existentes, não uma máquina vazia. Detalhes privados em `/opt/connectyhub/closure-audit`.
- Nova conferência: 16 assets da página de login sem URL do Supabase Cloud; consulta anônima não expôs carteiras. Varredura de 29 colunas textuais de URL/endpoint não encontrou origens Cloud antigas; não foi varredura universal de JSON/segredos.
- Inngest Cloud verificado no plano Hobby gratuito; titular decidiu mantê-lo sem uso por enquanto. O histórico antigo não foi importado, e retenção observada do Hobby é de um dia. Supabase Cloud foi preservado somente leitura; cancelamento da assinatura não foi confirmado.

## Pendências concretas

Reteste de 13/09 às 09h55, após checkout de cartão entregue, encontrou cortesia interpretada como confirmação e “nem paguei ainda” como evidência financeira, gerando pausa indevida. Correções locais tratam cortesia sem comando, validade da prévia após entrega, resposta de dúvida pelo pedido salvo e negação/incerteza por trecho. Validação final com **2.512 testes em 188 arquivos** (148 novos), TypeScript, ESLint e revisão independente aprovada. Reparo operacional validado em cinco simulações PGlite. Publicação em andamento; revisão indevida persistida requer reparo operacional estritamente auditado, sem alterar pedidos ou pagamentos e sem aviso automático enganoso. Ainda não liberar reteste. [Causas, escopo e limites](cortesia-negacao-pagamento-2026-09-13.md).

Reteste de 13/09 às 09h17 reprovou a retomada após `17f17c6`: a revisão antiga continuava com produto não identificado, mas follow-up e resumo verbal afirmavam inclusão/total pronto. Correção recupera respostas explícitas já recebidas dentro do escopo e limite de histórico, produz nova prévia e exige outro aceite; bloqueia resumo da IA enquanto há pendência e follow-up de silêncio/recuperação sobre revisão não aplicada. Foram adicionados 68 cenários; rodada dirigida com **112 testes** e suíte completa com **2.364 testes em 183 arquivos** passaram, revisão independente, TypeScript e ESLint aprovados. Sem SQL novo ou alteração manual de dados. **Publicado às 09:36:43 BRT:** master `de5165771f3adef1dd57d6e89787819182a3dd64`, Vercel `dpl_F5YMhvcFCXFkursEr7BxDkx9UoXk` Ready / Latest / Production, domínio principal associado. Inicial/login HTTP 200, Inngest autenticado com 43 funções, checkout inexistente HTTP 404 esperado. Reteste liberado na conversa existente; atendimento real ainda precisa ser observado. Nota pós-publicação mantida local para evitar outro build documental. [Causas, evidência e limites](retomada-revisao-pendente-2026-09-13.md).

Reteste de 13/09 encontrou loop após oferta explícita de adicionar uma unidade: “sim coloca” perdia o contexto, preço copiado virava lista e “unidade de” podia permanecer no nome do produto. Correção liga o aceite à oferta recente, preserva esclarecimentos e calcula a nova prévia antes de outro aceite; impede escolhas por categoria/token isolado e exige versão quando ambígua. **2.296 testes em 180 arquivos**, TypeScript, ESLint, diff-check e revisão independente aprovados. Inclui citações, perguntas posteriores, reenvio e produto removido do catálogo. Não exige SQL novo. **Publicado em 13/09 às 05:41:25 BRT:** master `17f17c61595c9552fc08772a89bfe7078ce7f65b`, Vercel `dpl_7GSA2mFLLBi97CEuqjRHiZCumESz` Ready / Latest / Production, domínio principal associado. Inicial/login HTTP 200, Inngest autenticado com 43 funções, checkout inexistente HTTP 404 esperado. Reteste liberado na mesma conversa; resultado real ainda pendente. Nota pós-publicação mantida local para evitar novo build documental. [Evidência, correções e limites](aceite-oferta-carrinho-2026-09-13.md).

Novo reteste da Luna em 12/09, posterior à recuperação de Pix: corrigidas perda da intenção composta durante esclarecimento, prévia verbal divergente dos itens gravados, escolha de cartão não preservada ao recuperar o carrinho e evento de exclusão capaz de restaurar localmente uma sessão como pendente. **2.225 testes em 178 arquivos**, TypeScript, ESLint e revisão independente aprovados; após ajustes finais de tipagem, 236 testes afetados passaram novamente. Inclui roupas/eletrônicos em sete estados e proteção de consentimento, concorrência e evidência financeira. Não exige SQL novo. **Publicado às 23h12 BRT:** master `ccca7c18160ca26731e665762b702da993a01098`, Vercel `dpl_4CSsGRDpCVSTj6ayeJGWXrbTWh7w` Ready / Latest / Production. Inicial/login HTTP 200; Inngest autenticado com 43 funções; checkout inexistente HTTP 404 esperado. Reteste liberado para Luna/Gustavo nas mesmas conversas; comportamento real ainda depende do reteste. Os fluxos específicos por profissão e o cenário de pizzaria ficam para depois. Nota pós-publicação mantida local para evitar novo build documental. [Escopo, evidência, matriz de validação e limites](continuidade-carrinho-pagamento-2026-09-12.md).

Recuperação cartão → Pix em 12/09: o reteste da Luna encontrou falha cadastral anterior à cobrança, criação indevida de outro pedido e bloqueio de gateway mantido após erro corrigível. Correção compartilhada implementada para continuar no pedido ativo, solicitar apenas o dado rejeitado e preservar proteções contra cobrança incerta/concorrente. **2.101 testes em 175 arquivos**, TypeScript e ESLint aprovados. Migration `0133_sales_catalog_payment_recovery` aplicada transacionalmente no Supabase da VPS, com dados de clientes/pedidos/pagamentos e guardas não relacionados preservados; RPC restrito ao serviço e RLS habilitado nas tabelas temporárias de conferência. **Publicado às 21h18 BRT:** master `f4fcfaaa45d763c697e4d1549157c69ff8ec6da0`, Vercel `dpl_BsSwbNyXF9yuSqdp2YbxQE4Ueca4` Ready / Latest / Production. Inicial e login HTTP 200; Inngest autenticado, 43 funções; checkout inexistente HTTP 404 esperado. Preservados os atendimentos e pedidos reais; validação real no WhatsApp permanece pendente. Nota pós-publicação mantida local para evitar novo build exclusivamente documental. [Evidência e validação da recuperação](recuperacao-cartao-pix-2026-09-12.md).

Complemento do reteste de vendas em 12/09: correções implementadas e aprovadas em **1.942 testes / 171 arquivos**, TypeScript e ESLint. Preservam endereço/itens/opções, isolam contexto por conversa, cotam carrinho completo, reconhecem resumo em prosa e confirmação em mensagens separadas e dão pendência concreta quando o checkout não é executado. Tratamento de resposta incompleta registra motivo de término; sem repetição paga automática. Não exige nova SQL. **Publicado às 19h18 BRT:** commit `43740da` na master; Vercel `dpl_26d275stX3KLQfPhFciFeDp5p4Bj` Ready / Latest / Production no domínio principal. Inicial e login HTTP 200, Inngest autenticado com 43 funções, checkout inexistente HTTP 404 esperado. Nenhum envio WhatsApp ou efeito financeiro real de teste. Reteste do titular liberado na mesma conversa, sem reset; confirmação do atendimento real ainda pendente. Registro posterior mantido local para evitar deploy apenas documental.

Reteste posterior à publicação de 18h04 em 12/09 **reprovou o atendimento real** de Gustavo e Luna. Confirmados falso reconhecimento de alteração, endereço perdido somente na proposta, divergência entre rascunho e pedido original, resumo em prosa não reconhecido na confirmação e resposta reduzida a cumprimento. Duas respostas já estavam incompletas antes do envio; uso praticamente igual ao limite sugere esgotamento do orçamento de geração, sem motivo de término registrado na versão anterior. A regra de frete grátis a partir de R$ 800 estava corretamente salva; caminhos de contexto/cotação ainda usavam item isolado. Esse reteste motivou a segunda correção publicada acima, sem novos envios ou cobranças pela investigação. Não considerar o fluxo resolvido em produção pela publicação anterior. [Evidência, correção e limites do reteste](reteste-retomada-vendas-2026-09-12.md).

Correção local em 12/09 — alterações após checkout: autorizado pelo titular após os prints do reteste, o fluxo compartilhado ganhou revisão explícita de itens/quantidades/entrega, preservação do pedido e aceite vinculado à prévia completa. Nova compra e histórico de pedido pago deixam de alimentar o carrinho anterior. A migration `0132_sales_catalog_order_revisions.sql` implementa aplicação transacional, proteção contra pagamento concorrente e repetição sem nova revisão/cobrança. Integrada à versão atual da agenda; validação final de 1.840 testes em 169 arquivos, com um timeout preexistente aprovado na repetição isolada. TypeScript e ESLint aprovados. Publicação autorizada pelo titular: migration0132 aplicada transacionalmente no Supabase da VPS, registrada uma vez e verificada por hashes, gatilhos, índice e ACL/RLS. Pedidos, itens e pagamentos existentes integralmente preservados, sem execução de revisão ou cobrança. **Publicado em produção:** master b99024c, Vercel dpl_85E11Du5v36SA32C37qUw5hQ1FwJ Ready/Latest/Production às 18h04 BRT. Página inicial e login HTTP200; Inngest autenticado com43 funções; checkout inexistente404 esperado. Nenhum envio WhatsApp real de teste. Reteste do atendimento liberado para o titular; alteração e pagamento reais ainda não foram observados. Registro posterior mantido local para evitar deploy exclusivamente documental. Escopo, evidências e limites em [diagnóstico e correção de alteração do pedido](diagnostico-alteracao-pedido-2026-09-12.md).

Publicação concluída em 11/09 às 20:43 BRT: commit `1267cd4` enviado à master, implantação `dpl_CfFgF8BCsHGryfbsiLnNnKLdbtqh` Ready na Vercel e vinculada aos domínios principal/com www. Build confirmou o mesmo commit. Conferência pública do imóvel Ipiranga: página e consulta de agenda HTTP 200, zero controles de compra, diálogo responsivo em computador/celular e `contactRequired: true`, zero horários. A organização ainda não tem recurso de serviço habilitado/vinculado; o titular informou que configurará pelo painel. A atividade salva do agente/perfil do item foi consultada e está como `advogado`, portanto o botão observado é “Agendar reunião”; a tarefa não alterou essa seleção. Para testar atendimento imobiliário, revisar a atividade e a agenda no painel. Nenhuma reserva, mensagem ou cobrança real disparada. Registro posterior à implantação mantido local para evitar novo deploy exclusivamente documental.

Publicação do plano autorizada pelo titular em 11/09 após a validação final. Migration `0130_catalog_item_appointments` aplicada transacionalmente no PostgreSQL 17.6 da VPS pelo acesso administrativo existente do Supabase; registrada em `supabase_migrations.schema_migrations` e recarga de schema solicitada. Cópia privada dos 82 itens anteriores preservada em `connectyhub_release_backup.catalog_items_before_0130`, sem acesso de anon/authenticated. Resultado: 13 destinos herdados alterados para agendamento, 67 itens de checkout e dois de site externo preservados; nenhuma prévia de importação pendente no instante da atualização. Não houve criação de pedido, pagamento ou reserva. Envio do aplicativo e verificação da Vercel em andamento; o registro local anterior abaixo é histórico.

Atualização local posterior em 11/09 — plano de atendimento por atividade: implementação integrada de perfil profissional/empresa, registros informados, ação por item (venda/agenda/site externo), agenda pública compartilhada com WhatsApp/painel, bloqueios de checkout incompatível, valores por extenso no TTS e retomada do checkout existente com dois botões distintos. A restrição absoluta por atividade descrita no registro histórico abaixo foi refinada para permitir catálogo misto por escolha explícita do item. Validação final: **1.387 testes em 153 arquivos**, TypeScript, ESLint e conferência visual desktop/celular passaram. **Nada deste conjunto foi publicado ou migrado na VPS.** A migration `0130_catalog_item_appointments.sql` é necessária antes do deploy e foi testada apenas localmente. Não enviar mensagens nem criar reservas reais para validar sem escopo de teste acordado. Detalhes, limites e sequência em [plano de atendimento por atividade](plano-atendimento-por-atividade-2026-09-11.md).

Correção local em 11/09 do fechamento por atividade, após o print em que informar orçamento de até um milhão produziu uma prévia de pedido de imóvel: `corretor_imoveis`, `imobiliaria` e `revenda_veiculos` agora usam política consultiva no runtime, inclusive com prompt manual e produtos marcados como checkout. O catálogo deixa de fornecer roteiro de varejo nesses agentes; criação, recuperação e envio de pagamento recebem bloqueios antes dos efeitos externos. Respostas de orçamento deixam de ser intenção de compra também no varejo; texto de fechamento indevido recebe resposta consultiva. Fotos e links de detalhes permanecem disponíveis. A regra não altera a loja pública nem apaga pedidos anteriores; nenhum teste enviou mensagens reais ou gerou cobrança. Sem migration SQL e ainda sem publicação desta etapa. Validação final: 1.334 testes aprovados em 150 arquivos, incluindo 19 casos novos de atividade/orçamento, além de TypeScript, ESLint dos arquivos alterados e `git diff --check`. Esses resultados são locais, com I/O simulado; próximo passo é publicar e validar o atendimento real.

Atualização posterior em 11/09: o titular autorizou publicar o conjunto acumulado de follow-up/encerramento, simplificação dos painéis, qualificação por atividade e leitor do catálogo WhatsApp. As menções abaixo à suspensão registram a etapa anterior; envio e implantação deste conjunto estão em andamento. O lote incorreto do teste da Renata já não aparece no painel: zero sincronizações recentes e nenhum produto publicado. A nova sincronização deve ocorrer após a implantação corrigida.

Validação consolidada antes do envio: 1.293 testes aprovados em 146 arquivos. TypeScript e ESLint dos arquivos alterados passaram nas verificações direcionadas. Nenhuma migration SQL necessária para este conjunto.

Envio confirmado à master em `aece285` (`fix: align agent qualification, follow-ups and WhatsApp catalog imports`), com 18 arquivos do conjunto autorizado. Vercel confirmou Ready no domínio principal em 11/09 às 17:01 de Brasília. Reteste pela loja às 17:02 terminou com 13 imóveis em duas páginas, 13 imagens principais detectadas e preços corrigidos (Ipiranga R$ 850.000,00; Rita Vieira R$ 220.000,00). Os 13 itens permanecem em rascunho para categoria/revisão; imagens detectadas ainda pendentes de ingestão definitiva, nenhum produto publicado. Registro posterior ao push mantido local para não iniciar outro deploy apenas documental.

Correção em 11/09 da personalidade por atividade: o painel e os salvamentos de cliente/admin passaram a aplicar o perfil mesmo com prompt técnico manual. Na abertura de agente legado, campos vazios recebem padrões da atividade no rascunho editável; textos personalizados, perfis importados do histórico e desativações identificáveis são preservados. O preenchimento não escreve no banco até salvar. Passaram 206 testes direcionados, TypeScript e ESLint; não requer migration SQL. Enviada à master em `9506984`; o titular confirmou a implantação. A verificação funcional completa do agente Renata em produção não foi refeita nesta tarefa. A configuração local do Supabase foi conferida e aponta para o domínio próprio da VPS; não houve alteração de destinos ou credenciais.

Correção de follow-up e encerramento em 11/09: validação da resposta final da IA antes do envio, personalidade do agente na retomada e reconhecimento compartilhado de despedidas no atendimento individual WhatsApp e no abandono de conversa. Bloqueia cortesia repetida e agendamentos de abandono após despedida, inclusive do próprio agente; nova necessidade retoma atendimento. Não altera recuperação de pedido nem requer SQL. Passaram 1.245 testes em 145 arquivos, TypeScript e ESLint. Evidência, escopo e limites em [correcao-followup-encerramento-2026-09-11.md](correcao-followup-encerramento-2026-09-11.md). Publicação suspensa por pedido explícito do titular para agrupar mudanças; nenhum reenvio real executado.

Simplificação local do painel em 11/09: a aba Conhecimento foi removida nos agentes cliente/admin, e a lista/anexo de arquivos passou para Prompt → Informações extras do seu negócio, junto do complemento em texto. Permite texto, arquivo ou ambos; mantém endpoints, arquivos existentes e preservação do rascunho ao anexar. O aviso de redirecionamento de follow-up em Comportamento do cliente também foi removido, sem criar outro atalho no lugar. Não requer SQL. Publicação permanece suspensa pelo titular.

Qualificação por atividade em 11/09: ao abrir o agente, perguntas genéricas intactas recebem no rascunho o perfil da profissão/empresa selecionada, mesmo que o padrão genérico já tenha data de salvamento. A mesma regra compartilhada vale na troca de atividade e na aplicação do perfil, inclusive com prompt manual. Perguntas, objetivo, pesos, desativações e demais ajustes que diferem do padrão são preservados. As atividades cadastradas já fornecem perguntas e encaminhamento específicos; foram conferidas as perguntas no texto de atendimento e o vínculo de campos/pesos na análise do CRM. Passaram 130 testes direcionados, TypeScript e ESLint. O rascunho precisa ser salvo para aplicar ao atendimento; nenhuma alteração direta em agentes de produção ou migration. Tudo ainda local por orientação do titular.

| Item | Estado e próximo critério |
|---|---|
| Backup fora da VPS | Arquivo cifrado transferido ao computador do titular; transferência da chave/manifesto não concluída e decifragem local ainda não validada. Não declarar cópia externa recuperável antes dessa verificação. |
| Auto Backup Contabo | Habilitado; painel consultado não tinha cópia disponível, primeira prevista para 12/09 às 02h de Brasília. Confirmar conclusão, não apenas habilitação. |
| Recuperação de senha | Fluxo usado antes da migração é WhatsApp; titular ainda não confirmou teste completo. SMTP Resend autenticou, mas entrega de e-mail não foi testada; e-mail era etapa futura, não funcionalidade anterior comprovada. |
| Histórico de conversa WhatsApp | Caso real rejeitado pelo provedor por terminar em turno do modelo; nenhuma correção de código aplicada até este registro. Inngest marcou Completed porque o handler retornou falha como objeto. |
| Relatório diário administrativo | Função agenda/retorna ready, sem compilar nem entregar relatório de negócio. |
| Novas modalidades IA | Adaptadores, tarifas e documentação foram ampliados, mas nem todas as famílias passaram por geração real com cobrança/recuperação conferidas. |
| Serviço Live/WebSocket | Código existe; publicação e configuração operacional precisam ser conferidas. Não afirmar ativo apenas pelo endpoint/documentação. |
| Agendamentos e webhooks IA | Registrados na VPS; auditoria observou varreduras sem execução de IA/entrega elegível na janela. Falta cenário funcional controlado. |
| Isolamento e acesso | Conferência de produção/anon parcial. Inspeção atual no navegador está em acesso administrativo ao painel de cliente, não substitui teste de usuário comum. |
| Catálogo UAZAPI | Correção publicada em `aece285`: reteste real na loja carregou 13 imóveis em duas páginas, 13 imagens principais detectadas e preços corrigidos. Lote antigo incorreto removido; lote novo permanece para categoria/revisão. Ingestão definitiva de mídia e publicação na loja pública não executadas. [Evidências do reteste](reteste-catalogo-uazapi-2026-09-11.md). |
| Preview e desenvolvimento | Origens Inngest na Vercel foram vistas como Production-only; comportamento fora de produção ainda não foi auditado por completo. |

Print posterior da qualificação confirmou as quatro perguntas genéricas com objeção marcada como obrigatória. A regra local passou a preservar essa opção sem tratá-la como edição do texto inteiro do playbook. Teste reproduz o preenchimento por profissão e nova troca de atividade mantendo a obrigatoriedade; perguntas efetivamente reescritas continuam preservadas. A suíte direcionada passou a 131 testes aprovados.

No Catálogo de Vendas → Configuração, o bloco informativo “Automações do checkout” foi removido por solicitação do titular, incluindo aviso e botão de redirecionamento. Era apenas navegação para Automações; nenhuma configuração ou rotina de envio foi alterada. Checagem ESLint concluída. A mudança segue local, junto das demais alterações ainda não publicadas.

## Galeria do catálogo WhatsApp — ampliação local em 11/09

Após a publicação do leitor corrigido, o titular solicitou aproveitar todas as fotos retornadas pela API, mostrar miniaturas na revisão e permitir escolher a capa. Implementado localmente: a lista segue do provedor ao rascunho e aos metadados existentes, com preservação da ordem/capa ao salvar e publicar; sem migration SQL. A revisão usa prévias das URLs de origem. Na confirmação, cada imagem é copiada para o R2 e vinculada ao produto, com verificação e registro de bytes/arquivo na organização importadora. O produto publicado usa as cópias no R2.

A confirmação pela interface processa produtos com galeria um por requisição, mantendo os totais do lote. URLs repetidas são eliminadas. Falha de imagem mantém as cópias que deram certo e apresenta quantidade/erro no lote; falta de cota interrompe as demais fotos do produto. Não há repetição automática de geração paga nem envio real de mensagens.

Validação: 62 testes do catálogo em nove arquivos, TypeScript e ESLint aprovados; teste visual local em navegador de miniaturas, troca de capa, prévia indisponível e largura de celular. Testes de armazenamento/provedor usam fronteiras simuladas e não comprovam upload real dessa galeria. A versão da galeria ainda não foi enviada/publicada; nenhum produto de cliente foi publicado nesta etapa. Após implantação, refazer a sincronização dos lotes antigos que só guardaram a foto principal e validar a importação final no R2 antes de declarar o percurso observado em produção.

Publicação autorizada e concluída em seguida: commit `bd4da7c` enviado à master; Vercel confirmou Ready no domínio principal em 11/09 às 17:29:56 de Brasília (build 1m12s). Nenhuma migration. A galeria está publicada; a sincronização anterior de 13 imóveis continua sendo evidência da versão anterior, que guardava somente a capa. Nova sincronização e upload definitivo da galeria no R2 ainda precisam ser observados em produção. Este registro posterior ao push permanece local para evitar outra implantação apenas documental.

Ajustes posteriores do acompanhamento da sincronização, ainda locais: botão primário “Revisar produtos” substitui o indicador inerte quando existem itens para revisão; fecha o acompanhamento e direciona/foca o lote na aba Produtos. A lista não usa mais limite interno de 460px; usa a altura do modal com uma rolagem e cabeçalho fixo. O contador dessa janela soma todas as fotos das galerias e cada linha apresenta a capa. TypeScript/ESLint aprovados e conferência em navegador com 13 itens/39 imagens fictícias, ação do botão e tamanhos desktop/celular. Não houve nova publicação nem alteração de produtos de produção nesta etapa.

Campo de URL na revisão, ajuste local posterior solicitado ao encerrar a chamada: agora aparece somente para destino Site externo, com rótulo explícito. Checkout não exige URL; alternar o destino preserva o link recebido/editado. O leitor existente já importa `Url`/`URL`/`url` do produto WhatsApp; novos testes conferiram as variantes e a persistência do link no rascunho, sem trocar automaticamente o destino Checkout. Links só podem ser preenchidos automaticamente quando retornados pelo provedor; não se inventa uma página externa para produtos sem link. 65 testes do catálogo aprovados e teste de interação no navegador confirmou visibilidade e preservação ao alternar. O ajuste permanece local com as correções do modal, sem publicar nem alterar produtos de produção.

Complemento local da importação para Site externo: a escolha do destino não desativa mais as imagens. A confirmação usa o mesmo importador de galeria do checkout, copia cada foto para o R2 e registra bytes/arquivo na organização importadora. A escolha explícita de não trazer imagens é preservada ao alternar os destinos. Produto externo sem fotos mantém apenas seu link, sem buscar/scrapear o site. Testes do percurso provedor → revisão → publicação simulada conferiram galeria, botão externo, vínculo e contabilização por empresa; o atendimento simulado confirmou envio da foto armazenada com link externo e ausência de envio de mídia quando só há link, sem criar checkout interno. As instruções compartilhadas do agente agora explicitam esses dois casos. Teste de interface confirmou o controle de imagens disponível para Site externo e a preservação do opt-out. Sem migration ou novas operações de produção nesta etapa; a cópia definitiva em R2 continua sem observação real deste lote.

Validação consolidada desse complemento local em 11/09: **1.310 testes aprovados em 148 arquivos**, TypeScript sem erros, ESLint dos arquivos alterados aprovado e conferência de interface concluída. O conjunto reúne botão de revisão, aproveitamento do modal/contador de fotos, URL condicional e fotos para produtos externos. Pronto para uma publicação agrupada; ainda não enviado à master nem implantado nesta etapa. As fronteiras de WhatsApp, R2 e banco foram simuladas nos testes, sem mensagens reais ou alteração de produtos do cliente.

Publicação desse complemento autorizada pelo titular em seguida, em 11/09. Preparação de um único commit com os ajustes de revisão, URL e fotos externas e seus testes; envio à master e verificação da implantação em andamento. Nenhuma migration necessária.

Publicação concluída: commit `3c99e40` enviado à master, com os oito arquivos do conjunto. Vercel confirmou **Ready / Latest / Production**, vinculado ao domínio principal, em 11/09 às 18:08 de Brasília (build de 1 minuto). Implantação `6zxqFmK8E8gwrDY1ShrEcNiYpnKY`. Nenhum produto do cliente foi publicado ou mensagem real enviada nessa implantação. O registro posterior ao push fica local para não gerar outro deploy apenas documental.

## Padrão de ativação e pausa do agente — alteração local posterior

Em 11/09, o titular definiu pelos prints um comportamento inicial pronto: presença sempre online, marcar como lido, resposta espelho, rapport suave, citação inteligente, emojis, figurinhas, mídia proativa, conversa leve, aprendizado e avaliação ligados. Temporização inteligente e janela da IA ficam desligadas como nos prints, com tempos/horários editáveis. A personalidade e o conteúdo continuam específicos da atividade; a voz particular do exemplo não é copiada para outros clientes.

Implementado localmente um normalizador de preferências separado do comportamento efetivo em execução. Editor compartilhado, salvamento de cliente/admin, criação/edição/clonagem de agentes e mudanças de capacidades preservam as preferências, a voz e os números de responsáveis ao pausar. O normalizador usado no atendimento/webhook/follow-up continua desabilitando ações quando o agente está pausado. O padrão não habilita grupos ou campanhas. Usuários ativos com opções explicitamente salvas mantêm suas escolhas.

Registros antigos pausados com quatro proteções forçadas zeradas são reconhecidos como o antigo reset. O painel recupera os valores que coincidem com aquele reset, preservando campos marcados como personalizados e a voz. Não é possível reconstruir preferências anteriores que o código antigo já apagou sem deixar proveniência. A versão das preferências impede reaplicar a recuperação; a leitura não escreve no banco até salvar. Sem migration, mudanças ainda não publicadas. Testes direcionados: 142 aprovados. Suíte completa: 1.314 aprovados e um timeout de 5 segundos no teste SQL de opt-out, que passou isoladamente em seguida, sem alteração do teste ou do SQL. TypeScript e ESLint dos arquivos alterados aprovados. Nenhuma configuração do agente Renata foi salva por esta tarefa, nenhum envio ou aprendizado pago foi executado.

Publicação do padrão de ativação autorizada pelo titular em seguida, em 11/09. O conjunto está sendo enviado à master e terá sua implantação verificada na Vercel, sem migration ou alteração direta das preferências dos clientes.

Publicação do padrão de ativação concluída: commit `59a5a0d` enviado à master com onze arquivos. Vercel confirmou Ready / Latest / Production no domínio principal em 11/09 às 18:35:24 de Brasília, build de 58 segundos, implantação `E7aAxpMmJgyKY11MURWKBzE2SPML`. Nenhuma migration ou escrita direta nas preferências de Renata realizada. A preservação e a recuperação permanecem verificadas por testes locais; o ciclo de pausa/salvamento/reativação de um agente real não foi executado nesta publicação. Registro pós-push mantido local para evitar deploy exclusivamente documental.

## Auditoria geral em curso

Solicitada conferência dos painéis dos clientes, agentes, agenda/follow-up, API IA/LLM, cobrança por crédito e dependências Supabase/Inngest. Revisão inicial leu os commits `917410c` e `586ce3c` e confirmou reserva/liquidação no código. Suíte completa executada em 11/09 com `npm test -- --maxWorkers=2`: **1.172 testes aprovados em 143 arquivos**, duração aproximada de 98 segundos. São testes locais, com fronteiras externas simuladas; não comprovam geração paga, todos os fluxos publicados ou entrega externa. Uma revisão não está encerrada pela existência deste arquivo.

Próxima atualização deve separar resultados de código, testes simulados, configuração publicada e operação real por módulo, com falhas acionáveis. Evitar novas cobranças/envios reais sem cenário e destinatário apropriados ao teste.

## Decisões mantidas

Diretriz de orçamento do titular em 11/09: não aumentar custos antes de começar a vender. Manter Observability Plus por enquanto e reduzir frequência de deploys, priorizando validação local e publicação de conjuntos de mudanças necessários. Não contratar serviços nem ativar extras pagos por iniciativa própria. Isso não constitui autorização para pausar atendimento ou desativar serviços existentes. Consumo variável pode continuar crescendo; não prometer teto sem controle configurado e validado.

Referência financeira informada/observada: UAZAPI R$ 138/mês (valor corrigido pelo titular), Contabo US$ 28,70/mês com backup/região e Vercel Pro US$ 20/mês mais consumo excedente. Aproximadamente R$ 400 é estimativa cambial, não custo total garantido: IA, conversão do cartão e assinaturas antigas ainda ativas são adicionais. Na consulta do ciclo Vercel 22/08–22/09, excedente perto de US$ 1,81; alerta de US$ 200 adicionais e pausa automática desativada. Nenhuma configuração de cobrança foi alterada.

Não migrar a hospedagem da Vercel nesta etapa. Não excluir projetos Cloud como consequência implícita da auditoria. Multi-projetos, dashboard operacional central e possível n8n ficam para etapa futura. Nenhuma credencial pertence a este arquivo.

Depois da migração, novas escritas só existem na VPS. Retorno ao Cloud exige reconciliar essas escritas; reverter URLs ou remover modo somente leitura não é um rollback completo.

## Compactação do painel de agentes — 11/09

Por solicitação do titular, a barra de identidade agora reúne agente, empresa, plano, produtos no contexto, conhecimento e atuação. Última edição permanece disponível na dica do plano. O quadro explicativo da atividade foi substituído pelos campos de registro e UF, alinhados com o seletor no computador. A explicação foi movida para a ajuda da atividade. A busca agora abre dentro do seletor, com grupos, filtro sem acentos, escolha por teclado e fechamento por Escape. A disposição se adapta ao celular.

O nome profissional duplicado foi removido do formulário: para atividade profissional, o editor usa o nome do agente na configuração enviada ao salvar e no prompt automático, preservando registro, UF e escolha de exibição pública. O nome de apresentação da empresa permanece independente para atividades empresariais. Não há migration nem escrita direta nos agentes de produção.

Validação local: 147 testes existentes de atividade/atendimento, TypeScript e ESLint aprovados. Conferência em navegador dos componentes reais confirmou alinhamento desktop, ausência de rolagem horizontal no celular, pesquisa sem acentos, escolha por teclado, vazio de busca e Escape com retorno de foco. Publicação autorizada; envio e implantação ainda em andamento.

Compactação publicada em 11/09 às 21:13 BRT: commit `08654f0` enviado à master; Vercel Ready, implantação `dpl_7MZqWjYkgHHVuWH3crpVjXXQPiRQ`, vinculada a www.connectyhub.com.br e connectyhub.com.br. Sem migration ou salvamento de configuração de cliente. O titular fará o teste no painel publicado; as verificações de interface acima foram locais. Registro posterior mantido local para evitar deploy só documental.

## Retorno de galeria para itens agendáveis — correção local em 11/09

Print posterior à publicação mostrou a Renata anunciando página da galeria, enviando apenas capa e deixando a expressão “Importado do WhatsApp” na resposta. Causa confirmada no código: o envio do botão de detalhes aceitava somente destino checkout, excluindo appointment; a limpeza existente tratava tags técnicas, mas não essa expressão em texto comum.

Ajustado localmente: itens ativos de agendamento também geram o botão “Ver detalhes e fotos”, com URL rastreável da página do próprio item; preço não é requisito para apresentar um serviço agendável. Fotos e tags desses itens seguem a mesma elegibilidade de detalhes. A limpeza remove a expressão interna, inclusive entre parênteses, antes da entrega e persistência da resposta. Não foi ampliado o envio para todas as fotos pelo WhatsApp: envia-se a capa e o acesso à página com galeria/agenda, conforme solicitado. Catálogo vazio e rascunho não geram botão nem mídia.

Validação: 50 testes dos fluxos de atividade e catálogo, TypeScript e ESLint aprovados. Regressões executam o envio real do runtime com provedor e banco simulados, cobrindo botão, capa, remoção do texto interno, ausência de pedido, serviço sem preço, catálogo vazio e item rascunho. Sem envio real, sem migration e ainda sem publicação deste complemento.

Complemento da mesma correção local: conversa recente da Renata lida no WhatsApp confirmou a oferta de consultar horários “com o corretor responsável”, apesar da atividade individual. O perfil compartilhado das profissões foi reforçado para atendimento direto, em primeira pessoa nas ações executáveis pelo canal, sem repassar a rotina a um terceiro genérico. A orientação também é aplicada ao final do contexto do runtime, inclusive com prompt manual/histórico antigo; identidade humana, credencial própria e presença física não são atribuídas ao software. Os textos padrão de objetivo, vocabulário e fechamento do corretor foram alinhados. Empresas mantêm sua representação de recepção; intervenção humana real continua explícita. 177 testes direcionados passaram, incluindo armazenamento dos perfis e separação empresa/profissão. O comportamento de uma nova resposta gerada pela IA ainda requer reteste real após publicação. Complemento ainda local.

Publicação deste complemento concluída em 11/09/2026, às 21h27 BRT: commit `8c6df82` enviado à master, implantação Vercel `dpl_3VsEKfNNnHVWejbs94x7HHHFmd9n` em Ready com os aliases `www.connectyhub.com.br` e `connectyhub.com.br`. O log confirmou o mesmo commit e build concluído. Sem migration adicional. Validação pré-publicação: 177 testes, TypeScript e ESLint aprovados. O envio real do botão e a nova resposta do agente após a implantação ainda dependem do reteste do usuário; não foram enviadas mensagens de teste. Registro pós-implantação mantido localmente para o próximo conjunto, sem disparar nova publicação apenas documental.

## Identificação do lead compartilhada — 11/09, posterior à galeria

O titular relatou seu CRM com o nome da agente. Código confirmou duas entradas permissivas: memória podia promover nome inferido de qualquer trecho da conversa e o leitor de resposta estruturada aceitava texto curto sem contexto de identificação. A origem exata do registro de produção não foi auditada nesta etapa.

Correção comum, sem filtro por profissão: apresentação explícita e resposta direta à pergunta de nome são capturadas antes do atendimento, mesmo sem catálogo ou memória habilitada. Memória não promove o nome proposto pela IA sem evidência de fala do lead. Nome legado proveniente da memória sem evidência deixa de ser identidade confirmada; coincidência com o nome do agente sem confirmação recebe marca de reconfirmação. Valores antigos não são apagados em massa e homônimos confirmados são preservados. A resposta válida atualiza nome e evidência no CRM; o fluxo preserva atualizações mais recentes de cobrança.

Pergunta no início sem insistência; em compra/reserva, coleta quando necessária. No encerramento sem conversão, oferece uma última pergunta se o nome continuar desconhecido, respeitando recusa e evitando novo envio em cortesias posteriores. Empresa no nome do WhatsApp continua motivando pergunta sobre a pessoa. Agenda WhatsApp não executa nova reserva sem nome resolvido; conserva a oferta para continuação, sujeita à validade/disponibilidade, sem afirmar reserva antes da gravação.

Validação local: 174 testes distintos dos oito arquivos de identificação, agenda, memória, cobrança, histórico, encerramento e catálogo passaram (172 na rodada conjunta e duas regressões adicionais de coincidência de nomes na rodada final de identificação, com 23 testes). TypeScript e ESLint aprovados; publicação autorizada. Sem migration, sem envio de mensagens ou reservas reais, sem limpeza direta do CRM de produção. Comportamento de nova resposta da IA e correção do nome ao responder ainda dependem de reteste em produção.

Identificação publicada em 11/09/2026, às 21h45 BRT: commit `8e6485d`, Vercel `dpl_8ZmV9WsBnZvDBumCZaPAJhowiLfq` Ready. Inspeção do próprio domínio `www.connectyhub.com.br` confirmou esta implantação e ambos os aliases públicos; log de build confirmou o mesmo commit. Sem migration. O reteste real da conversa e da atualização do nome no CRM continua pendente; não foram enviados testes de WhatsApp. Registro pós-publicação mantido localmente para o próximo conjunto documental.

## Agente da loja vinculado ao comportamento — 11/09/2026

Implementação compartilhada: Comportamento do agente passa a oferecer apenas “Atender na loja e nos produtos” e modo Observador/Assistente/Vendedor ativo. O bloco duplicado com playbook e superfícies foi retirado da configuração do catálogo. A preferência antiga de ativação/modo é apresentada no primeiro acesso e preservada até o usuário salvar a configuração do agente; não há migration. Pausa do agente desliga o atendimento efetivo sem perder as preferências.

O runtime deriva a atividade do agente, preserva profissão versus empresa e usa o vínculo explícito da conversa, depois o agente atribuído ao produto, o padrão da empresa e um atendente elegível. Controladores globais internos e registros arquivados não podem assumir a identidade pública. Preferências explicitamente desabilitadas são respeitadas. Sessões antigas não restauram nome de visitante rejeitado pelo cadastro atual; coincidência com nome do agente exige evidência de apresentação do lead. Mensagens de outro atendente ficam preservadas no banco, mas não são reapresentadas como mensagens do agente atual. Ações rápidas, abertura e resposta de contingência de agendamento deixam de sugerir revisão de pedido; itens de venda continuam podendo usar checkout no mesmo catálogo.

A consulta administrativa de leitura confirmou um controlador interno anterior à Renata com persona Rafael Nunes; o fallback antigo pelo primeiro registro explicava a identidade pública incorreta. No navegador de auditoria, o dock apareceu após carregamento na loja e no imóvel. A ausência no navegador do usuário ainda não teve uma causa específica comprovada; foi adicionada repetição limitada para falhas transitórias de rede/servidor, preservando a opção de privacidade de rastreamento.

Validação pré-envio: 233 testes em oito arquivos, TypeScript e ESLint aprovados. Prévia isolada com o componente real validou layout em 1440 e 390 pixels, alternância da ativação/modo e recuperação do dock após HTTP 503 tanto na loja quanto no produto. Sem mensagens, cobranças ou agendamentos reais. Envio ao GitHub autorizado pelo usuário após os testes; implantação e reteste de identidade pública ainda pendentes neste registro.

Publicação concluída em 11/09 às 22:25 BRT: commit `2abf355`, implantação Vercel `dpl_8wTSfABdQTPbkuQuBnhW1QqT6U37` Ready, vinculada ao domínio principal e ao alias sem www. A loja pública passou a exibir Renata Macedo. Na página do imóvel, a verificação posterior encontrou cancelamentos repetidos da consulta de sessão: o rótulo de rastreamento alternava entre plataforma e organização, sem mudança do agente, lead ou produto. Uma resposta efetivamente concluída trouxe a Renata habilitada, mas as reinicializações impediam a presença estável na página.

Correção complementar local: a assinatura usada pelo dock trata essa variação de rótulo como a mesma sessão quando há organização. Mudanças reais de organização, agente, lead, produto, vínculo ou token continuam provocando nova consulta; o contexto global de rastreamento, a autorização do servidor e a opção de privacidade não são alterados. Trinta alternâncias simuladas de escopo com resposta atrasada mantiveram o botão visível, com uma única consulta em cada superfície (loja e produto). 38 testes direcionados, TypeScript e ESLint aprovados. Publicação e reteste público deste complemento pendentes neste registro.

O titular explicitou o propósito do agente onipresente: continuidade nos dois sentidos entre WhatsApp, loja e produto, com falas no arquivo do mesmo lead e contexto dos itens visitados. Relatou que Gustavo já se comporta assim. A auditoria de código confirmou gravação das falas da loja e leitura pelo CRM/WhatsApp; isso não equivale a um teste real de ida e volta da Renata. A memória estruturada e a associação da identidade estão em conferência; nenhuma mensagem real foi enviada para validar essa continuidade.

Complemento publicado às 22:44 BRT: commit `bfd4274`, implantação `dpl_FkAjWntw85T5BWG2KXWhaPnrA6hR` Ready. Inspeção do domínio principal confirmou a implantação e os dois aliases. Navegador real abriu a página pública do Ipiranga, encontrou o botão “Abrir agente da loja Renata Macedo” e abriu o painel com a mesma identidade, contexto do imóvel e ações de dúvidas/agendamento. Nenhuma mensagem foi enviada; essa verificação confirma carregamento/identidade, não a resposta gerada nem a retomada WhatsApp. Registro pós-publicação mantido localmente para evitar deploy só documental.

Auditoria de continuidade (somente leitura) identificou pendências além do carregamento: as falas da loja persistidas alimentam o arquivo do CRM e o contexto recente do WhatsApp, porém não entram diretamente na extração de `lead_memory` (que usa apenas mensagens WhatsApp). A retomada usa até dez falas da loja abreviadas a 320 caracteres; não é memória integral consolidada. A rota de mensagem tolera falha de persistência e pode retornar resposta sem registro. Visitantes anônimos não têm backfill explícito das falas quando passam a ser identificados; a leitura WhatsApp pela loja exige `conversationId`. O resolvedor de tracking valida lead/conversa dentro da organização, mas ainda precisa exigir que ambos pertençam ao mesmo lead para evitar associação inconsistente; não houve exploração em produção. Para itens de agendamento, abertura e convite usam texto fixo antes da comparação contextual dos itens de venda, embora a geração receba os produtos visitados. Faltam teste integrado de gravação na loja → resposta WhatsApp com os fatos da loja e reteste real da Renata. Essas pendências não foram alteradas pelo complemento de carregamento.

## Continuidade global entre WhatsApp e loja — complemento de 11/09

O titular confirmou o modelo desejado pelo teste da Luna na BuffaloMass: botão de produto recebido no WhatsApp abriu a página com a Luna atendendo. A leitura do navegador conferiu botão, vínculo da URL, identidade e contexto do item; nenhuma mensagem foi enviada pela tarefa. A correção abaixo é compartilhada por todos os agentes e não muda preferências de ativação, modo ou profissão dos clientes.

Implementado localmente: vínculo canônico entre conversa, lead e telefone na organização; seleção do atendente da conversa e recuperação da conversa do agente escolhido quando só há lead identificado. Sessão antiga de outro lead, inclusive a variante sem lead mas ligada a outra conversa, não pode substituir o novo contexto. Atualização condicional da sessão impede sobrescrever mudança concorrente de identidade. Mensagens anônimas sem vínculo são associadas somente ao identificar a mesma sessão; mensagens legadas sem lead da conversa correta continuam recuperáveis, sem aceitar lead divergente. O histórico de outros atendentes permanece armazenado, com distinção de autoria.

A rota pública exige persistência da fala antes de gerar resposta e da resposta antes de devolvê-la como sucesso; falha retorna indisponibilidade, sem identificador fictício. O contexto recente da loja preserva detalhes além dos antigos 320 caracteres (até dez mensagens, 4.000 caracteres por mensagem e 8.000 no conjunto, mantendo o registro completo no banco). A extração de memória existente no WhatsApp inclui essas falas com autor, canal e data e é aguardada após o envio. Usa a mesma operação medida, sem segundo job de IA. A primeira retomada com uma fala WhatsApp e fala persistida do lead na loja já pode consolidar. Nome exige evidência de apresentação/resposta direta; menções do agente não viram identidade. Abertura contextual também compara itens de agendamento e orienta a agenda, preservando os fluxos de venda.

Limites: conversa exclusivamente na loja é registrada no arquivo do lead, mas não dispara extração duradoura independente; a consolidação ocorre na retomada WhatsApp com memória habilitada. Histórico recente é limitado, não transcrição ilimitada. A rota de chat ainda não tem recibo idempotente por mensagem: repetição manual após falha ao salvar a resposta pode gerar nova operação medida, como no fluxo anterior. Não houve migration, reserva, pagamento ou teste de envio real. Verificação integrada usa funções reais de persistência/leitura/extração com banco e provedor simulados; não equivale a comprovar uma nova resposta da IA em todos os clientes. Publicação autorizada; revisão e validação final em andamento.

Validação final: suíte completa com **1.499 testes em 160 arquivos** aprovada; após a última regressão de sessão legada, **49 testes** de vínculo/rastreamento/memória passaram novamente. TypeScript, ESLint dos arquivos alterados e diff-check aprovados. Revisão independente reproduziu e confirmou as correções de identidade com cookies reais do contrato, seleção de agente e histórico legado. Nenhum achado dessa revisão ficou aberto. Envio autorizado à master e implantação em andamento; conferência pública posterior e reteste real do usuário ainda pendentes.

Publicado em 11/09/2026 às 23:07 BRT: commit `10f45a0`, implantação Vercel `dpl_95xvveFf2jwNYDJMCcneLKBt1jcc` Ready. Log de build confirmou o commit, e inspeção do próprio domínio principal confirmou esta implantação e ambos os aliases. Depois da publicação, abas novas no navegador abriram o atendimento Renata Macedo no imóvel Ipiranga com ação de agendamento e Luna no link do produto recebido pelo WhatsApp. Nenhuma fala, compra ou reserva enviada. Isso confirma carregamento e identidade pública; a ida e volta completa com nova fala e consolidação real de memória continua para o teste do titular. Registro posterior ao push mantido localmente para evitar implantação apenas documental.

## Agente ausente no acesso público — 12/09/2026

O titular voltou a relatar ausência do dock na página do Ipiranga. Reproduzido no perfil Chrome usado pelo cliente: POST de sessão do agente retornou HTTP 403, `Contexto da loja nao autorizado.`, com ausência de token assinado na requisição. A conferência de variáveis de Production na Vercel comprovou que `TRACKING_PUBLIC_TOKEN_SECRET` não existia. O código de loja/produto/checkout depende dela para emitir a assinatura de organização; acessos com vínculos/sessões anteriores podiam passar por outras validações, portanto a conferência anterior não cobriu o primeiro acesso sem esse vínculo.

Chave aleatória de 256 bits configurada como variável sensível somente em Production, sem gravar valor no repositório ou em relatório. Nenhum bypass adicionado ao código, configuração da Renata ou opção de privacidade alterada. Reimplantação do mesmo commit `10f45a0` solicitada para carregar a variável; sem migration. Os 23 testes de assinatura, vínculo do agente e estabilidade de contexto passaram. Confirmação da nova implantação, resposta HTTP e presença do dock após recarga ainda em andamento neste registro.

Correção publicada e observada: implantação `dpl_5dWumMiLrPrWrfHSX3cKBmNZWZj7` Ready, aliases principal/com www, mesmo commit. A requisição do navegador passou a incluir assinatura e retornou HTTP 200 com `enabled: true` e agente Renata Macedo; o painel abriu na loja. Em navegador separado, acesso direto ao produto Ipiranga sem parâmetros de lead/conversa também exibiu o botão e abriu o atendimento Renata Macedo, com contexto do imóvel e ações de dúvidas/agendamento. Nenhuma mensagem, pagamento ou reserva enviada. Nenhuma alteração de código necessária; registro operacional permanece local para o próximo conjunto documental. A falha de configuração de produção está corrigida; esta verificação não comprova toda a continuidade de mensagens da conversa.

## Troca de pagamento na mesma conversa — 12/09/2026

O titular apresentou novo print: pedido de cartão recebeu explicação sem botão; pedido posterior de link enviou Pix; correção rejeitando Pix produziu outra promessa sem acesso. Regressão com as frases do print e produto fictício reproduziu dez falhas no runtime anterior. Causas: o filtro genérico de dúvidas interrompia a recuperação ao encontrar “como”, a leitura de método aceitava o Pix negado ao final da frase e a memória desconsiderava a escolha feita em uma pergunta. O guarda de respostas não cobria as duas formas de anúncio sem botão vistas no print.

Correção compartilhada: seleção de método separada do consentimento para criar cobrança; perguntas sobre usar cartão reabrem somente uma sessão existente. Escolha do cliente tem precedência sobre oferta incorreta da IA e persiste por pedido/conversa/organização/instância, inclusive após corte do histórico recente. O botão abre o checkout do mesmo pedido com cartão selecionado; retorno explícito para Pix reutiliza o código válido. Expiração do código Pix permite abrir o checkout de cartão após validação, sem gerar outra cobrança. Estados pagos, incertos, bloqueados, cancelados e métodos indisponíveis continuam protegidos; método indisponível não vira Pix silenciosamente. A sessão consultada também precisa pertencer ao pedido. Promessas sem execução recebem substituição controlada. A retomada automática usa a mesma preferência no botão, sem alterar a cobrança efetiva.

Validação: **1.528 testes em 161 arquivos** aprovados na suíte completa; depois do complemento da retomada, **127 testes em cinco arquivos** passaram. TypeScript e ESLint aprovados. Casos cobrem frases do print, pedido genérico de link, histórico truncado, troca de volta para Pix, dúvida sobre juros, recusa de compra, alteração de endereço, atendimento humano, agendamento, expiração, conferência financeira e isolamento da preferência. Sem migration ou alteração manual em pedidos/configurações. Banco, gateway e envio WhatsApp simulados nas regressões; não houve envio real, cobrança ou cancelamento de Pix. Publicação já autorizada, em preparação; reteste real pelo titular permanece necessário para observar a entrega na conversa.

### Reset autorizado das conversas de teste — 12/09, 14h53 BRT

O titular pediu reinício do próprio número com Gustavo e Luna como primeiro contato. Confirmado que ambos compartilhavam o mesmo lead nesta empresa e que esse lead tinha somente essas duas conversas. Backup privado local fora do Git preservado. Atendimento anterior e lead arquivados, com liberação dos identificadores de contato; criados um lead novo e duas conversas vazias. Os cinco pedidos antigos permaneceram integralmente inalterados e vinculados ao registro arquivado. Sete follow-ups pendentes/falhos desse contato foram encerrados como ignorados, e 29 aprendizados extraídos especificamente dessas duas conversas saíram da seleção ativa de memória, preservados como arquivo.

Verificação por leitura após a operação: lead novo sem metadados anteriores, duas conversas sem mensagens/prévia/data de última mensagem, nenhum pedido, sessão de loja, mensagem web, decisão de oferta ou perfil de automação vinculado ao novo lead. Nenhum aprendizado dessas conversas permanece com a tag ativa. No painel, os atendimentos novos do Gustavo e da Luna apresentaram “Sem mensagens salvas”; os atendimentos antigos continuam visíveis como arquivados na lista Tudo. Operação de dados sem publicação de código, envio WhatsApp, alteração de cobrança ou cancelamento de pagamento. O usuário fará o próximo teste; reset de contexto não comprova correção do incidente de checkout. Para o teste limpo, iniciar pelos chats WhatsApp atuais e pelos links que forem enviados no novo atendimento; páginas de checkout antigas continuam ligadas aos pedidos arquivados.

### Novo incidente e correção isolada — 12/09, após o teste das 12h30

Registro pós-publicação preservado do checkout original: publicado em 12/09 às 00:48 BRT, commit `1d33255` na master, implantação `dpl_BkpfV5GDXozVaV3V2533pu7RDmfn` Ready. Build confirmou o commit e concluiu compilação/TypeScript; consulta do domínio principal confirmou essa implantação e ambos os aliases. Dezesseis testes de retomada passaram novamente após ajuste de lint do teste. Alteração disponível para todos os agentes no runtime compartilhado. Nenhum teste real enviado pelo agente de desenvolvimento; observação da entrega na conversa permanece para o titular. O registro permaneceu local até esta integração para evitar outro deploy apenas documental.

A Vercel foi consultada e confirmou o conjunto anterior `1d33255` em **Ready / Latest / Production**, implantação `dpl_BkpfV5GDXozVaV3V2533pu7RDmfn`, desde 00:48 BRT. Mesmo assim, leituras do banco confirmaram pedido explícito de cartão seguido apenas de áudios/texto, sem botão ou fallback, e sessão ainda Pix pendente. As execuções `completed` representavam respostas da IA, não a recuperação do checkout. Configuração de cartão habilitada; sem tentativa de cartão, revisão pendente ou trava encontrada para o pedido.

Reprodução fictícia identificou bloqueio de “muda pra mim”, seleção vazia ao recuperar o resumo de um pedido já confirmado, “?” e reclamação completa fora do caminho de recuperação, além de alegações sem execução não cobertas. Correção local no runtime compartilhado recupera a mesma sessão com cartão selecionado, preserva itens/quantidades e bloqueia mudanças reais não resolvidas. O transporte também passou a exigir rejeição definitiva antes de repetir o botão em outro formato; 408/5xx registra entrega incerta. **1.562 testes em 161 arquivos**, TypeScript e ESLint aprovados. Nenhum efeito externo de teste, migration ou publicação. Produção ainda na versão anterior; publicação deste novo conjunto e observação da entrega real permanecem pendentes. [Causas, evidências e limites](correcao-troca-pix-cartao-2026-09-12.md).

### Agenda direta — 13/09/2026

Implementação na base publicada `fb29bee`, preservando checkout e reset 0134/0135. O fluxo consulta vagas reais e registra a reserva com aceite atual, sem aprovação do responsável; mantém o horário durante a coleta do nome, confirma a persistência com local e trata alternativas, falhas e encaminhamentos duráveis. O painel preserva múltiplas faixas, permite bloqueios internos e define calendário padrão explícito. Avisos têm estado independente e proteção contra repetição incerta e reset concorrente.

Migration 0136 aplicada na VPS pela sessão administrativa do navegador, autorizada pelo titular. Configurações e contagens existentes preservadas por conferência transacional; zero recursos/reservas antes e depois. Funções, seis FKs dos encaminhamentos, RLS e permissões conferidos. A função de reserva teve a permissão exclusiva do serviço reafirmada diante de divergência encontrada no destino. Sem criação de configuração, visita ou envio real de teste. Suíte completa 2.550 testes/193 arquivos; complemento de 28 testes, ESLint e build de produção com TypeScript aprovados. [Plano, evidências e reteste](plano-agenda-direta-2026-09-13.md). Publicação do aplicativo em andamento; Renata ainda precisa cadastrar horários/local e escolher o vínculo correto do item/calendário.

### Reteste noturno e pacote prioritário — 13/09/2026, conferido às 23:26 BRT

Auditoria no WhatsApp pessoal: Gustavo 48 mensagens e Renata 43, do início acessível às últimas respostas de 22:34/22:29. P0 publicado antes do teste ainda falhava: anexo e botão selecionavam última menção em vez de citação; complemento de data não entrava na agenda; prosa prometia ações sem registro; prévia comercial acrescentava marca não cadastrada e contradizia o frete. A demora de cinco minutos da Renata teve retomada após intervenção humana registrada. Não há evidência de conflito entre navegadores.

Correção publicada na master em `4ecc86709f7fe874723f51993425e97a485434ad`, Vercel `dpl_3EJDTJDrx5PtetoDH222gxr6wCH5`, Ready/Latest/Production e domínio principal conferidos até 14/09 02:26 UTC. Citações são validadas no histórico, fotos antigas contraditórias exigem escolha explícita, agenda preserva o conjunto de mensagens atuais e bloqueia promessas sem ação. Prévias são recalculadas contra catálogo/frete e não confirmam versões inexistentes; indicação/fechamento automático dos anabolizantes identificados é contido. Sem migration nem alteração de configuração real.

Validação: 101 casos direcionados aprovados. Rodada geral final: 2.652 aprovados e uma falha SQL; arquivo reexecutado isoladamente com 10/10 aprovados, sem alteração financeira. Build, TypeScript e lint finais aprovados. HTTP `/` e `/login` 200, checkout fictício inexistente 404. Nenhum teste real de mensagem, pedido, pagamento ou reserva. [Auditoria, causas e limites](auditoria-reteste-gustavo-renata-2026-09-13-noite.md).

Pendências materiais: reteste do titular após publicação; imóveis da Renata sem recurso vinculado e calendário padrão vazio, embora a agenda tenha um recurso habilitado; não se deve inferir configuração nem afirmar reserva operacional. Alimentação e demais extensões continuam preservadas localmente e fora deste pacote prioritário.

## Alimentação retomada — 14/09/2026

Autorização explícita do titular revogou a pausa. Montagem por unidade, preços/limites cadastrados, revisão confirmada, busca completa e validações de entrega/cobrança implementadas e testadas; correções urgentes de 4ecc867 preservadas. Migration 0142 aplicada e verificada, seis novas funções restritas ao serviço, triggers ativos e índice válido. Nenhuma configuração real de montagem ativada. Aplicativo em publicação. [Evidências e limites](alimentacao-montagem-2026-09-14.md). Recursos de serviços/domicílio e retestes reais permanecem pendentes, sem bloquear esta entrega.


## Estúdio e transporte nativo Betel — 14/09/2026

Release `94d34012875830a2ed1130259b21d851ad95794e` publicada em produção: Vercel `dpl_J5eiTWsuSiX7F1jVFGYPJtTRNHV4`, Ready e aliases `connectyhub.com.br`/`www`, build concluído às 17:40 BRT. Inclui layout cliente e separação administrativa API de AI / Estúdio de Voz e Áudio, transporte nativo Betel e quatro adaptadores internos de áudio ainda sem rotas públicas. Isso não conclui a expansão das modalidades nem ativa novas tarifas.

Mapa de origem nativa da Betel confirmado no ambiente de produção e aceito pelo parser real: API transporta os links da Betel e webhook não cria outro CRM para as instâncias API dessa organização. Links legados permanecem. A tarefa proprietária da Betel confirmou oito requisições HEAD de quatro links legados, com destinos corretos e contadores inalterados; nenhum clique/envio real foi gerado. Aplicação/login/documentação retornaram200 e API de voz sem credencial401. Integração consolidada aprovada em40 testes de transporte, webhook nativo e links.

## Atendimento aos responsáveis — 14/09/2026

Correção focada `0a8e2bb` integrada localmente à release atual, build e TypeScript finais aprovados; publicação em andamento. Reconhece variante móvel brasileira com/sem nono dígito, usa responsáveis atuais por agente e revalida antes de IA/voz/envio e follow-up. Preserva histórico técnico e avisos administrativos; nenhuma mudança cadastral ou migration.100 testes focados aprovados na base integrada. [Causa, verificações e limites](correcao-responsaveis-whatsapp-2026-09-14.md). Reteste real após publicação permanece pendente.

Publicação da correção confirmada às 18:00 BRT: `fe81625d`, Vercel `dpl_DFt5MJAooejHXPjnKTMUma8u2yZ5` Ready e aliases principais. Relatório anterior registra as verificações; nenhum teste real foi disparado. Registro pós-publicação mantido para o próximo pacote, evitando deploy apenas documental.

## Assets privados do Estúdio — preparação local em 14/09

Implementados arquivos privados na VPS com ticket de uso único, escopo organização/projeto, revalidação de contrato/chave e reserva/liberação de armazenamento. FFmpeg mede duração por decodificação com limite de30 minutos/20 MB, sem URLs externas, sem usar duração declarada pelo cliente. Upload, download e exclusão exigem autorização; confirmações são recuperadas após reinício. Não há consumo de fornecedor ou débito de IA nesta etapa.

27 testes dirigidos passaram (SQL PostgreSQL local, transporte HTTP local, isolamento, duração sintética e regressões do relay), além de TypeScript/lint. Migration0148, nova imagem com FFmpeg, volume privado incluído no backup e flag `STUDIO_ASSETS_ENABLED` ainda **não publicados/ativados**. Isso não conclui as modalidades do Estúdio; operações, liquidação, ferramentas da interface e ativação comercial continuam em desenvolvimento. Nenhum arquivo pessoal ou geração paga utilizado nos testes.

## Expansão do Estúdio — base aplicada em14/09,20h BRT

Migrations0148/0149 aplicadas transacionalmente após ensaio com rollback no destino.
Quatro tabelas Studio comRLS e acesso de serviço, bucketconnectyhub-studio privado;
12 capacidades inicialmente desabilitadas, sem alteração de tarifas existentes.
Imagem relaystudio-20260914 comFFmpeg construída e validada como usuário node;
publicação da aplicação e troca do processo ainda em andamento.

Backup operacional passou a incluir configuração e volume privado do relay.
Arquivo connectyhub-20260914T224327Z.tar.gz,569.500.068 bytes,
SHA256cf302ce5aef22ad3a146fd86a773a305ba651187d609a849b8374fa25396cf0f;
conteúdo dos arquivos internos conferido. Esta cópia ainda está na VPS.

Testes sintéticos reais de nove modalidades (incluindo salvamento e download de
dublagem) passaram; dicionários recusados por permissão específica da chave.
Total conservadorUS$0,650437 deUS$1 autorizado. Referências e limites em
[plano de custos do Estúdio](plano-custos-estudio-audio-2026-09-14.md).
Transporte real testado não comprova todos os percursos comerciais painel/carteira.

Validação final local: 2.902 testes em 240 arquivos passaram com dois workers,
ESLint e build Next.js/webpack com TypeScript e 108 páginas passaram. A rodada
anterior no paralelismo padrão teve apenas timeouts nos testes PGlite.
Relay atualizado e `/health` confirmou Live, uploads e Studio assets; diretório
privado do Estúdio com modo 0700 e usuário node. Flags da aplicação configuradas
para a próxima publicação; capacidades financeiras continuam fechadas até confirmação.

### Publicação e teste real do Estúdio — 14/09/2026, 20:32 BRT

Publicação integrada `7fd9fe3c` e correção `47c58ab5` concluídas. Último deploy
`dpl_JTpZ5ytexd1WK7ySgka9mY11ZU7D`, Ready, com os dois domínios de produção.
O pacote `17731ed` está incluído por ancestralidade. A correção aceita IDs de modelo
com versão decimal no formulário, mantendo a validação pela lista permitida.

O teste real encontrou as duas funções novas ainda ausentes do registro do Inngest.
PUT `/api/inngest` respondeu 200, `Successfully registered`, `modified: true`;
`connectyhub-connectyhub-studio-operation` e `connectyhub-connectyhub-studio-recovery`
foram verificadas no banco da VPS. O evento foi reenviado com o mesmo recibo,
sem criar outra reserva. Próximas publicações devem conferir esse registro;
não presumir que o polling sozinho já sincronizou funções novas.

Gemini 3.1 TTS habilitado com as tarifas existentes de entrada/saída, sem somar
caracteres. Teste sintético no painel Betel Voz concluiu o recibo
`e33f7b71-1570-4546-a612-da9fb70f31fb`: 16 tokens de entrada, 172 de saída,
8,2944 créditos debitados, reserva final zero (cotação máxima 393,9696).
Repetição pela interface recuperou o mesmo recibo; banco confirmou exatamente
um evento de uso e um débito. WAV de 257.324 bytes/5,36 segundos, SHA-256
`542fdee7a3ef63eeea64f15991f22b7683b8ea25261f90cbbdf20e0821ab8234`, decodificado
sem erro pelo FFmpeg e carregado pelo player do navegador. Resultado de teste
removido de forma idempotente; recibo e débito preservados. Nenhum clone de cliente
ou arquivo pessoal foi usado. Evidências privadas ficam no diretório temporário
`connectyhub-studio-provider-tests`; não versionar chaves ou arquivos de clientes.

Upload/download real de asset privado também passou: 201/200, hash igual,
5,16 segundos aferidos, acesso anônimo 401 e exclusão idempotente.
A cópia do backup `connectyhub-20260914T224327Z.tar.gz` foi concluída fora da VPS,
em `C:/Users/conne/Documents/ConnectyHub-private-backups`, com tamanho e SHA-256
iguais aos acima e ACL restrita. É um snapshot anterior às migrations 0148/0149,
não uma cópia do estado posterior ao teste; não equivale a backup externo automático.

Total conservador dos testes: US$ 0,653893 de US$ 1 autorizado. Referência calculada,
não fatura: custos individuais ausentes continuam contabilizados pelo teto reservado.
Não resta reserva de teste aguardando geração. Novas modalidades ElevenLabs seguem
desabilitadas comercialmente: falta login na conta proprietária da chave para
confirmar tarifas e ajustar apenas `pronunciation_dictionaries_write`. A autorização
do recurso já existe; a pendência é acesso à conta correta. Gemini 2.5 segue
desabilitado por falta de tarifa correspondente. TTS/clonagem já existentes não
tiveram tarifas alteradas. As demais modalidades passaram no transporte sintético,
mas ainda não no percurso comercial completo painel/carteira.

### ElevenLabs e clareza dos créditos — 14/09/2026, 21:32 BRT

Conta proprietária da chave Connectyhub confirmada no painel ElevenLabs (Creator).
A comparação privada da chave foi positiva; somente a permissão de escrita de
Dicionários de Pronúncia foi habilitada. Reteste sintético respondeu200; sem
variação observada de créditos nem cabeçalho individual de custo. Total conservador
US$0,673893 deUS$1: osUS$0,02 adicionais continuam contados pelo teto.
Não registrar a credencial aqui. Dicionário comercial continua fechado até comprovar tarifa.

Tabela ElevenAPI autenticada confirmou ScribeUSD0,22/h, isolamento/trocaUSD0,12/min,
v2/v3USD0,10/1000caracteres e dublagemv1 sem marcaUSD0,50/min. O valorUSD0,33/min
é da opção com marca e não se aplica ao transporte atual. Alinhamento acompanha
STT conforme documentação; desenho cobra os caracteres explícitos uma vez para
três prévias, salvar usa slot sem outra geração. Oito tarifas novas foram preparadas
comUSD×6×4/R$0,01 e mínimo5; modelos permanecem DESABILITADOS nesta conferência.
As linhas financeiras preexistentes foram comparadas e preservadas integralmente.

Relato do titular e print mostraram cotação393.9696 ao lado de saldo48.352.
O valor é o limite de uma operação, não cota do fornecedor. O endpoint usa a
organização/projeto autenticados; detalhes/listagens exigem ambos os vínculos,
e custos administrativos exigem isPlatformAdmin. Não foi encontrado vazamento.
O cálculo Gemini usa entrada conservadora e máximo8192tokens de saída; SQL impede
liquidação acima da reserva. O teste anterior debitou8,2944 e zerou a reserva.

Correção local elimina consulta manual e calcula o custo com debounce600ms.
Descarta respostas antigas, bloqueia geração sem cotação e preserva o teto preciso
no X-Max-Credits. Exibe “Custo máximo deste áudio: até394créditosConnectyHub” para
esse caso, arredondando para cima apenas na tela. A ação vira Gerar áudio e depois
Ver resultado/Acompanhar; recuperar recibo conhecido usaGET. Custo final tem resumo
com duas casas e precisão original nos detalhes. Nenhum saldo/cobrança foi ajustado.
Prévia local desktop/mobile390px sem overflow, cotação sem geração, recuperação
sem segundoPOST e erro de tarifa com geração bloqueada conferidos.35testes dirigidos,
ESLint, TypeScript e build webpack108páginas passaram. Publicação em andamento.

### Estúdio publicado e modalidades ativadas — 14/09/2026, noite

Substitui as pendências de publicação/ativação acima: `2befee97ca81a2d2f8e8d38e716af372fefa3304`,
Vercel `dpl_GyTvdz29hRAD8juJSFoeYtJsN3M8`, Ready/Production e ambos os domínios
confirmados. O pacote17731ed está incluído. No painel real, preencher Gemini passou
a mostrar automaticamente “até394créditosConnectyHub”; transcrição mostrou5créditos,
sem iniciar geração nessas duas verificações. Resultado de limpeza abriu no player
autenticado, readyState4, duração5,154853s e sem erro. Não houve outro deploy.

Oito modalidades ElevenLabs agora habilitadas com a tabela conferida: transcrição,
limpeza, troca de voz, alinhamento/legendas, diálogo, desenho, salvamento de voz
desenhada e dublagemv1 sem marca. Gemini3.1 permanece habilitado. Dicionários e
Gemini2.5 Flash/Pro permanecem fechados por falta de tarifa comprovada.

Cada uma das oito novas modalidades passou em uma operação sintética real com
worker publicado, resultado privado, exatamente1evento de uso/1débito, reserva0,
repetição recuperando o mesmo recibo e acesso de outro projeto recusado. Arquivos
de áudio e as três prévias de desenho passaram em hash/FFmpeg; transcrição e
alinhamento também em SRT/VTT. Voz desenhada salva conferida no fornecedor.
A criação usou helper administrativo chamando voiceAccess e a lógica real, com
evento no Inngest da VPS e execução na Vercel. Não equivale a testar todas as
rotas públicas com chave nem todos os formulários de ponta a ponta. Rotas públicas
e de painel sem autenticação responderam401. Nenhuma voz real de cliente foi usada.

Foram debitados231,48créditosConnectyHub no total desses oito testes, sem ajustes
artificiais de carteira. Resultado e asset sintéticos foram excluídos de forma
idempotente; voz de teste removida do fornecedor e marcada excluída. Recibos
financeiros preservados. Linhas preexistentes de features/modelos/tarifas ElevenLabs
comparadas com o snapshot e integralmente preservadas.

Total conservador de toda a rodada: **US$0,959893 deUS$1**; margemUS$0,040107.
Valores sem cabeçalho individual mantêm o teto contabilizado; não é uma fatura
nem medição do custo médio. Nenhuma nova geração programada. Evidências privadas
em `%TEMP%/connectyhub-studio-provider-tests/commercial-final-audit.json` e relatórios
por modalidade; [tabela e limites](plano-custos-estudio-audio-2026-09-14.md).
Registro pós-publicação mantido para o próximo pacote, evitando build apenas documental.

### Fechamento comercial e descoberta do Estúdio — 14/09/2026, 22:05 BRT

Complemento `d79872ca` publicado pelo deploy `dpl_GKbCh48xckHTKhAJdNwzwKBcigoT`,
Ready/Production, com `www.connectyhub.com.br` e `connectyhub.com.br` conferidos.
Inclui o pacote17731ed por ancestralidade e os registros da ativação anterior.
Corrige o rótulo do download OpenAPI de Voz e completa os dados estruturados
da home/documentação e as descrições em llms.txt/llms-full.txt.

Seis páginas públicas responderam200; HTML da home confirmou seção Estúdio e
aviso de contas gratuitas/teste sem geração ilimitada. JSON-LD publicado parseado
com sucesso: SoftwareApplication inclui Voz e a documentação possui WebAPI de Voz.
OpenAPI1.1.0, guia e descrições de disponibilidade conferidos; bundle da documentação
contém o rótulo corrigido e não contém o anterior. Não é prova de indexação/ranking.
ESLint, sete testes docs/admin e build webpack/TypeScript/108páginas passaram.
Admin foi auditado no código publicado e testes, sem novo login administrativo.

[Quadro completo e limites](auditoria-escopo-estudio-2026-09-14.md). A execução
autorizada para as oito modalidades e apresentação comercial está concluída.
Dicionário e Gemini2.5 continuam fechados por evidência financeira ausente;
os caminhos para obter essa evidência estão no quadro. Nenhuma geração adicional,
contato externo ou alteração de plano. Orçamento conservador mantidoUS$0,959893.
Este registro posterior fica local para o próximo pacote, sem deploy documental.

### Tarifas complementares autorizadas — 14/09/2026, 22:15 BRT

O titular substituiu a exigência de custo exato para os recursos pendentes por
autorização explícita para previsão, implementação e teste. Cadastro isolado
preparado conforme [tabela versionada](studio-tarifas-complementares-2026-09-14.json):
dicionário5créditos por criação/nova versão, custo externo assumido0 e **não
confirmado gratuito**. Consulta/replay/aplicação não recebem taxa adicional;
TTS mantém a cobrança anterior. Metadata financeira e evidência administrativa
identificam a hipótese; painel/guia passam a informar tarifa provisória.

Receita nominalR$0,05/op cobre custo externo atéUS$0,008333 antes de infraestrutura,
impostos e taxas; para preservar4x, custo atéUS$0,002083. Não é margem garantida.
ContaCreator e FAQ da assinatura consultadas: uso deTTS é por caractere, dicionário
não tem linha específica na tabela. HTTP200/delta0 anterior é apenas corroborativo.

Google[preços oficiais](https://ai.google.dev/gemini-api/docs/pricing) confirma
2.5FlashTTSStandardUSD0,50/Mtokens entrada e10/Msaída; ProUSD1/M e20/M.
TarifasCH Flash0,0012/inputtoken+0,024/outputtoken, Pro0,0024+0,048, mínimo5
uma vez por operação, sem alterarGemini3.1. Modelos existentes `external_ai`
preservados: apenas novas tarifas da feature `voice_generation_audio` foram
inseridas. GETmodels autenticado200 para ambas as variantes, comgenerateContent;
não é teste de geração, quota ou qualidade. Nenhum POST ao fornecedor nesta rodada.

28testes dirigidos, ESLint e build webpack/TypeScript108páginas passaram.
Ainda falta confirmar publicação do aviso, ativação e cotação no catálogo real.
O orçamento conservador continuaUS$0,959893 deUS$1; não programar geração adicional.

### Complemento ativado e provisão ajustada — 14/09/2026, 22:20 BRT

`79faf148`, deploy `dpl_7dzkVNWpDkf5WNhGfCQK8uikGFPQ`, Ready/Production,
ambos os domínios conferidos. Dicionário e Gemini2.5Flash/Pro habilitados.
Catálogo real retornaavailable=true nas três variantes. Cotações sem geração:
dicionário5cr; texto sintético “Teste.” GeminiFlash até196,9224 ePro até393,8448cr,
reservas máximas de8192tokens de saída, não custo final nem débito realizado.
Recibo anterior recuperado com a mesma chave sem nova operação. Painel real
exibiu aviso provisório e cotação automática de5cr; botão de criação não clicado.
Guia público200 inclui aviso; capabilities anônimo401. Nenhuma geração adicional.

Refinamento explícito do titular: **provisão de custoR$0,0125/op e venda4x=R$0,05=5cr**.
Substitui a hipótese0 acima. A linha nova de dicionário e o snapshot confirmado
receberam essa provisão; custo efetivo do fornecedor continuaDESCONHECIDO.
Metadata identifica `internal_budget_provision_not_measured`, versão2 da tabela,
e evidência administrativa alerta PROVISORIA. O preço ao cliente não mudou.
Dois testes financeiros foram repetidos e passaram após essa mudança de premissa.
Não é lucro líquido medido. Testes reais de geração2.5 e percurso completo de criação
de dicionário ainda não realizados; transporte de dicionário já havia respondido200.

Comparação agente/Estúdio por leitura ao vivo: Gemini compartilha
`voice_generation_audio` e o mesmo resolvedor. Gemini3.1 mantém0,0024/inputtoken,
0,048/outputtoken e mínimo1. Variantes2.5 não tinham linhas nessa feature antes;
foram adicionadas com mínimo5, sem substituir3.1. AgentesEleven usam
`voice_reply_whatsapp`, API/Estúdio usam `text_to_speech`. Divergência preexistente
multilínguev2: agente0,24cr/caract/min50, API0,008cr/caract/min5; custos cadastrados
R$0,0006 eR$0,00005/caract respectivamente. Flashv2.5 agente0,006cr/caract/min5,
sem tarifaAPI. Uniformizar para a tarifa do agente aumentaria o preçoAPIv2 em30x;
isso foi comunicado à origem para decisão explícita, preservando as linhas antigas.
Não apresentar a divergência como causada pelo complemento ou como margem validada.

### Custo compartilhado e Financeiro por operação — 14/09/2026

O titular autorizou corrigir as duas tarifas antigas usando custo aproximado
e multiplicador 4, preservando operações passadas. Referência Creator consultada:
Multilingual v2 USD 0,10/mil caracteres; Flash USD 0,05/mil, com câmbio interno
R$ 6/USD. API v2 passa de 0,008 para 0,24 cr/caráter (mínimo 5); Flash agente
de 0,006 para 0,12 (mínimo 5). v2 agente permanece 0,24/mínimo 50.

Implementada referência de custo da API v2 à tarifa de agente do mesmo modelo,
sem copiar o mínimo comercial. A edição administrativa preserva a referência e
impede desativar sua base enquanto usada. Duas versões novas foram preparadas
inativas, para ativação após a publicação, mantendo custos/preços antigos intactos.

O Financeiro existente recebeu consulta administrativa por operação, com
custos históricos, ledger de débito/estorno, recibos/reservas, filtros e margem
nominal estimada; limite explícito de 2.000 eventos. A leitura real retornou
237 operações, 228 movimentos vinculados, nenhuma pendência e sem truncamento.
Filtro por modelo e largura de celular conferidos na prévia local; rota temporária
removida antes do build. Os 37 testes direcionados e ESLint passaram.

Detalhamento e limites em [custos de voz/Estúdio](centro-custos-voz-estudio-2026-09-14.md).
Margem de 75% refere-se ao crédito nominal antes das despesas; bônus e pacotes
reduzem o valor efetivo. Não é lucro líquido nem fatura conciliada. Nenhuma
geração paga adicional; permanece US$ 0,959893 do teto US$ 1. Este registro
prepara a publicação; a confirmação do deploy e da ativação é posterior.
