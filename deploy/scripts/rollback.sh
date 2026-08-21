#!/bin/sh
# [INPUT]: 依赖 upgrade 保存的 rollback.env、当前 Compose 与仍在本机的上一组应用镜像。
# [OUTPUT]: 只切回 Server/Gateway 镜像，并校验数据卷身份与 master/signing key 指纹未变化。
# [POS]: T21 应用回滚边界；禁止 down -v、数据库 restore、migration undo 或 key 替换。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

EAP_STATE_DIR=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) EAP_STATE_DIR=${2:-}; shift 2 ;;
    *) printf '%s\n' "用法: $0 --state-dir DIR" >&2; exit 2 ;;
  esac
done

require_safe_path "$EAP_STATE_DIR"
require_file "$EAP_STATE_DIR/runtime.env"
require_file "$EAP_STATE_DIR/rollback.env"
require_command docker
require_sha256
acquire_operation_lock

old_server=$(env_value EAP_SERVER_IMAGE "$EAP_STATE_DIR/rollback.env")
old_gateway=$(env_value EAP_GATEWAY_IMAGE "$EAP_STATE_DIR/rollback.env")
[ -n "$old_server" ] && [ -n "$old_gateway" ] || fail "rollback.env 不完整"
docker image inspect "$old_server" >/dev/null 2>&1 || fail "上一 Server 镜像不在本机"
docker image inspect "$old_gateway" >/dev/null 2>&1 || fail "上一 Gateway 镜像不在本机"

postgres_volume=$(volume_for postgres /var/lib/postgresql/data)
redis_volume=$(volume_for redis /data)
artifact_volume=$(volume_for server /var/lib/enterprise/artifacts)
before_keys=$(key_fingerprint)
replace_env EAP_SERVER_IMAGE "$old_server" "$(runtime_file)"
replace_env EAP_GATEWAY_IMAGE "$old_gateway" "$(runtime_file)"
compose up -d storage-init server gateway
wait_healthy server 90
wait_healthy gateway 30

[ "$postgres_volume" = "$(volume_for postgres /var/lib/postgresql/data)" ] || fail "回滚改变了 PostgreSQL 卷"
[ "$redis_volume" = "$(volume_for redis /data)" ] || fail "回滚改变了 Redis 卷"
[ "$artifact_volume" = "$(volume_for server /var/lib/enterprise/artifacts)" ] || fail "回滚改变了 artifact 卷"
[ "$before_keys" = "$(key_fingerprint)" ] || fail "回滚改变了 key"
printf '%s\n' "应用镜像回滚完成；数据库、Redis、artifact 与 key 保持原位"
