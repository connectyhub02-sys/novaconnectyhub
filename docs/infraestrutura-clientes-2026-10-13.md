# Infraestrutura vinculada manualmente a clientes — 13/10/2026

## Decisão do titular

O administrador cadastra o cliente e o contrato pelo fluxo existente. Em
Infraestrutura, cadastra o projeto ou abre um já existente (como Vision), escolhe
manualmente o cliente/empresa e libera a visualização. Não vincular a Vision ao
André automaticamente. Não criar contratação automática de VPS nem interpretar
`past_due` como autorização para desligar hospedagens. Retomada após pagamento é
manual nesta entrega.

## Implementação

- Cadastro de projeto separado do cadastro comercial; não provisiona containers.
- Vínculo auditado e transacional, com revisão para impedir sobrescrita concorrente.
- Minha infraestrutura: CPU, RAM, consumo e limites por serviço, somente de projetos
  liberados às organizações das quais o usuário autenticado é membro.
- Retirar a liberação ou mudar o vínculo remove acesso na próxima consulta.
- Admin: prévia atual, confirmação específica e motivo para pausa, quarentena,
  retomada e exclusão local. Comandos exigem allowlist infra além do papel admin.
- Pausa/quarentena preservam dados e políticas anteriores de reinício. A retomada
  liga somente serviços antes ativos. Falhas parciais exigem revisão do recibo.

O app recebe somente um socket de operações limitadas e métricas sanitizadas; não
recebe Docker/SSH. Mapeamento de recursos pertence ao root no host, separado dos
nomes amigáveis de agrupamento. Imagens, diretórios e labels de Compose são
conferidos; recursos compartilhados bloqueiam comandos. Cadastros novos precisam
desse mapeamento antes de receber métricas e comandos.

## Escopo e limites

Excluir hospedagem remove os containers, volumes e diretórios exclusivos da
prévia, depois de quarentena. Preserva cadastro comercial, contratos, auditoria,
R2, DNS, backups externos, proxy, imagens e redes Docker. Não apresentar como
"apagou todos os dados do cliente". A prévia informa as exclusões.

Vision e Immov.ai têm inventário privado revisado. Exclusão local de Immov.ai
liberável após quarentena; a de Vision continua bloqueada para revisão adicional
dos serviços externos. Pausar/retomar não corresponde a suspender a conta da
ConnectyHub inteira. Publicações por SSH fora deste executor não estão coordenadas
com a quarentena: não publicar sobre hospedagem pausada. Reinício inesperado fica
visível como erro. Espaço em disco exclusivo por projeto ainda não é medido.

## Verificação e implantação

Migration 0204 aplicada e registrada na VPS, com backup privado prévio do inventário
e auditoria (`infra-before-0204-20261013.sql`, SHA-256
`e757c56437985c2c9f4830214ec199ec3923dd9a8b22f620294c3bddd244a64c`). Os cinco projetos
continuaram sem vínculo e com acesso cliente desabilitado; nenhuma conta foi alterada.

86 testes de infraestrutura passaram, incluindo isolamento da API de cliente,
autorizações/origem/confirmação dos comandos, auditoria antes de efeitos, SQL em
PGlite com grants, concorrência e revogação. TypeScript e ESLint passaram.
Prévia local com dados simulados conferida em computador e celular (390 px),
incluindo seleção de cliente, liberação explícita e confirmação desabilitada até
preenchimento. Nenhum vínculo real criado para testar.

Executor instalado como `connectyhub-hosting.service`, socket privado, coletas a
cada 30 segundos. GETs reais validaram inventário de Vision/Immov e bloquearam o
projeto compartilhado ConnectyHub. Testes Python cobrem propriedade, mounts
compartilhados, revisão, idempotência, retomada e falha. Durante o ensaio descartável,
Docker bloqueou consultas ao container que desligava: acompanhamento corrigido
para servir recibo persistido enquanto a ação está em andamento.

Ensaio descartável concluído: pausa, retomada com marcador do volume preservado e
política `always` restaurada, quarentena e exclusão do container, volume e diretório
de teste. Configuração temporária retirada, recibos preservados. Nove testes Python
passaram, incluindo consulta rápida ao recibo enquanto Docker desliga o container
e rejeição de propriedade duplicada entre projetos. Na conferência final, dois
containers de QA da Vision foram retirados do mapeamento de Immov.ai antes da
liberação da tela: Vision ficou com 394 containers (18 ativos) e Immov.ai com 15
(todos ativos). Nenhum vínculo de cliente estava habilitado durante essa revisão.
Nenhum serviço de cliente foi desligado ou excluído para homologar.

Em 13/10 às 09h15 BRT, aplicação `a4760fd4` publicada no slot b/3131; fallback
`504f191a` preservado no a/3130. Executor nativo atualizado para `78a47de9`, com
proteção adicional dos diretórios da plataforma mesmo sob outro nome de projeto.
Build de 120 páginas passou. Candidato e domínio público passaram: health/home/login
200, páginas protegidas 307 anônimo, APIs administrativas e de cliente 401 sem
sessão, Inngest exigindo assinatura e GET assinado 200 com 58 funções. Métricas
montadas read-only atuais, socket consultado com UID 1000 retornando 15 serviços
exclusivos de Immov.ai. Builder parado após a publicação.

O teste visual usou dados simulados localmente. Não houve sessão real de cliente
nem vínculo real para homologar; o titular determinou que essa escolha seja feita
pelo próprio administrador. Nenhum pagamento, mensagem ou job foi disparado.
