# Arquivos persistentes no R2

Implantação de 24/10/2026: Supabase Storage conserva API, metadados, RLS,
URLs e tickets; seu backend físico passa de `file` para `s3`/Cloudflare R2.
Não mover arquivos do PostgreSQL, Redis ou Inngest para um bucket montado como disco.

## Destinos

| Caminho | Destino físico |
|---|---|
| Mídia pública ConnectyHub | R2 público existente, sem alteração |
| Storage ConnectyHub: leads, Voz, Estúdio, entregáveis | `connectyhub-storage-private`, prefixo nativo `stub/` |
| Assets do relay do Estúdio | Mesmo bucket privado, `studio-relay/assets/<uuid>.audio` |
| Storage Vision | Conta R2 própria da Vision, bucket privado existente `vision-voice-private`, prefixo nativo `vision-demo/` |
| Mídia pública/voz Vision existente | Destinos R2 existentes, preservados |

O nome lógico do bucket Supabase e o caminho da aplicação continuam iguais.
O bucket R2 contém também o tenant e a versão; não copiar somente `bucket/name`.
As versões instaladas usam `/` antes da versão, não o separador opcional `-$v-`.
As credenciais da Vision continuam na conta e no bucket privado já utilizados
por ela. Não existe fallback de produção para payload local no relay.

## Configuração privada e migração

Scripts em `/opt/connectyhub/storage-r2`; estado em
`/var/lib/connectyhub-storage-r2` (700; arquivos privados 600).
`configure.py` salva configurações/inspect e dump do schema+dados de Storage antes
de alterar exclusivamente o serviço Storage. Recusa repetir sobre backup existente.
Credenciais em `storage-r2.env` junto do Compose, nunca no Git.

Variáveis do Storage: `STORAGE_BACKEND=s3`, `GLOBAL_S3_BUCKET`,
`GLOBAL_S3_ENDPOINT`, `GLOBAL_S3_FORCE_PATH_STYLE=true`,
`STORAGE_S3_REGION=auto`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`;
checksums opcionais do SDK configurados como `WHEN_REQUIRED` por compatibilidade.
`REGION` do protocolo de entrada, tenant, chaves JWT, RLS e banco são preservados.

`migrate.py` cruza todos os objetos do banco com arquivos físicos, preserva MIME
e cache-control, copia, baixa e verifica SHA-256. Arquivos sem referência,
multipart pendente, conflito remoto ou divergência interrompem a migração.
Fazer a cópia online e uma reconciliação com **somente Storage parado** antes
de recriar esse serviço. A reconciliação reutiliza verificações completas anteriores
apenas se conteúdo local e metadados remotos continuam idênticos. Não apaga fontes.

`verify.py` confere leitura dos objetos existentes por hash através da API,
upload sintético, acesso negado para anon/usuário sem vínculo, assinatura,
range e exclusão do objeto sintético. Confirma que novo payload existe no R2
e não no volume local. Não gera IA nem utiliza clientes em testes de escrita.

## Relay

Imagem publicada `connectyhub-ai-relay:r2-7f422cfb`, a partir do commit `7f422cfb`.
Configuração privada `/opt/connectyhub/ai-relay/studio-r2.env`:

```dotenv
STUDIO_R2_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
STUDIO_R2_BUCKET=connectyhub-storage-private
STUDIO_R2_ACCESS_KEY_ID=CONFIGURAR_PRIVADAMENTE
STUDIO_R2_SECRET_ACCESS_KEY=CONFIGURAR_PRIVADAMENTE
```

`STUDIO_ASSET_DIR` guarda apenas recibos novos; os áudios antigos ficam preservados
como cópia estática de segurança. R2 usa gravação condicional para não sobrescrever
um asset e download privado após consumo do ticket existente. Falha/resultado
incerto mantém recibo para conciliação, sem reenviar bytes ou declarar sucesso.
Ausência remota depois de escrita incerta não elimina automaticamente o recibo.
Processamento/decodificação continua em memória com limites existentes.

`migrate_relay.py` confere payloads contra tamanho/hash do banco e do R2;
recibos pendentes impedem a troca. `relay-canary.mjs` verifica a imagem candidata
com R2 real e controle sintético, incluindo todos os arquivos migrados. Conferir
sessões Live e uploads ativos antes de parar/recriar o relay. Nenhuma migration
de negócio, preço, cota ou cobrança foi alterada.

## Recuperação e limites

Originais de aproximadamente 229 MiB permanecem na VPS, sem receber novos uploads.
Não reativar simplesmente o backend `file` ou a imagem antiga: uploads realizados
depois da troca só estão no R2. Um retorno exige pausar escrita, reconciliar os
objetos atuais/versões para o destino local e só então mudar a configuração.
Não sobrescrever o banco com o dump anterior para fazer rollback de armazenamento.

R2 ativo não substitui backup independente contra exclusão de objetos. Não foi
adicionada expiração automática de arquivos de clientes. A política diária de
diagnósticos Inngest é independente e continua em `deploy/retention`.
Os provedores de IA podem manter cópias temporárias para processamento; uploads
Gemini já transitavam em memória para o provedor e não eram arquivos na VPS.
O portal de homologação independente tinha zero objetos e não foi alterado.

Referências oficiais: [backend S3 do Supabase](https://supabase.com/docs/guides/self-hosting/self-hosted-s3),
[operações condicionais R2](https://developers.cloudflare.com/r2/reference/consistency/).
