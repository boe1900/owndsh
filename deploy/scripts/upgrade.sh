#!/bin/sh
# [INPUT]: 依赖已安装状态、新 release、备份根目录和兼容的前向数据库 migration。
# [OUTPUT]: 在先生成数据/key 备份后切换新 Server/Console 镜像与待分发 Harness bundle，并保存上一组应用引用。
# [POS]: T21 前向升级事务；数据库 migration 不回退，失败后的应用降级由 rollback.sh 显式执行。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

usage() {
  printf '%s\n' "用法: $0 --state-dir DIR --backup-root DIR"
}

OWNDSH_STATE_DIR=
backup_root=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) OWNDSH_STATE_DIR=${2:-}; shift 2 ;;
    --backup-root) backup_root=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

require_safe_path "$OWNDSH_STATE_DIR"
require_file "$OWNDSH_STATE_DIR/runtime.env"
[ -n "$backup_root" ] || fail "必须提供 --backup-root"
release_root=$(release_root_for_script)
verify_release "$release_root"
require_command docker
require_sha256
acquire_operation_lock

new_release=$(env_value OWNDSH_RELEASE_VERSION "$release_root/manifest.env")
new_server=$(env_value OWNDSH_SERVER_IMAGE "$release_root/manifest.env")
new_console=$(env_value OWNDSH_CONSOLE_IMAGE "$release_root/manifest.env")
new_harness_bundle=$(env_value OWNDSH_HARNESS_BUNDLE "$release_root/manifest.env")
old_release=$(env_value OWNDSH_RELEASE_VERSION "$(runtime_file)")
[ "$new_release" != "$old_release" ] || fail "目标 release 与当前版本相同"
require_file "$release_root/harness/$new_harness_bundle"

mkdir -p "$backup_root/data" "$backup_root/keys"
OWNDSH_OPERATION_LOCK_HELD=1 "$script_directory/backup.sh" \
  --state-dir "$OWNDSH_STATE_DIR" --data-output "$backup_root/data" --key-output "$backup_root/keys"

rm -rf "$OWNDSH_STATE_DIR/releases/$new_release"
cp -R "$release_root" "$OWNDSH_STATE_DIR/releases/$new_release"
cp "$release_root/harness/$new_harness_bundle" "$OWNDSH_STATE_DIR/harness/$new_harness_bundle"
chmod 644 "$OWNDSH_STATE_DIR/harness/$new_harness_bundle"
load_image_archive "$release_root/images/server.tar.gz"
load_image_archive "$release_root/images/console.tar.gz"

cat > "$OWNDSH_STATE_DIR/rollback.env" <<EOF
OWNDSH_SERVER_IMAGE=$(env_value OWNDSH_SERVER_IMAGE "$(runtime_file)")
OWNDSH_CONSOLE_IMAGE=$(env_value OWNDSH_CONSOLE_IMAGE "$(runtime_file)")
OWNDSH_ROLLBACK_FROM_RELEASE=$old_release
EOF
chmod 600 "$OWNDSH_STATE_DIR/rollback.env"
replace_env OWNDSH_RELEASE_VERSION "$new_release" "$(runtime_file)"
replace_env OWNDSH_SERVER_IMAGE "$new_server" "$(runtime_file)"
replace_env OWNDSH_CONSOLE_IMAGE "$new_console" "$(runtime_file)"

compose up -d storage-init server console
wait_healthy server 90
wait_healthy console 30
printf '%s\n' "升级完成: $old_release -> $new_release"
printf '%s\n' "Harness bundle 已更新；请用官方 CLI 更新各 Harness/Desktop profile: $OWNDSH_STATE_DIR/harness/$new_harness_bundle"
