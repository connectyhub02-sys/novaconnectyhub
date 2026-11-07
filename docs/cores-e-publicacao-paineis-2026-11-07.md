# Cores e publicação dos painéis — 07/11/2026

O titular aprovou a reorganização e autorizou produção, solicitando antes uma paleta mais viva e discreta. A execução parte da revisão de produção `9c591dd04f257d1cbba108bb1dffc87b4a2cf6c5`, em checkout isolado `ConnectyHub-release-paineis`, branch `codex/panel-navigation-color-release`. As demais alterações locais ficam fora da publicação.

## Padrão aplicado

| Uso | Cor | Fundo suave |
| --- | --- | --- |
| Início e navegação | Azul `#2858C4` | `#EAF1FF` |
| Atendimento e clientes | Petróleo `#08757A` | `#E4F5F3` |
| Agentes e automações | Violeta `#7046B8` | `#F0EAFB` |
| Vendas e financeiro | Dourado `#895C19` | `#FBF1DC` |
| Conta e sistema | Azul acinzentado `#486485` | `#EBF0F7` |

Ícones do menu lateral, menu móvel e atalhos inferiores usam o mesmo mapa de áreas. A seleção conserva indicação explícita e as cores sempre acompanham rótulos/ícones. As áreas de automação ganham ícones, fundo suave e borda de seleção. O início ganha uma faixa clara e indicadores com destaque pequeno. Salvar no admin passa ao azul de ação principal; verde, âmbar e vermelho continuam sinalizando estados de sucesso, atenção e erro.

Tokens em `src/lib/ui/panel-theme.ts`; o tema fica restrito aos painéis autenticados. Não altera marcas das lojas ou conteúdo de clientes. A finalidade é melhorar orientação e hierarquia; não há promessa de efeito psicológico ou produtividade comprovada.

## Verificação

- 69 testes em oito arquivos passaram no checkout de release: contraste, navegação, salvamento e atendimento.
- ESLint dirigido aos 18 arquivos TypeScript de implementação passou.
- Todos os pares documentados de texto/fundo da paleta atendem ao teste de contraste 4,5:1. Isso não certifica acessibilidade integral da plataforma.
- Prévia com componentes reais e dados fictícios: cliente em 320/390 px e admin em 1440 px conferidos; sem rolagem horizontal nas telas observadas. Imagens e logs em `output/color-release-20261107/` no checkout principal.
- A publicação inclui o refinamento aprovado de início/atendimento, rascunhos, organização de menus e correção do salvamento, conforme os documentos anteriores.

## Operação

Publicação via `deploy/release.sh`: preparar slot inativo, conferir versão, páginas/assets, proteção das rotas e GET assinado Inngest; ativar somente após os checks. Sem migrations, mensagens, pagamentos ou novas inscrições Inngest. Manter o slot anterior para rollback. Resultado efetivo e SHA final serão registrados após a ativação.
