# Exclusão de responsáveis do agente — 12/10/2026

## Causa e correção

O titular informou que responsáveis removidos no modal do agente Max da Pizzaria
Macedo&Dias reapareciam. A lista explícita era salva, mas o leitor juntava essa
lista aos campos legados (responsável singular e números do comportamento).
O salvamento do comportamento também fazia união com os números anteriores.

`readAgentResponsibleHumans` agora trata a lista explícita como fonte definitiva,
inclusive vazia; os campos antigos são fallback apenas para agentes sem lista.
`mergeResponsibleHumansIntoBehaviorConfig` substitui os destinatários pelos
responsáveis atuais, sem reincorporar números antigos. Mantém múltiplos contatos,
adição posterior, deduplicação e compatibilidade com agentes legados. O formulário
continua exigindo ao menos um responsável. A regra central vale para admin e clientes.

## Verificação

- 50 testes direcionados aprovados, incluindo excluir/salvar/reabrir, comportamento
  antigo reenviado, lista vazia, nomes camelCase, legado e múltiplos responsáveis.
- TypeScript e ESLint aprovados.
- Uma verificação ampliada teve 63 aprovações e uma falha preexistente em
  `whatsapp-standard-behavior-location.test.ts`: delimitador textual da antiga aba
  `channels` removida em trabalho anterior. O teste e o componente consultado estão
  idênticos ao HEAD anterior; não foram alterados para esta correção.
- Leitura real confirmou Max com um contato salvo (Eliane Dias), mas três números
  na configuração antiga. Sincronização pontual preservou a lista escolhida e todos
  os demais campos. PATCH condicionado ao ID/organização e metadata anterior
  protegeu contra edição concorrente. Backup privado:
  `/opt/connectyhub/app/config/max-responsibles-before-20261012.json`.
- Nova leitura confirmou um responsável e um destinatário, sem números legados
  adicionais. Nenhum aviso ou mensagem de teste foi enviado.
- Editor real conferido no Chrome em acesso administrativo assistido à pizzaria:
  Max com somente Eliane Dias e botão Adicionar disponível. Evidência local:
  `output/agent-responsibles-20261012/max-um-responsavel.png`. A verificação visual
  ocorreu após o reparo pontual; o fluxo geral de exclusão/recarga é coberto pelos
  testes. Não cadastramos contatos fictícios na operação real.

## Publicação

Publicado em 12/10/2026 19h39 BRT: `53592f1116feac2ed36f9c7b4c7a2a401c06e502`,
slot b/3131; fallback `fa3d4781990c629fe45b0f282dad97889576089b`, slot a/3130.
Build aprovado. Candidato e domínio público: health/SHA corretos, login/JS 200,
GET/PATCH de agentes sem sessão 401. Inngest assinado 200, 58 funções, autenticado.
Builder parado após publicação.

Uma edição durante a compilação na versão anterior repôs um número no comportamento,
mantendo a lista canônica com somente Eliane. Após ativação, repetimos a sincronização
condicionada ao registro anterior, com novo backup privado de sufixo `-1939.json`.
Nova leitura confirmou um contato e um destinatário. A versão agora ativa impede
essa união dos números antigos em salvamentos posteriores.
