# Refinamento dos painéis — entrega local para avaliação

Data: 07/11/2026. Escopo autorizado: navegação, início e atendimento do cliente e administrador; isolamento de rascunhos; padrão de cores compartilhado. Sem publicação, push ou envio real de mensagens.

## Como testar

Abra http://127.0.0.1:8767 no computador em que o projeto está aberto. A página inicial apresenta os quatro fluxos e a amostra da paleta. O servidor está limitado ao loopback deste computador.

- Cliente: `/dashboard` e `/dashboard/atendimento`.
- Administrador: `/admin` e `/admin/whatsapp/atendimento`.
- Color grid e componentes compartilhados: `/paleta`.
- Amostra adicional da paleta em módulo existente: `/dashboard/redes-sociais/contas`.

A prévia compila os componentes reais do repositório com fixtures fictícias. Usa adaptações locais de Link/router e respostas de API simuladas. Não lê credenciais nem encaminha chamadas à produção. As demais rotas mantêm seus destinos, mas não estão implementadas nesse host de prévia. O botão de envio simula sucesso; mensagens contendo `[erro]` simulam falha. Notificações são simuladas como não suportadas somente na entrada da prévia. O código da aplicação mantém sua exigência de notificações.

Para reiniciar a prévia a partir da raiz do repositório:

```powershell
node output/panel-refinement-20261107/preview.cjs
```

Para reconstruí-la sem iniciar outro servidor:

```powershell
node output/panel-refinement-20261107/preview.cjs --build-only
```

O script usa o esbuild que já estava disponível no cache local. Não adicionou dependências ao aplicativo. Para testar o aplicativo Next completo, o comando normal continua sendo `npm run dev`; esse modo usa a configuração real do projeto e não faz parte da simulação isolada.

## Alterações

1. Navegação agrupada por tarefa. Busca aceita acentos/capitalização diferentes e aliases como “atender”. Busca do desktop abre o mesmo menu funcional. A transformação recebe apenas links já permitidos e preserva metadados, bloqueios e destinos.
2. Início com três indicadores reais, próximos passos e atalhos. Relatórios completos ficam recolhidos e abrem automaticamente quando o endereço aponta para uma âncora interna. Dados indisponíveis continuam sinalizados fora do bloco recolhido.
3. Atendimento compartilhado: lista compacta, busca acessível, Todas/Não lidas e filtros adicionais; conversa em foco no celular; campo de resposta na mesma linha do envio; identificação explícita do destinatário; detalhes agrupados; sacola/contexto opcionais no desktop. “Não lidas” mantém o significado do sinal existente, não foi transformado em uma contagem de clientes aguardando resposta.
4. Rascunhos em memória por escopo, empresa, canal e conversa. Alternar entre conversas preserva cada texto; falha não apaga o rascunho; sucesso limpa apenas a versão enviada da conversa correspondente. Avisos de envio também são isolados. Recarregar ou sair da página descarta esses rascunhos; persistência entre sessões não foi implementada.
5. Conversa selecionada refletida na URL. Voltar pelo navegador ou pelo cabeçalho retorna à lista mantendo os filtros em memória. Link para conversa fora do conjunto carregado mostra estado indisponível; não abre silenciosamente outro contato.
6. Tema central em `src/lib/ui/panel-theme.ts`: fundos, texto, ação, estados e gráficos. Tokens semânticos alimentam o shell, componentes e variáveis já existentes. Ponte de compatibilidade harmoniza as famílias Tailwind usadas pelos módulos. Cards compartilhados deixam de ter faixas e brilho coloridos decorativos. Cores específicas em imagens, conteúdo de clientes e estilos locais excepcionais não foram substituídas indiscriminadamente.

## Referências de design

- [Radix Colors](https://github.com/radix-ui/colors), MIT: referência de escalas por finalidade. [Uso dos passos da escala](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale).
- [shadcn/ui — theming](https://ui.shadcn.com/docs/theming): tokens semânticos e pares de fundo/texto, compatíveis com a base existente.
- [Impeccable — colorize](https://github.com/pbakaus/impeccable/blob/main/skill/reference/colorize.md): candidato para futuras revisões orientadas de cor. Não foi instalado ou executado.

A paleta implementada é uma seleção própria da ConnectyHub, centralizada no tema. Radix Colors foi consultado como referência; não foi instalado como dependência.

## Evidências de validação

- `npm run build`: sucesso, incluindo TypeScript e geração das rotas.
- ESLint nos 12 arquivos de implementação alterados/adicionados: sem erros ou avisos.
- 33 testes passaram em 7 arquivos: rascunhos, navegação, contraste da paleta, histórico, rotas, mídia e notificações do atendimento. Cópias antigas de testes em `tmp/` foram excluídas da execução direcionada; a primeira busca por nomes também as encontrou e falhou nessas cópias, enquanto os testes atuais passaram.
- No navegador local: cliente e admin, busca do menu sem acento, busca por atendimento, texto vazio na segunda conversa, recuperação do primeiro rascunho, falha e sucesso simulados, volta nativa, filtros preservados, detalhes recolhidos, contexto lateral no desktop e âncora de aprovações abrindo relatórios.
- Inspeção de cores computadas no grid e botão de outro módulo: fundo azul `#3156D3` com texto branco. Todos os nove pares documentados de texto/fundo passaram no teste de contraste mínimo 4,5:1. Isso não equivale a uma certificação de acessibilidade de todas as páginas.

| Observação local | Resultado |
| --- | --- |
| Cliente, 360 × 640 | Histórico 441 px; lista cerca de 296 px; linha cerca de 79 px |
| Admin, 360 × 640 | Histórico 441 px; lista cerca de 234 px |
| Admin, 390 × 844 | Histórico 645 px |
| Cliente, 320 × 640 | Conversa sem transbordamento horizontal; filtro preservado ao voltar |
| Admin, 1440 × 1000 | Lista/conversa simultâneas e contexto opcional; sem transbordamento horizontal |
| Contas sociais, 320 × 640 | Sem transbordamento horizontal; ação principal com contraste correto |

As medidas são da prévia com fixtures, não da sessão de produção. A auditoria anterior registrou 43 px de histórico no cliente e 32 px no admin em 360 × 640; banners, dados e estados reais podem alterar as medidas.

Capturas e logs: `output/panel-refinement-20261107/`. Backups dos arquivos no início desta tarefa estão em `baseline/` com extensão `.bak`, incluindo as alterações que já existiam no shell. Não usar `git restore` indiscriminadamente: há trabalho anterior não relacionado na árvore.

## Pendências antes da publicação

- Avaliação visual do usuário nesta prévia.
- Testar Next autenticado em homologação com as duas permissões, incluindo links diretos, expiração de sessão, dados reais e políticas de notificações.
- Testar teclado virtual, safe areas e orientação em aparelho Android/iPhone real. O viewport do Chrome não reproduz todo o comportamento do telefone.
- Validar integrações e envio real em conta de teste apropriada; nenhum envio foi feito nesta tarefa.
- A base de cores alcança os dois shells e componentes compartilhados. Não houve inspeção visual exaustiva das 78 rotas inventariadas; estilos específicos de módulos ainda podem exigir ajuste durante a homologação.

Nenhuma alteração foi publicada. O build local e a prévia não comprovam funcionamento em produção.
