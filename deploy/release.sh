#!/usr/bin/env bash
# Run on the VPS. Credentials remain in /opt/connectyhub/app/config.
set -euo pipefail
ROOT=/opt/connectyhub/app
cd "$ROOT"
exec 9>"$ROOT/release.lock"
flock -n 9 || { echo 'Another release operation is running'; exit 1; }

health() {
  python3 - "$1" "$2" <<'PY'
import json, sys, urllib.request
with urllib.request.urlopen('http://127.0.0.1:'+sys.argv[1]+'/api/health', timeout=10) as r:
    data=json.load(r)
assert data.get('status') == 'ok' and data.get('version') == sys.argv[2], data
PY
}

case "${1:-}" in
prepare)
  SHA=${2:?Usage: release.sh prepare COMMIT ARCHIVE}
  ARCHIVE=${3:?Source archive required}
  [[ $SHA =~ ^[0-9a-f]{40}$ ]] || exit 2
  ACTIVE=$(cat active-slot 2>/dev/null || true)
  SLOT=a; PORT=3130
  if [[ $ACTIVE == a ]]; then SLOT=b; PORT=3131; fi
  RELEASE="$ROOT/releases/$SHA"
  IMAGE="connectyhub-app:$SHA"
  mkdir -p "$RELEASE"
  tar -xzf "$ARCHIVE" -C "$RELEASE"
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker buildx build --builder connectyhub-build \
      --secret id=build_env,src="$ROOT/config/build.env" \
      --tag "$IMAGE" --load "$RELEASE" >"$RELEASE/build.log" 2>&1 || {
        tail -60 "$RELEASE/build.log"; exit 1;
      }
  fi
  printf 'APP_IMAGE=%s\nAPP_SHA=%s\nAPP_PORT=%s\n' "$IMAGE" "$SHA" "$PORT" >"slot-$SLOT.env"
  docker compose -f compose.yaml --env-file "slot-$SLOT.env" -p "connectyhub-app-$SLOT" up -d --wait --wait-timeout 120
  health "$PORT" "$SHA"
  echo "Candidate ready in slot $SLOT, local port $PORT; inspect before activate."
  ;;
activate)
  SLOT=${2:?Usage: release.sh activate a_OR_b}
  [[ $SLOT == a || $SLOT == b ]] || exit 2
  set -a; source "slot-$SLOT.env"; set +a
  health "$APP_PORT" "$APP_SHA"
  BACKUP="$ROOT/releases/Caddyfile-$(date -u +%Y%m%dT%H%M%SZ).before"
  cp /opt/connectyhub/proxy/Caddyfile "$BACKUP"
  python3 - "$APP_PORT" <<'PY'
import pathlib,re,sys
p=pathlib.Path('/opt/connectyhub/proxy/Caddyfile')
text=p.read_text()
pattern=r'(\nwww\.connectyhub\.com\.br \{\n(?:[^\n]*\n)*?    reverse_proxy 127\.0\.0\.1:)313[01](\n)'
new,count=re.subn(pattern,lambda m:m[1]+sys.argv[1]+m[2],text)
assert count==1, 'Expected exactly one application upstream'
# Preserve inode of the bind-mounted Caddyfile.
p.write_text(new)
PY
  if ! docker exec connectyhub-proxy-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || \
     ! docker exec connectyhub-proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    cat "$BACKUP" >/opt/connectyhub/proxy/Caddyfile
    docker exec connectyhub-proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    exit 1
  fi
  if ! curl --fail --silent --show-error --resolve www.connectyhub.com.br:443:127.0.0.1 https://www.connectyhub.com.br/api/health | \
      python3 -c 'import json,os,sys; assert json.load(sys.stdin)["version"]==os.environ["APP_SHA"]'; then
    cat "$BACKUP" >/opt/connectyhub/proxy/Caddyfile
    docker exec connectyhub-proxy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    exit 1
  fi
  printf '%s\n' "$SLOT" >active-slot
  echo "Slot $SLOT active. Previous container retained for rollback and in-flight work."
  ;;
*) echo 'Usage: release.sh prepare COMMIT ARCHIVE | activate a_OR_b'; exit 2;;
esac
