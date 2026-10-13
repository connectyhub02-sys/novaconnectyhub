# Mostradores de capacidade no Admin — 13/10/2026

Pedido do titular: indicadores como painel de carro, dentro do Admin da
ConnectyHub, mostrando recursos com folga/próximos/no limite e os sistemas e
serviços que consomem mais.

## Implementação

Área **Admin → Infraestrutura**, antes do inventário já existente. Mostradores
com ponteiro para disco, RAM e CPU, valores usados/disponíveis, faixas coloridas
com texto, horário da medição e tendência de até uma hora. Lista por sistema
com ordenação por atenção, maior CPU ou maior memória, cotas por serviço,
limitação por CPU e alertas com próximos passos. Nomes amigáveis aparecem
junto dos identificadores operacionais.

Escopo: capacidade física compartilhada da VPS e containers ativos. Disco é
total do host; não há detalhamento automático por pasta/banco nesta entrega.
Não mede créditos de IA, consumo financeiro por cliente, velocidade da rede,
requisições individuais ou experiência completa dos usuários. Alertas de
capacidade não comprovam causas de lentidão nem resultados de automações.

Coletor somente leitura instalado em `/opt/connectyhub/monitoring`, com timer
systemd de 30 s. Consulta `/proc`, filesystem e cgroups, sem credenciais de
aplicações, queries de negócio ou varreduras de disco frequentes. Escrita
atômica do JSON e histórico local limitado a 120 pontos. Até 67 containers
observados inicialmente; a lista é dinâmica.

App recebe apenas diretório de métricas sanitizadas, montado somente leitura.
Sem socket Docker ou acesso SSH no app. Endpoint
`GET /api/admin/infrastructure/capacity` exige sessão e administrador da
plataforma antes de ler o arquivo, sem cache público. Parser limita tamanho,
listas, campos, identificadores e números; erros não expõem arquivos privados.

Falha preserva última leitura com aviso; após 120 s os indicadores perdem
estado saudável. Falta de medição é desconhecida, nunca zero. Sessão revogada
ou expirada remove as métricas exibidas. Leitura de host independente da
leitura de containers. O monitor não limpa, reinicia nem ajusta limites.

## Validação e publicação

71 testes de infraestrutura e 4 testes Python passaram. Testes de autorização
cobrem 401/403 antes da leitura e resposta sem cache; testes de métricas cobrem
delta, reinício, CPU sem cota, dados antigos, valores inválidos e throttling.
Prévia local com snapshot real e transporte simulado: desktop 1440 px e celular
390 px, filtros, ordenação, expansão da lista, estado antigo sem verde, falha
preservando valores e 403 apagando dados. Sem overflow horizontal ou erro JS.

Coletor real confirmou 30 s entre amostras, 67 serviços, CPU/RAM/disco e formação
de histórico; isso ainda não comprova publicação da nova página administrativa.
Build e smoke do candidato/produção estão registrados abaixo.

### Publicado — 13/10/2026, 08h11 BRT

Commit `504f191a8424fcafbbdb6fe2993788776e45e7fa`, slot a/3130, confirmado
no health público após ativação pelo publicador. Slot b preservado com
`0fb345fe38f6f26cbf7489c5af95b73d5279f72c` para retorno. Build Linux completo
com webpack, TypeScript e 119 páginas concluído; TypeScript local e ESLint
também sem erros.

Candidato e produção: home/login/asset JS/health 200, Admin sem sessão 307,
endpoint de capacidade e API de conta sem sessão 401, Cache-Control no-store
no novo endpoint, Inngest sem assinatura 401 e assinado 200, autenticação
confirmada e 58 funções. App como usuário sem privilégios lê JSON do host;
montagem conferida `RW=false`. Snapshot em produção com 4 s de idade, 67
serviços, disco 94,67% e CPU 46,13% na amostra de ativação. Esses percentuais
mudam continuamente. Timer confirmado ativo; nenhum banco/cota/dado de cliente
foi alterado e nenhuma limpeza foi executada.

Conferência visual feita na prévia local com shell real, snapshot real e
transporte simulado. Navegador disponível para a verificação de produção estava
sem sessão, portanto a página autenticada real ainda requer conferência pelo
titular. Não foi criado login administrativo nem relaxada a autorização para
essa validação. A versão publicada preserva o acesso exclusivo ao Admin.

Instruções de instalação, interpretação e rollback em
[deploy/monitoring/README.md](../deploy/monitoring/README.md).
