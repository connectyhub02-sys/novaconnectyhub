# Relatório de continuidade — migração da ConnectyHub para VPS

**Data:** 28/09/2026. Estado da aplicação reconferido aproximadamente às 16h42, horário de Brasília. Documento preparado para compartilhar com o outro chat que está desenvolvendo alterações no sistema. Não contém senhas, tokens ou valores de variáveis privadas.

## 1. Resultado e orientação principal

A migração técnica foi concluída e autorizada pelo titular. A aplicação Next.js, incluindo páginas, painéis e handlers de API, saiu da Vercel e passou a rodar na VPS existente da Contabo. O DNS autoritativo saiu da Vercel e passou para a Cloudflare Free. O domínio continua registrado no Registro.br.

**A produção não deve mais ser publicada na Vercel. Push no GitHub, sozinho, não publica na VPS.** A integração Git da Vercel foi desconectada e o projeto antigo foi pausado. Não há proxy Vercel no caminho de produção.

O outro chat deve integrar as alterações atuais de `origin/master` antes de concluir seu trabalho, preservando suas próprias mudanças e resolvendo conflitos. Não substituir a infraestrutura nova por uma configuração antiga de deploy Vercel.

## 2. Arquitetura atual

| Componente | Situação após a migração |
| --- | --- |
| Domínio principal | `https://www.connectyhub.com.br`; domínio sem www redireciona para www |
| Registro do domínio | Registro.br, mantido |
| DNS | Cloudflare Free, registros em **DNS only**, sem proxy HTTP da Cloudflare |
| Servidor | VPS Contabo, IP `13.140.34.227`; alias SSH local `connectyhub-vps` |
| Aplicação | Next.js 16.3.2, React 19.2.4, Node 24, Docker standalone |
| Entrada HTTPS | Caddy, certificado Let's Encrypt com renovação automática |
| Banco, autenticação e Supabase Storage | Permaneceram na VPS; não foram transferidos novamente |
| Inngest | Continua self-hosted na VPS, com o mesmo app e as mesmas chaves/identidades |
| Relay de IA e Cloudflare R2 | Preservados nos destinos existentes |
| Vercel | Projeto antigo pausado, Git desconectado; assinatura Pro ainda sem cancelamento confirmado na última verificação |

A VPS é compartilhada com outros sistemas, incluindo Betel, Vision e Immov. Esses serviços foram preservados. Os registros de subdomínios da Betel foram copiados para manter o DNS existente: **nenhum dado da ConnectyHub foi transferido para a Betel**.

## 3. Versão efetivamente publicada

- **Commit em produção:** `25ebc41af75ff7dee71d063b6ab1ee3cea293414`.
- **Imagem:** `connectyhub-app:25ebc41af75ff7dee71d063b6ab1ee3cea293414`.
- **Slot ativo:** `b`, container `connectyhub-app-b-app-1`, porta local `127.0.0.1:3131`.
- **Reserva para retorno:** slot `a`, container `connectyhub-app-a-app-1`, porta local `127.0.0.1:3130`, imagem inicial `fdf2dd198220b9498d8f68cd82beb30040018374`.
- Ambos os containers estavam saudáveis na reconferência deste relatório. O endpoint público `/api/health` confirmou o commit acima.
- O Git contém commits posteriores de documentação. Isso é esperado: **HEAD do repositório e versão do runtime não são necessariamente iguais**.

Cada container da aplicação tem limite de 2 CPUs e 4 GiB, executa sem usuário root, possui healthcheck, reinício automático e rotação de logs. As portas 3130/3131 estão vinculadas ao localhost, atrás do Caddy.

## 4. O que foi alterado e preservado

### Código e publicação

- Adicionados `Dockerfile` e `.dockerignore` para build e execução standalone.
- Ativado `output: "standalone"` em `next.config.ts`, preservando as demais configurações.
- Ajustado `package-lock.json` para instalação consistente das dependências opcionais no Linux. O primeiro build revelou a necessidade desse ajuste.
- Adicionados `deploy/compose.yaml`, `deploy/release.sh` e `deploy/README.md` para preparar, verificar, ativar e reverter releases.
- A imagem inclui os assets, arquivos públicos e migrations SQL necessários às rotas de infraestrutura. Incluir migrations na imagem **não significa executá-las**.
- Mantido `VERCEL_GIT_COMMIT_SHA` como metadado de compatibilidade, ao lado de `CONNECTYHUB_BUILD_SHA`; esse nome não representa dependência da hospedagem Vercel.

### Ambiente, DNS e operação

- Recuperadas as 40 variáveis Production da Vercel. O runtime recebeu também uma chave estável de Server Actions, totalizando 41 variáveis de ambiente recuperadas/configuradas, além dos parâmetros operacionais do Compose.
- Preservadas as chaves existentes de criptografia, assinatura e integrações; os valores foram comparados byte a byte.
- Segredos ficam fora do Git, em `/opt/connectyhub/app/config/production.env` e `build.env`, com permissão restrita. O build usa montagem de segredo; a imagem final não contém `.env` na raiz.
- A rota temporária de exportação cifrada de ambiente foi removida e a resposta 404 foi verificada. Não restaurar o commit temporário isoladamente.
- Recriados 16 registros DNS na Cloudflare, preservando serviços e registros de e-mail: MX, SPF, DKIM e DMARC.
- Nameservers do Registro.br alterados para `kiki.ns.cloudflare.com` e `newt.ns.cloudflare.com`; delegação no `.br` e ativação na Cloudflare foram verificadas.
- Configurados HTTPS automático, logs do Caddy com rotação e exclusão de informações sensíveis de requisição, e backup das configurações de publicação.
- Atualizado apenas o cadastro operacional `infra_projects.connectyhub.topology`, de `vercel` para `vps`, com cópia prévia.
- **Não houve restauração de banco nem execução de migration de negócio nesta migração.**

### Correção posterior: favicon

O titular identificou que a aba mostrava o triângulo da Vercel. A causa era `src/app/favicon.ico`, ainda com o ícone padrão, apesar de os PNGs já serem da ConnectyHub. O ICO foi recriado a partir do ícone existente da marca, em múltiplas resoluções, e publicado na VPS. O endereço gerado do favicon mudou, evitando reutilização da referência antiga em cache.

## 5. Verificações realizadas e limites

- Build Linux, checagem TypeScript e geração das 109 páginas estáticas concluídos.
- Na migração, 13 testes existentes de autenticação, streaming e webhooks passaram.
- Health, site, login e documentação responderam; assets foram conferidos. Na release do favicon, os 20 assets da tela de login responderam corretamente.
- Redirecionamento das páginas protegidas sem sessão e resposta 401 de API protegida conferidos.
- Consulta ao banco pelo container e health de autenticação retornaram sucesso.
- Dashboard autenticado carregou com a sessão existente; conexão do navegador diretamente à VPS foi confirmada. O titular também confirmou que o painel abriu normalmente.
- GET assinado do Inngest autenticou e mostrou as mesmas 51 funções observadas no diagnóstico. Requisições POST reais passaram a chegar à aplicação na VPS.
- A amostra observada não apresentou erro HTTP 5xx. Execuções `Completed` do Inngest não comprovam, isoladamente, entrega de mensagem ou pagamento.
- Alternância entre slots e retorno foram testados. A última ativação foi a do slot b com o favicon corrigido.
- Hash do favicon público e versão pública foram comparados com a release esperada.

Não foram testados todos os papéis de usuário nem todos os fluxos externos. Não se provocaram pagamentos ou mensagens reais apenas para validar a migração. O titular percebeu navegação mais rápida, mas não foi feito benchmark comparativo.

## 6. Como o outro chat deve preparar e publicar alterações

1. Ler `AGENTS.md`, `docs/contexto-projeto.md`, `docs/estado-operacional.md` e `deploy/README.md`. Consultar os guias locais da versão instalada do Next.js antes de alterar código relevante.
2. Atualizar a base com `origin/master`, preservando o trabalho em andamento. Não sobrescrever as alterações de Docker, standalone, publicador ou favicon.
3. Implementar e verificar a mudança. Novas migrations devem ser avaliadas separadamente; o publicador não as aplica.
4. Commitar a revisão a publicar e gerar um arquivo de fonte pelo SHA completo:

   ```sh
   git archive --format=tar.gz --output=release.tar.gz <SHA-completo>
   ```

5. Transferir o arquivo para a VPS por um canal autorizado e preparar a release:

   ```sh
   bash /opt/connectyhub/app/release.sh prepare <SHA-completo> /caminho/release.tar.gz
   ```

6. O script identifica o slot inativo, compila a imagem e sobe o candidato. Verificar o resultado antes de ativar: health/versão, páginas e assets, autorização e Inngest assinado, conforme o alcance da mudança.
7. Ativar **o slot informado pelo prepare**, sem assumir que será sempre o mesmo:

   ```sh
   bash /opt/connectyhub/app/release.sh activate <a-ou-b>
   ```

8. Confirmar o health público e o fluxo alterado. Atualizar o estado operacional. Após terminar o build, o builder pode ser parado para liberar recursos:

   ```sh
   docker buildx stop connectyhub-build
   ```

Na situação registrada aqui, b está ativo e uma nova preparação usaria a. **Conferir `/opt/connectyhub/app/active-slot` novamente no momento da publicação.** Uma preparação substitui o conteúdo do slot inativo; não há retorno ilimitado por slots.

Para rollback, ativar o slot anterior saudável pelo mesmo script. Não restaurar um dump de banco para desfazer apenas um deploy de aplicação. O container anterior permanece disponível após ativação para retorno e requisições em andamento.

O chat em cloud não deve presumir que possui o alias SSH, os arquivos privados ou as sessões deste computador. Se não tiver acesso à VPS, deve entregar o commit e as instruções de publicação, indicando claramente que a alteração **ainda não foi publicada**. Não recorrer à Vercel como alternativa de deploy.

## 7. Backups e recuperação

- Backup realizado: `/var/backups/connectyhub/connectyhub-20260928T163530Z.tar.gz`, aproximadamente 1,59 GB.
- Cópia desse backup preservada em armazenamento privado local fora da VPS; SHA-256 comparado e idêntico.
- Configuração pós-migração também foi copiada e conferida.
- Backup diário passou a incluir configurações e publicador da aplicação.
- Não houve ensaio integral de restauração nesta execução.
- Caddy: `/opt/connectyhub/proxy/Caddyfile`; aplicação/publicador: `/opt/connectyhub/app`.
- Log de acesso do Caddy: `/data/connectyhub-access.json`, no volume persistente do container.

Os dados privados, credenciais e dumps não acompanham este relatório e não devem ser adicionados ao repositório ou colados em outro chat.

## 8. Pendências que o outro chat precisa conhecer

1. **Cobrança Vercel:** três tentativas de downgrade não persistiram; a última consulta mostrou Pro vencido e nenhum cancelamento agendado. Após autorização explícita, foi aberto [chamado para cancelamento do Pro e renovação automática](https://vercel.com/nova-connectyhub-s-projects/~/support/cases/01YlRNbqjB4WT19w). O último estado observado foi Open, aguardando atendimento humano. A migração não confirma cancelamento nem interrupção de débitos. O titular informou que cuidará dessa parte. Nenhum pagamento, cancelamento de cartão ou exclusão da conta foi feito por este chat.
2. **Relato no celular:** depois da correção do favicon, o titular mencionou uma pesquisa que não funcionava no celular. Ainda não esclareceu se o site não abre ou se uma pesquisa interna falha. A conferência pública mostrou domínio/apex/login/health respondendo e A apontando à VPS, sem AAAA. Não foi reproduzido nem corrigido um defeito específico de celular; não atribuir causa ao DNS sem evidência.
3. **Operação futura:** pipeline automático de publicação e monitoramento externo ainda não foram configurados.
4. **Recursos antigos da Vercel:** não foram encontrados stores na tela Storage; há duas integrações antigas do Inngest, preservadas. Uma exibia Hobby gratuito e zero eventos/execuções no período. O runtime atual usa a VPS. Histórico completo de logs/deployments da Vercel não foi exportado. Guardar faturas e protocolo antes de eventual exclusão da conta.
5. **Trabalho concorrente:** alterações de negócio em outro chat não foram incorporadas automaticamente. Havia mudanças e arquivos locais preexistentes, preservados e fora dos commits desta tarefa. Reconciliar branches sem `reset --hard`, limpeza indiscriminada ou push forçado.

## 9. Commits de referência

| Commit | Conteúdo |
| --- | --- |
| `b78d7776` | Pacote Docker/standalone para a VPS |
| `fdf2dd19` | Correção do lockfile para Linux; primeira imagem em produção na VPS |
| `01474e9d` | Publicador e rollback por slots |
| `b31df418`, `39a1c4f3` | Registro da migração, aceite e pausa da hospedagem antiga |
| `ccf7d12d` | Registro do chamado autorizado de cancelamento |
| `33cd0339` | Conferência final dos recursos Vercel |
| `25ebc41a` | Correção do favicon; versão publicada atual |
| `663fdccb` | Registro operacional da publicação do favicon |

Os commits temporários de transferência cifrada foram `04fe524d` e sua remoção `c2e8abcb`. A funcionalidade temporária não existe na versão atual; não restaurá-la.

## 10. Documentos mantidos no repositório

- [Estado operacional](estado-operacional.md): estado verificado, evidências e pendências.
- [Contexto do projeto](contexto-projeto.md): arquitetura e decisões para continuidade.
- [Procedimento de publicação](../deploy/README.md): operação das releases na VPS.
- [Plano e registro detalhado da migração](plano-migracao-vercel-vps-2026-09-28.md): diagnóstico inicial e execução; as partes históricas não representam a topologia atual.

**Ponto de partida para o outro chat:** continuar o desenvolvimento sobre a base atualizada do GitHub, preservar a hospedagem na VPS e tratar código commitado, código publicado e comportamento efetivamente testado como estados distintos.
