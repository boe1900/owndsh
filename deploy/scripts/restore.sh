#!/bin/sh
# [INPUT]: 依赖已安装但可停机的目标、完整数据备份与独立 key 备份。
# [OUTPUT]: 恢复 PostgreSQL、Redis、artifact、master/signing key，把 Redis RDB 转为完整 AOF 后重新等待应用健康。
# [POS]: T21 灾难恢复入口；以 Redis 自身完成持久化格式转换，不恢复或更换目标域名的 TLS。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

usage() {
  printf '%s\n' "用法: $0 --state-dir DIR --data-backup DIR --key-backup DIR"
}

EAP_STATE_DIR=
data_backup=
key_backup=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) EAP_STATE_DIR=${2:-}; shift 2 ;;
    --data-backup) data_backup=${2:-}; shift 2 ;;
    --key-backup) key_backup=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

require_safe_path "$EAP_STATE_DIR"
require_file "$EAP_STATE_DIR/runtime.env"
require_file "$data_backup/SHA256SUMS"
require_file "$key_backup/SHA256SUMS"
require_command docker
require_command sha256sum
require_command tar
(
  cd "$data_backup"
  sha256sum -c SHA256SUMS >/dev/null
) || fail "数据备份校验失败"
(
  cd "$key_backup"
  sha256sum -c SHA256SUMS >/dev/null
) || fail "key 备份校验失败"
acquire_operation_lock

compose stop gateway server redis
temporary_keys=$(mktemp -d "${TMPDIR:-/tmp}/eap-keys.XXXXXX")
trap 'rm -rf "$temporary_keys"; rmdir "$EAP_STATE_DIR/.operation.lock" 2>/dev/null || true' EXIT HUP INT TERM
tar -C "$temporary_keys" -xzf "$key_backup/enterprise-keys.tar.gz"
for key_file in enterprise_master_key plugin_signing_private_key plugin_signing_public_key; do
  require_file "$temporary_keys/$key_file"
  cp "$temporary_keys/$key_file" "$EAP_STATE_DIR/secrets/$key_file"
  chmod 600 "$EAP_STATE_DIR/secrets/$key_file"
done

compose start postgres
wait_healthy postgres 45
compose exec -T postgres sh -ec 'export PGPASSWORD="$(cat /run/secrets/postgres_password)"; dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"; createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
compose exec -T postgres sh -ec 'export PGPASSWORD="$(cat /run/secrets/postgres_password)"; exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < "$data_backup/postgres.dump"

redis_volume=$(volume_for redis /data)
redis_image=$(docker inspect --format '{{.Image}}' "$(compose ps -aq redis)")
docker run --rm --platform linux/amd64 --user 0:0 \
  -v "$redis_volume:/data" -v "$data_backup:/restore:ro" \
  -v "$EAP_STATE_DIR/secrets/redis_password:/run/secrets/redis_password:ro" \
  --entrypoint sh "$redis_image" -ec '
    redis-check-rdb /restore/redis.rdb >/dev/null
    find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp /restore/redis.rdb /data/dump.rdb
    chown -R redis:redis /data

    password=$(cat /run/secrets/redis_password)
    umask 077
    printf "requirepass %s\n" "$password" > /tmp/redis-restore.conf
    chown redis:redis /tmp/redis-restore.conf
    gosu redis:redis redis-server /tmp/redis-restore.conf \
      --appendonly no --dir /data --dbfilename dump.rdb \
      --daemonize yes --pidfile /tmp/redis-restore.pid
    export REDISCLI_AUTH="$password"
    redis-cli PING >/dev/null
    redis-cli CONFIG SET appendonly yes >/dev/null

    attempt=0
    while [ "$attempt" -lt 60 ]; do
      persistence=$(redis-cli --raw INFO persistence | tr -d "\r")
      rewrite_in_progress=$(printf "%s\n" "$persistence" | sed -n "s/^aof_rewrite_in_progress://p")
      rewrite_status=$(printf "%s\n" "$persistence" | sed -n "s/^aof_last_bgrewrite_status://p")
      if [ -f /data/appendonlydir/appendonly.aof.manifest ] \
        && [ "$rewrite_in_progress" = 0 ] && [ "$rewrite_status" = ok ]; then
        break
      fi
      attempt=$((attempt + 1))
      sleep 1
    done
    [ -f /data/appendonlydir/appendonly.aof.manifest ] \
      && [ "$rewrite_in_progress" = 0 ] && [ "$rewrite_status" = ok ]
    redis-cli SHUTDOWN NOSAVE >/dev/null 2>&1 || true
  '

artifact_volume=$(volume_for server /var/lib/enterprise/artifacts)
server_image=$(env_value EAP_SERVER_IMAGE "$(runtime_file)")
docker run --rm --platform linux/amd64 --user 0:0 \
  -v "$artifact_volume:/target" -v "$data_backup:/restore:ro" \
  --entrypoint sh "$server_image" -ec 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -C /target -xzf /restore/artifacts.tar.gz; chown -R 10001:10001 /target'

compose up -d redis storage-init server gateway
wait_healthy redis 45
wait_healthy server 90
wait_healthy gateway 30
printf '%s\n' "恢复完成，应用与独立 key 归档均已验证"
