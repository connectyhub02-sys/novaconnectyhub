# Publicação da ConnectyHub na VPS

O banco, filas, arquivos e credenciais não fazem parte da imagem. O build usa Node 24 e o ambiente de produção montado como segredo. O processo web roda como usuário sem privilégios, em porta local, atrás do Caddy.

Na VPS, os arquivos operacionais ficam em `/opt/connectyhub/app`: `compose.yaml`, `release.sh`, `config/production.env`, `config/build.env`, `slot-a.env`, `slot-b.env` e `active-slot`. Os dois arquivos de ambiente em `config` são privados, com modo 600. Nunca os adicionar ao Git.

Para publicar uma revisão **já commitada**, gerar um arquivo com `git archive --format=tar.gz --output=release.tar.gz <commit>`, transferir para a VPS com `scp` e executar:

```sh
bash /opt/connectyhub/app/release.sh prepare <SHA-completo> /caminho/release.tar.gz
```

O script compila com limites de recursos e inicia o slot que não está atendendo tráfego (3130 ou 3131). Não altera o domínio nem executa migrations. Conferir health, páginas, assets, autorização e GET assinado do Inngest. Não registrar um segundo app Inngest nem disparar mensagens ou pagamentos para testar a publicação.

Depois de validar o slot informado:

```sh
bash /opt/connectyhub/app/release.sh activate b
```

Substituir `b` por `a` quando esse for o candidato. A ativação valida/recarrega o Caddy e confere o SHA por HTTPS na origem. Se falhar, restaura a configuração anterior. O container anterior permanece disponível para retorno e requisições em curso. Para rollback, ativar o slot anterior pelo mesmo comando; **não restaurar banco** para desfazer um deploy de aplicação. Confirmar saúde e versão antes do retorno.

Uma nova preparação reutiliza o slot inativo, portanto encerra a possibilidade de retornar a essa imagem pelo slot até que ela seja novamente preparada. As imagens e arquivos de release anteriores continuam no servidor; não executar limpeza automática sem política de retenção.

Alterações de ambiente público exigem novo build. Preservar as chaves existentes de criptografia, assinatura e integração e a chave estável de Server Actions. Segredos não são argumentos do build. Logs: `docker compose -f /opt/connectyhub/app/compose.yaml --env-file /opt/connectyhub/app/slot-a.env -p connectyhub-app-a logs --tail 100`.

O fluxo é manual e versionado; um push no GitHub, sozinho, não executa este script. Integração contínua automática não foi configurada nesta migração.
