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

Ícones do menu lateral, menu móvel e atalhos inferiores usam o mesmo mapa de áreas. A seleção conserva indicação explícita e as cores sempre acompanham rótulos/ícones. As áreas de automação ganham ícones, fundo suave e borda de seleção. Após a correção de direção do titular, o fundo da plataforma é branco, o texto principal é preto e o texto auxiliar usa contraste forte. O logotipo do painel aparece azul, sem o filtro antigo que o deixava cinza/preto. Não há faixa em degradê no início; as cores ficam concentradas nos ícones e estados de seleção. Salvar no admin passa ao azul de ação principal; verde, âmbar e vermelho continuam sinalizando estados de sucesso, atenção e erro.

Tokens em `src/lib/ui/panel-theme.ts`; o tema fica restrito aos painéis autenticados. Não altera marcas das lojas ou conteúdo de clientes. A finalidade é melhorar orientação e hierarquia; não há promessa de efeito psicológico ou produtividade comprovada.

## Verificação

- 69 testes em oito arquivos passaram no checkout de release: contraste, navegação, salvamento e atendimento.
- ESLint dirigido aos 18 arquivos TypeScript de implementação passou.
- Todos os pares documentados de texto/fundo da paleta atendem ao teste de contraste 4,5:1. Isso não certifica acessibilidade integral da plataforma.
- Prévia com componentes reais e dados fictícios: cliente em 320/390 px e admin em 1440 px conferidos; sem rolagem horizontal nas telas observadas. Imagens e logs em `output/color-release-20261107/` no checkout principal.
- A publicação inclui o refinamento aprovado de início/atendimento, rascunhos, organização de menus e correção do salvamento, conforme os documentos anteriores.

## Operação

Publicação via `deploy/release.sh`: preparar slot inativo, conferir versão, páginas/assets, proteção das rotas e GET assinado Inngest; ativar somente após os checks. Sem migrations, mensagens, pagamentos ou novas inscrições Inngest. Manter o slot anterior para rollback. Resultado efetivo e SHA final serão registrados após a ativação.

A primeira compilação candidata `37e0e679` foi cancelada sem ativação após o titular solicitar fundo branco e texto preto. A revisão `3fb7961c360c6213f62d52a62ef89814e152b468` incorpora essa decisão antes da publicação.

Conferência adicional: fundo calculado `rgb(255,255,255)` e título `rgb(0,0,0)` no cliente em 390 px e no admin em 320 px, sem rolagem horizontal. A área de conexões sociais também foi conferida em 390 px. Cinco testes existentes de contraste/navegação passaram novamente após a revisão branca.

## Resultado da publicação

**PUBLICADO** em 07/11/2026: `3fb7961c360c6213f62d52a62ef89814e152b468`, slot b. Build completo aprovado na VPS. Health público confirmou SHA; smoke do candidato e público aprovados, incluindo 19 assets, proteções de acesso e GET assinado Inngest com 59 funções. Slot a (`9c591dd0`) permanece disponível para rollback pelo script de release.

Cliente autenticado conferido em produção: início e automações, fundo branco real, título preto real, logotipo azul, seis objetivos e ausência de overflow em 390 px. Sem erros de console na leitura final. Admin validado localmente; sessão administrativa real não estava disponível. Nenhuma edição de automação ou envio real foi usado como teste. Evidências: `production-build.log`, `candidate-smoke.json`, `production-smoke.json`, `validation.json`, `producao-cliente-desktop.png` e `producao-automacoes-390.png` em `output/color-release-20261107/`.
