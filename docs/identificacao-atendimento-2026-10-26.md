# Identificação dos contatos na Central de Atendimento — 26/10/2026

O titular confirmou a cobrança da recarga e o envio do aviso ao cliente, mas a
Central de Atendimento mostrava o contato como `WhatsApp` + últimos dígitos.
Verificação: o arquivo criado pelo transporte de saída não tinha nome do lead;
o cadastro da conta usado pelo aviso continha o nome. Fotos do provedor também
podiam aparecer quebradas. O selo `lead respondeu` considerava o status `new`,
mesmo quando só havia mensagens de saída.

## Correção

Migration 0218 fornece uma consulta somente de leitura, exclusiva de service_role,
para nomes de contatos do arquivo WhatsApp interno da plataforma. Exige vínculo
entre entrega arquivada, aviso enviado, remetente efetivo e telefone de destino.
Nome do titular só entra quando seu telefone cadastrado coincide com o destinatário;
responsável de agente usa seu próprio nome registrado no aviso. Associações entre
mais de uma conta ou com nomes conflitantes não recebem identidade presumida.
Não consulta clientes arbitrários pelo telefone nem extrai nomes do corpo das mensagens.

Central de Atendimento usa o nome CRM existente primeiro, incluindo rótulos de
empresa válidos; nome cadastrado verificado é fallback antes de apelidos do provedor.
Formulários Meta mantêm seu nome original. A lógica de identidade pessoal de cobrança
permanece separada. Lista, cabeçalho e contexto usam o mesmo registro resolvido.
Leads, mensagens, consentimentos e financeiro não são regravados por essa consulta.

Fotos indisponíveis de leads e agentes mostram iniciais. Nova URL válida volta a
ser exibida; o componente não insiste na mesma URL que falhou. O selo de resposta
agora depende de mensagem de entrada, não da classificação de contato novo. Isso
não implementa um recibo de leitura individual por operador.

## Verificações

114 testes distintos aprovados em sete arquivos: isolamento e vínculos do RPC em
PostgreSQL/PGlite, nomes cadastrados, histórico, Meta, identificação e notificações,
além de ausência do falso selo em contato novo com somente saída. TypeScript e
ESLint aprovados. Prévia local com as funções reais de avatar confirmou queda para
iniciais após 404 e exibição de imagem ao receber uma URL nova válida.

Backup privado de schema espelhado com SHA-256 conferido. Ensaio com ROLLBACK e
aplicação da migration 0218; leitura conferiu sete contatos identificáveis no
arquivo interno. RPC indisponível a anon/authenticated. Nenhuma cobrança, envio
WhatsApp ou alteração de nome no banco foi realizada para testar.

Publicado `04314db0` no slot a às 18h42 BRT, com `eda1eebf` preservado no b.
Build de 120 páginas e smoke no candidato/domínio público aprovados: versão,
páginas, 19 assets, APIs de atendimento admin 403/cliente 401 sem sessão e GET
assinado do Inngest com 59 funções. Navegador autenticado confirmou Andre Sampaio
na lista/cabeçalho/contexto, Magno Gomes na lista, iniciais no lugar das imagens
quebradas e ausência de `lead respondeu` nesses contatos de saída. A conversa com
mensagem de entrada continuou com seu indicador. Histórico de cinco mensagens
do aviso permaneceu disponível; nenhum botão de envio ou tomada de atendimento foi acionado.
