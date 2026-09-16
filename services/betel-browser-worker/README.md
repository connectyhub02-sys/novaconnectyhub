# Navegador isolado Betel

Definições de infraestrutura instaladas em 16/09/2026. Código e Dockerfile do
coletor pertencem ao projeto Betel, em `scripts/browser-worker` e
`Dockerfile.browser-worker`; não duplicar implementação aqui.

## Isolamento

- Imagem separada, Playwright 1.61.1/Chromium correspondente, usuário 1000:1000,
  `cap_drop: ALL`, `no-new-privileges`, raiz somente leitura, init, tmpfs limitado,
  1 CPU, 1 GiB sem swap, 256 PIDs e 256 MiB de memória compartilhada privada.
- Rede `betel-browser-egress`, 172.23.0.0/24, IPv6 desativado, sem porta publicada.
  App existente 172.22.0.2 acessa exclusivamente 172.23.0.2:3001. Banco não recebeu
  nova rede nem reinício. App já compartilha seu namespace de rede.
- Firewall aceita somente esse caminho e respostas estabelecidas, permite saída
  HTTPS pública e bloqueia host, redes privadas/reservadas e metadados. DNS usa
  o resolvedor interno Docker. Exceção raw específica permite atravessar as
  bridges sem remover os bloqueios do Docker para outras origens/portas.
- Token aleatório exclusivo, guardado em arquivos privados somente root; não
  versionado nem transmitido ao processo Chromium. Sem segredos DB/LLM no worker.
- Seccomp baseado no perfil oficial Playwright v1.61.1, SHA original
  `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.
  Acrescentado `chroot` sem condição CAP_SYS_CHROOT para o sandbox no namespace
  interno com capabilities removidas. As verificações do kernel permanecem;
  nenhum SYS_ADMIN, perfil unconfined ou alteração global de AppArmor/sysctl.
- Serviço systemd inicia após o firewall e reinicia em falha, no máximo três
  partidas em cinco minutos. Docker restart fica desligado para não iniciar
  antes da política de rede no boot. Não é um serviço CDP acessível remotamente.

## Estado e operação

Os arquivos deste diretório são referência versionada do estado aplicado,
não um instalador genérico. A configuração privada está em
`/opt/betel-isolated-rehearsal/browser-worker/compose.yml`, e o token em
`/opt/betel-isolated-rehearsal/secrets/browser-worker.json`.

Antes de mudança, verificar proprietário do diretório, imagem, atividade e
regras vigentes. Não substituir regras globais nem executar `compose down` no
stack da Betel. Para parar apenas este coletor, usar
`systemctl stop betel-browser-worker.service`. Para remover a integração do app,
retirar somente BETEL_BROWSER_WORKER_URL/TOKEN da configuração privada e
recriar apenas `app-production` com o procedimento e guard existentes.

O teste único Machado 14921 chegou ao servidor remoto, que respondeu HTTP403
com challenge. Portanto, instalação e isolamento validados não comprovam coleta
dos dados do imóvel. Não repetir testes externos ou habilitar proxy pago sem
escopo. Não resolver CAPTCHA nem importar challenge como descrição de imóvel.
