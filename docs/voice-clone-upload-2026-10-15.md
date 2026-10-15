# Clonagem de voz — seleção e ação visíveis — 15/10/2026

Relato: no Estúdio de Voz, o cliente via somente a quantidade de gravações e o
texto “Clonar voz”, sem aparência de botão. A regra global do painel substituía
o fundo `bg-slate-900` por branco. A seleção local não iniciava o upload: o envio
multipart já dependia de clicar no botão.

## Correção

- Ação primária com a classe semântica `ch-action`, azul e texto branco.
- Cada gravação mostra nome, tamanho, player local e remoção; a tela informa
  explicitamente que o envio começa em “Clonar voz”. Object URLs são liberadas.
- Validação antecipada de 1–5 arquivos, soma de até 3 MiB, MIME e arquivo vazio,
  mantendo os mesmos limites já impostos no servidor.
- Motivo do bloqueio, progresso e resultado junto ao botão. Nome, arquivos e
  consentimento ficam bloqueados durante a requisição. Falha mantém a chave de
  idempotência; duplo acionamento simultâneo é impedido.
- Sucesso orienta a ouvir a prévia incluída ou usar a voz. Verificação exigida
  pelo fornecedor não é apresentada como voz pronta. Trocar projeto reinicia o
  formulário, evitando reaproveitar amostras/chave em outra empresa/projeto.
- Nenhuma alteração em tarifas, credenciais, isolamento ou API de clonagem.

## Validação

- ESLint do componente aprovado com dependências isoladas e lock vigente.
- `voice-contract` e `voice-isolation`: 5 testes aprovados.
- Navegador com componente real e API simulada: desktop 1440px, celular 390px,
  contraste computado do botão, player, consentimento, limites, remoção, progresso,
  erro seguido de repetição com a mesma chave e sucesso atualizando Minhas vozes.
- Evidências locais: `.codex-screens/voice-clone-desktop-20261015.png` e
  `.codex-screens/voice-clone-mobile-20261015.png`.
- A instalação principal tinha arquivos ausentes do Next; as verificações locais
  usaram instalação separada em `tmp/voice-check-env`, sem trocar dependências do
  projeto. A página temporária de teste não integra o commit nem a release.
- Commit de aplicação: `4018290037cdf702116c5ba745e165cc67550819`.

## Publicação

Publicado no slot b/3131 da VPS em 15/10/2026, aproximadamente 20h20 BRT.
Build, TypeScript e páginas estáticas aprovados. Candidato e domínio HTTPS:
health com SHA correto, login e 19 assets HTTP 200; Estúdio redireciona visitantes
sem sessão para login; APIs de voz retornam 401 sem sessão. Rota temporária de
teste retorna 404. Inngest GET assinado: 200, autenticação confirmada, 58 funções.
Rollback preservado no slot a (`2e3f3ef8`). Sem migrations ou env novos.

Nenhuma voz real foi clonada neste teste e nenhuma gravação do cliente foi enviada.
A confirmação de qualidade da voz depende da clonagem iniciada pelo titular.
