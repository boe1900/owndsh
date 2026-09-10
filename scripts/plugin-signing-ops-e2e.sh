#!/bin/sh
# [INPUT]: 依赖当前 Server/Console 镜像、插件 tgz、Docker 与真实 install/backup/restore 运维入口。
# [OUTPUT]: 验证默认无密钥和显式签名两种离线安装，以及 PostgreSQL/Redis/artifact/key 的真实备份恢复。
# [POS]: 签名开关的交付 E2E；每种模式使用独立 Compose/状态目录，退出时仅清理本次临时资源。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$project_root/deploy/scripts/common.sh"
ops_root=$(mktemp -d /tmp/owndsh-signing-ops.XXXXXX)
release_dir="$ops_root/release"
OWNDSH_STATE_DIR=

cleanup() {
  ops_status=$?
  trap - EXIT HUP INT TERM
  if [ -n "$OWNDSH_STATE_DIR" ] && [ -f "$OWNDSH_STATE_DIR/runtime.env" ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$ops_root"
  exit "$ops_status"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$release_dir/images" "$release_dir/harness"
cp -R "$project_root/deploy/compose" "$release_dir/compose"
cp -R "$project_root/deploy/scripts" "$release_dir/scripts"
cp "$project_root/artifacts/owndsh-plugin-0.1.0.tgz" "$release_dir/harness/"
ops_server_image=${OWNDSH_E2E_SERVER_IMAGE:-owndsh-server:signing-e2e-20260909}
ops_console_image=${OWNDSH_E2E_CONSOLE_IMAGE:-owndsh-console:signing-e2e-20260909}
docker image save "$ops_server_image" | gzip -1 > "$release_dir/images/server.tar.gz"
docker image save "$ops_console_image" | gzip -1 > "$release_dir/images/console.tar.gz"
cat > "$release_dir/manifest.env" <<EOF
OWNDSH_RELEASE_VERSION=signing-e2e
OWNDSH_SERVER_IMAGE=$ops_server_image
OWNDSH_CONSOLE_IMAGE=$ops_console_image
OWNDSH_HARNESS_BUNDLE=owndsh-plugin-0.1.0.tgz
EOF
(
  cd "$release_dir"
  find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort |
    while IFS= read -r ops_file; do sha256sum_compat "$ops_file"; done > SHA256SUMS
)
printf '%s\n' 'SigningOps!Initial123' > "$ops_root/bootstrap-password"
chmod 600 "$ops_root/bootstrap-password"

for ops_mode in unsigned signed; do
  OWNDSH_STATE_DIR="$ops_root/$ops_mode"
  ops_project="owndsh-signing-ops-$ops_mode-$$"
  ops_port=$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')
  set --
  if [ "$ops_mode" = signed ]; then set -- --enable-plugin-signing; fi
  OWNDSH_COMPOSE_PROJECT_NAME="$ops_project" "$release_dir/scripts/install.sh" \
    --state-dir "$OWNDSH_STATE_DIR" --public-base-url "http://127.0.0.1:$ops_port" \
    --bootstrap-admin signing.admin --bootstrap-password-file "$ops_root/bootstrap-password" \
    --http-port "$ops_port" "$@" >/dev/null
  if [ "$ops_mode" = unsigned ]; then
    [ "$(env_value ENT_PLUGIN_SIGNING_ENABLED "$(runtime_file)")" = false ]
    [ ! -e "$OWNDSH_STATE_DIR/secrets/plugin_signing_private_key" ]
    [ ! -e "$OWNDSH_STATE_DIR/secrets/plugin_signing_public_key" ]
    ! grep -q 'trustedPluginPublicKey\|verifyPluginSignatures' "$OWNDSH_STATE_DIR/harness/cordis.patch.yml"
  else
    [ "$(env_value ENT_PLUGIN_SIGNING_ENABLED "$(runtime_file)")" = true ]
    require_file "$OWNDSH_STATE_DIR/secrets/plugin_signing_private_key"
    require_file "$OWNDSH_STATE_DIR/secrets/plugin_signing_public_key"
    grep -q 'verifyPluginSignatures: true' "$OWNDSH_STATE_DIR/harness/cordis.patch.yml"
  fi
  printf 'PASS OPS-%s-INSTALL real installer and profile\n' "$ops_mode"

  ops_fingerprint=$(key_fingerprint)
  compose exec -T postgres psql -U owndsh -d owndsh -v ON_ERROR_STOP=1 -c \
    "create table signing_e2e_restore_probe (value text not null); insert into signing_e2e_restore_probe values ('before-backup')" >/dev/null
  compose exec -T redis sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli SET signing-e2e-restore-probe before-backup' >/dev/null
  compose exec -T server sh -ec 'printf before-backup > /var/lib/enterprise/artifacts/signing-e2e-restore-probe'
  "$project_root/deploy/scripts/backup.sh" --state-dir "$OWNDSH_STATE_DIR" \
    --data-output "$ops_root/$ops_mode-data" --key-output "$ops_root/$ops_mode-keys" >/dev/null
  ops_data=$(find "$ops_root/$ops_mode-data" -mindepth 1 -maxdepth 1 -type d)
  ops_keys=$(find "$ops_root/$ops_mode-keys" -mindepth 1 -maxdepth 1 -type d)
  ops_members=$(tar -tzf "$ops_keys/enterprise-keys.tar.gz" | LC_ALL=C sort)
  if [ "$ops_mode" = unsigned ]; then
    [ "$ops_members" = enterprise_master_key ]
  else
    [ "$ops_members" = "$(printf '%s\n' enterprise_master_key plugin_signing_private_key plugin_signing_public_key)" ]
    openssl genpkey -algorithm ED25519 -out "$OWNDSH_STATE_DIR/secrets/plugin_signing_private_key" >/dev/null 2>&1
    [ "$(key_fingerprint)" != "$ops_fingerprint" ]
  fi
  printf 'PASS OPS-%s-BACKUP isolated key archive\n' "$ops_mode"

  compose exec -T postgres psql -U owndsh -d owndsh -v ON_ERROR_STOP=1 -c \
    "update signing_e2e_restore_probe set value='after-backup'" >/dev/null
  compose exec -T redis sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli SET signing-e2e-restore-probe after-backup' >/dev/null
  compose exec -T server sh -ec 'rm /var/lib/enterprise/artifacts/signing-e2e-restore-probe'
  "$project_root/deploy/scripts/restore.sh" --state-dir "$OWNDSH_STATE_DIR" \
    --data-backup "$ops_data" --key-backup "$ops_keys" >/dev/null
  [ "$(compose exec -T postgres psql -U owndsh -d owndsh -Atc 'select value from signing_e2e_restore_probe')" = before-backup ]
  [ "$(compose exec -T redis sh -ec 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --raw GET signing-e2e-restore-probe')" = before-backup ]
  [ "$(compose exec -T server cat /var/lib/enterprise/artifacts/signing-e2e-restore-probe)" = before-backup ]
  [ "$(key_fingerprint)" = "$ops_fingerprint" ]
  printf 'PASS OPS-%s-RESTORE PostgreSQL + Redis + artifact + exact key fingerprint\n' "$ops_mode"
  compose down -v --remove-orphans >/dev/null 2>&1
  OWNDSH_STATE_DIR=
done
