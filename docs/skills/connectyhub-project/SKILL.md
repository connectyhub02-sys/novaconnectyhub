---
name: connectyhub-project
description: Trabalhar no projeto ConnectyHub com seu contexto de arquitetura, painéis, agentes WhatsApp, API de IA, créditos e operação em VPS. Use ao implementar, auditar, documentar ou operar a ConnectyHub e ao retomar seu desenvolvimento em um novo chat.
---

# ConnectyHub

## Entrada

Localize o checkout da ConnectyHub. Nesta máquina, o local conhecido é `C:/Users/conne/Documents/ConnectyHub`; em outro ambiente, use a raiz do repositório selecionado. Confirme o projeto pelo README e pelo remote antes de operar. Não aplique suas convenções a projetos de clientes independentes apenas porque também usam Supabase ou Inngest.

Leia `AGENTS.md`, `docs/contexto-projeto.md` e `docs/estado-operacional.md` no checkout. Esses arquivos versionados são a fonte mantida; esta skill não armazena uma segunda cópia do estado de produção. Leia os documentos e fontes do módulo relevante indicados no contexto. Não carregue todo o guia público de IA para uma alteração pequena.

Se o checkout não estiver disponível, informe a limitação e peça somente a localização necessária. Não suponha que um novo chat tenha acesso às sessões SSH, credenciais ou autorizações operacionais de chats anteriores.

## Decisões que orientam o trabalho

- A arquitetura registrada em setembro de 2026 mantém aplicação e handlers na Vercel, Supabase e Inngest na VPS Contabo e mídias no Cloudflare R2. Confirme o estado operacional antes de mudar qualquer destino; não recrie dependência do Cloud por seguir um tutorial padrão.
- Créditos do cliente e tokens/custos do provedor são unidades diferentes. Preserve carteira responsável, reserva, liquidação, idempotência e registro de consumo. Catálogo/documentação não comprovam disponibilidade, tarifa nem integração funcional.
- Um job Inngest `Completed` pode ter retornado um resultado funcional de falha ou ter encontrado fila vazia. Audite o resultado de negócio e a persistência, não só a cor do painel.
- Mantenha isolamento de organizações, projetos, arquivos e chaves. Um administrador acessando o painel de um cliente não equivale a um teste com as permissões reais desse cliente.
- Use as regras já centralizadas de entrega WhatsApp, avisos de conta, links rastreáveis e opt-out. Evite criar caminhos paralelos que não registrem a entrega no arquivo do lead.
- Ao trabalhar com agentes, aplique a diretriz de atendimento natural e resolutivo em `docs/contexto-projeto.md`: continuidade, respostas específicas e ações comprovadas. Não trate imitação enganosa de identidade humana como critério de qualidade; responda com transparência quando o lead perguntar se é IA.
- Instruções atuais do usuário prevalecem sobre esta skill. Discussão de uma possibilidade futura não autoriza instalação, cobrança ou mudança de produção. Não imponha aprovações extras para leituras, documentação ou trabalho reversível já autorizado.

## Verificação e continuidade

Para uma alteração, siga o caminho painel/endpoint → autorização → operação → banco/fila → consumo/entrega conforme o módulo. Verifique as migrations e configuração publicadas quando a conclusão depender delas. Escalone testes de acordo com o risco e use os testes existentes relevantes.

Separe no relato: implementado, publicado, observado em produção, confirmado pelo titular e ainda não testado. Não use teste simulado como prova de pagamento, envio externo, restauração integral ou acesso ao modelo do fornecedor.

Ao concluir mudança duradoura, atualize `docs/estado-operacional.md` com data, evidência, limite e próximo passo. Atualize `docs/contexto-projeto.md` quando arquitetura ou regra de negócio mudar. Preserve histórico em relatórios datados. Nunca grave senhas, tokens, chaves privadas, dumps ou conteúdo privado de clientes na skill, nos relatórios públicos ou no Git.

## Manutenção da skill

A cópia versionada fica em `docs/skills/connectyhub-project`; a instalação pessoal pode ficar em `$CODEX_HOME/skills/connectyhub-project`. Quando alterar as instruções desta skill, mantenha essas cópias sincronizadas. As referências ao contexto são resolvidas na raiz do checkout, não no diretório de instalação pessoal.
