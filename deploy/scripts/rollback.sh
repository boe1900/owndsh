#!/bin/sh
# [INPUT]: 依赖 upgrade 保存的 rollback.env、当前 Compose 与仍在本机的上一组应用镜像。
# [OUTPUT]: 切回上一 release 的 Server/Console 镜像、Compose 指针与待分发 Harness bundle，并校验数据卷和 key 未变化。
# [POS]: T21 应用回滚边界；禁止 down -v、数据库 restore、migration undo 或 key 替换。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

OWNDSH_STATE_DIR=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) OWNDSH_STATE_DIR=${2:-}; shift 2 ;;
    *) printf '%s\n' "用法: $0 --state-dir DIR" >&2; exit 2 ;;
  esac
done

require_safe_path "$OWNDSH_STATE_DIR"
require_file "$OWNDSH_STATE_DIR/runtime.env"
require_file "$OWNDSH_STATE_DIR/rollback.env"
require_command docker
require_sha256
acquire_operation_lock

old_server=$(env_value OWNDSH_SERVER_IMAGE "$OWNDSH_STATE_DIR/rollback.env")
old_console=$(env_value OWNDSH_CONSOLE_IMAGE "$OWNDSH_STATE_DIR/rollback.env")
old_release=$(env_value OWNDSH_ROLLBACK_FROM_RELEASE "$OWNDSH_STATE_DIR/rollback.env")
[ -n "$old_server" ] && [ -n "$old_console" ] && [ -n "$old_release" ] || fail "rollback.env 不完整"
require_file "$OWNDSH_STATE_DIR/releases/$old_release/compose/compose.yml"
old_harness_bundle=$(env_value OWNDSH_HARNESS_BUNDLE "$OWNDSH_STATE_DIR/releases/$old_release/manifest.env")
require_file "$OWNDSH_STATE_DIR/releases/$old_release/harness/$old_harness_bundle"
docker image inspect "$old_server" >/dev/null 2>&1 || fail "上一 Server 镜像不在本机"
docker image inspect "$old_console" >/dev/null 2>&1 || fail "上一 Console 镜像不在本机"

postgres_volume=$(volume_for postgres /var/lib/postgresql/data)
redis_volume=$(volume_for redis /data)
artifact_volume=$(volume_for server /var/lib/enterprise/artifacts)
before_keys=$(key_fingerprint)
replace_env OWNDSH_RELEASE_VERSION "$old_release" "$(runtime_file)"
replace_env OWNDSH_SERVER_IMAGE "$old_server" "$(runtime_file)"
replace_env OWNDSH_CONSOLE_IMAGE "$old_console" "$(runtime_file)"
cp "$OWNDSH_STATE_DIR/releases/$old_release/harness/$old_harness_bundle" "$OWNDSH_STATE_DIR/harness/$old_harness_bundle"
chmod 644 "$OWNDSH_STATE_DIR/harness/$old_harness_bundle"
compose up -d storage-init server console
wait_healthy server 90
wait_healthy console 30

[ "$postgres_volume" = "$(volume_for postgres /var/lib/postgresql/data)" ] || fail "回滚改变了 PostgreSQL 卷"
[ "$redis_volume" = "$(volume_for redis /data)" ] || fail "回滚改变了 Redis 卷"
[ "$artifact_volume" = "$(volume_for server /var/lib/enterprise/artifacts)" ] || fail "回滚改变了 artifact 卷"
[ "$before_keys" = "$(key_fingerprint)" ] || fail "回滚改变了 key"
printf '%s\n' "应用镜像回滚完成；数据库、Redis、artifact 与 key 保持原位"
printf '%s\n' "Harness bundle 已回退；请用官方 CLI 更新各 Harness/Desktop profile: $OWNDSH_STATE_DIR/harness/$old_harness_bundle"
