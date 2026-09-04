#!/bin/sh
# [INPUT]: 依赖健康安装、PostgreSQL/Redis/artifact 持久事实及两个不同的备份目标目录。
# [OUTPUT]: 生成数据库/Redis/artifact 数据归档和独立 master/signing key 归档，各带 SHA-256 清单。
# [POS]: T21 正式备份入口；普通数据备份绝不包含 key，调用方必须把 key 归档异地保管。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

usage() {
  printf '%s\n' "用法: $0 --state-dir DIR --data-output DIR --key-output DIR"
}

OWNDSH_STATE_DIR=
data_output=
key_output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) OWNDSH_STATE_DIR=${2:-}; shift 2 ;;
    --data-output) data_output=${2:-}; shift 2 ;;
    --key-output) key_output=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

require_safe_path "$OWNDSH_STATE_DIR"
require_file "$OWNDSH_STATE_DIR/runtime.env"
[ -n "$data_output" ] && [ -n "$key_output" ] || fail "必须分别提供 data/key 输出目录"
data_output=$(mkdir -p "$data_output" && CDPATH= cd -- "$data_output" && pwd)
key_output=$(mkdir -p "$key_output" && CDPATH= cd -- "$key_output" && pwd)
[ "$data_output" != "$key_output" ] || fail "普通数据与 key 备份目录必须分离"
require_command docker
require_sha256
require_command tar
if [ "${OWNDSH_OPERATION_LOCK_HELD:-0}" != 1 ]; then
  acquire_operation_lock
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
data_backup="$data_output/$timestamp"
key_backup="$key_output/$timestamp"
mkdir -p "$data_backup" "$key_backup"
chmod 700 "$data_backup" "$key_backup"

compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$data_backup/postgres.dump"
compose exec -T redis sh -ec 'export REDISCLI_AUTH="$REDIS_PASSWORD"; redis-cli SAVE >/dev/null'
redis_container=$(compose ps -q redis)
docker cp "$redis_container:/data/dump.rdb" "$data_backup/redis.rdb"

artifact_volume=$(volume_for server /var/lib/enterprise/artifacts)
server_image=$(env_value OWNDSH_SERVER_IMAGE "$(runtime_file)")
docker run --rm --platform linux/amd64 --user 0:0 \
  -v "$artifact_volume:/source:ro" -v "$data_backup:/backup" \
  --entrypoint sh "$server_image" -ec 'tar -C /source -czf /backup/artifacts.tar.gz .'

cp "$(runtime_file)" "$data_backup/runtime.env"
cat > "$data_backup/backup.env" <<EOF
OWNDSH_BACKUP_FORMAT=1
OWNDSH_BACKUP_CREATED_AT=$timestamp
OWNDSH_RELEASE_VERSION=$(env_value OWNDSH_RELEASE_VERSION "$(runtime_file)")
EOF
(
  cd "$data_backup"
  sha256sum_compat postgres.dump redis.rdb artifacts.tar.gz runtime.env backup.env > SHA256SUMS
)

tar -C "$OWNDSH_STATE_DIR/secrets" -czf "$key_backup/enterprise-keys.tar.gz" \
  enterprise_master_key plugin_signing_private_key plugin_signing_public_key
(
  cd "$key_backup"
  sha256sum_compat enterprise-keys.tar.gz > SHA256SUMS
)
chmod 600 "$data_backup"/* "$key_backup"/*
printf '%s\n' "数据备份: $data_backup"
printf '%s\n' "独立 key 备份: $key_backup"
