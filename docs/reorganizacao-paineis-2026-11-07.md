# Reorganização dos painéis — entrega local de 07/11/2026

Implementação autorizada após a auditoria de arquitetura e navegação. Preparada para avaliação local; **sem publicação, push, ativação de automações ou alteração de dados de produção**. Complementa o [refinamento de início e atendimento](refinamento-paineis-2026-11-07.md) e a [auditoria de navegação](auditoria-arquitetura-navegacao-2026-11-07.md).

## O que mudou

- Navegação compartilhada dos dois painéis organizada por tarefas, com grupos recolhíveis, nomes mais curtos, busca pelos nomes antigos e até quatro favoritos no menu móvel. Os links continuam respeitando os itens autorizados recebidos pelo shell.
- Cliente: Início, Atendimento, Vendas, Divulgação, Automações, Conta e Ferramentas. Admin: Início, Clientes, Operação, Comercial, Divulgação, Financeiro, Sistema e Conta.
- Atalhos entre canais de atendimento nos dois painéis; ficam ocultos quando uma conversa ocupa a tela móvel. Conta, conexões e financeiro recebem atalhos de contexto quando autorizados.
- Automações do cliente por objetivo: retomar conversas, comentários/Direct, grupos/status, avisos de pedidos, agenda/lembretes e ofertas/benefícios. Agenda e ofertas apontam para suas configurações existentes.
- Automações da plataforma divididas em Relacionamento, Cobrança e renovação e Histórico e eventos. Resumos, diagrama e opções avançadas podem ser recolhidos. O editor abre como criação quando não há fluxos.
- Trocar de seção mantém seus componentes montados e preserva o rascunho. Links com fragmento e o botão Voltar do navegador funcionam entre seções.
- Mantido o sistema de cores e componentes do refinamento anterior. Esta entrega reorganiza as áreas e reduz a densidade inicial no celular.

## Correção do salvamento

O formulário de avisos de pedidos enviava também configurações do catálogo. Agora usa `save_automation_settings`, limitado a `messageTemplates` e `automationSettings`. O servidor mantém aparência da loja, pagamentos, agente comercial, ofertas e propriedades desconhecidas já persistidas. O salvamento geral do catálogo também herda campos omitidos.

Ambos os editores enviam `expectedUpdatedAt`. O servidor confere a revisão e condiciona o UPDATE à mesma revisão no banco; uma edição concorrente retorna HTTP 409 e mantém o texto no editor. O primeiro salvamento recebe ID determinístico por empresa para evitar duplicação entre chamadas desta rotina. Uma configuração criada apenas pelas automações mantém `configured: false` para não declarar a loja configurada.

Autorização por empresa e controles existentes continuam no endpoint. Não há migration nesta correção. A proteção foi implementada nestes dois editores e na rotina compartilhada; não equivale a controle global de concorrência de todos os escritores do banco. Em caso de conflito, copie o rascunho desejado antes de recarregar e compare com a versão atual; não há fusão automática das alterações.

## Como testar a prévia

Abra **http://127.0.0.1:8768/** no computador em que o servidor está rodando. A página reúne início, atendimento, automações dos dois painéis, navegação e paleta. A prévia usa componentes reais, dados fictícios e respostas simuladas, com servidor restrito ao loopback. Este endereço não abre diretamente em outro telefone.

Se precisar reabrir, na raiz do projeto:

```powershell
node output/reorganizacao-paineis-20261107/preview.cjs
```

1. No menu móvel, procure também pelos nomes antigos e marque/desmarque favoritos. Confira grupos, rótulos e os atalhos inferiores de cada papel.
2. No cliente, abra Avisos de pedidos, escreva uma mensagem, troque de seção e de empresa e retorne. O rascunho deve continuar associado à empresa correta.
3. Abra a mesma automação em duas abas. Salve em uma e tente salvar a versão antiga na outra: deve aparecer o conflito, mantendo o texto digitado. Esse ensaio no navegador usa persistência simulada local.
4. No admin, escreva o nome de um fluxo, vá para Cobrança e renovação e volte pelo navegador. Confira a permanência do rascunho e a separação das configurações.
5. Nos dois atendimentos, abra uma conversa e volte à lista. Confira espaço do editor e troca entre canais. Na prévia, `[erro]` simula falha de envio sem mensagem externa.

## Verificação e evidências

| Verificação | Resultado |
| --- | --- |
| Quatro arquivos de testes focados | 12 testes aprovados |
| Handler real de salvamento, com banco simulado | Preservação de campos, revisão antiga, corrida no UPDATE, autorização, revisão ausente e primeiro registro cobertos |
| ESLint dos dez arquivos TypeScript alterados nesta etapa | Aprovado |
| `npm run build` | Aprovado, incluindo TypeScript |
| Cliente/admin em larguras móveis 320–390 px | Sem rolagem horizontal nas telas verificadas |
| Admin em 1440 px | Navegação agrupada e editor conferidos, sem erros de console na leitura final |
| Rascunhos e conflito em duas abas | Comportamento observado na prévia simulada |

Logs e imagens ficam em `output/reorganizacao-paineis-20261107/`: `tests.log`, `lint.log`, `build.log`, `cliente-390.png`, `admin-390.png` e `admin-desktop.png`. A pasta `baseline` conserva os arquivos anteriores a esta etapa, inclusive alterações locais já existentes.

## Limites e próximos critérios de liberação

A prévia não testa autenticação, SQL real, WhatsApp, pagamentos ou execução dos jobs. Nem todas as páginas do inventário foram abertas nesta etapa. O menu é compartilhado pelo sistema, mas os motores e editores de cada automação continuam separados conforme suas responsabilidades. Não houve reescrita/consolidação dos 58 jobs inventariados, nem mudança automática de regras financeiras ou de envio.

Antes de publicar: conferir salvamento com conta de homologação e banco de homologação, permissões dos dois papéis e teclado/toque em telefone físico; revisar visualmente as páginas secundárias não representadas na prévia. O posicionamento do menu parte da auditoria e das tarefas do produto; a pequena amostra de uso disponível não comprova quais itens são os mais usados por toda a base.
