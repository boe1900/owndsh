#!/bin/sh
# [INPUT]: 依赖 POSIX shell、GNU sha256sum 或 macOS shasum、Docker Compose v2、runtime.env、release manifest 与安装状态目录。
# [OUTPUT]: 为 T21/T22 运维脚本提供可移植 SHA-256、单行输入约束、无 eval 环境读取、校验、锁、Compose 和健康等待函数。
# [POS]: deploy/scripts 的共享机制层；业务脚本决定事务顺序，本文件不读取或打印 secret 内容。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu

fail() {
  printf '%s\n' "错误: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

sha256_command() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s\n' sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s\n' shasum
  else
    fail "缺少 SHA-256 工具: sha256sum 或 shasum"
  fi
}

require_sha256() {
  sha256_command >/dev/null
}

sha256sum_compat() {
  case "$(sha256_command)" in
    sha256sum) sha256sum "$@" ;;
    shasum) LC_ALL=C LANG=C shasum -a 256 "$@" ;;
  esac
}

require_file() {
  [ -f "$1" ] || fail "缺少文件: $1"
}

require_single_line() {
  case "$1" in
    *'
'*) fail "$2不能包含换行" ;;
  esac
}

require_safe_path() {
  case "$1" in
    /*) ;;
    *) fail "状态目录必须是绝对路径: $1" ;;
  esac
  case "$1" in
    *[!A-Za-z0-9_./-]*) fail "状态目录只允许 ASCII 路径字符: $1" ;;
  esac
}

env_value() {
  key=$1
  file=$2
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

replace_env() {
  key=$1
  value=$2
  file=$3
  require_single_line "$value" "环境值"
  temporary="${file}.tmp.$$"
  awk -F= -v wanted="$key" '$1 != wanted { print }' "$file" > "$temporary"
  printf '%s=%s\n' "$key" "$value" >> "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$file"
}

release_root_for_script() {
  script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  CDPATH= cd -- "$script_directory/.." && pwd
}

verify_release() {
  release_root=$1
  require_file "$release_root/manifest.env"
  require_file "$release_root/SHA256SUMS"
  require_sha256
  (
    cd "$release_root"
    sha256sum_compat -c SHA256SUMS >/dev/null
  ) || fail "release 校验和不匹配"
}

runtime_file() {
  printf '%s/runtime.env\n' "$OWNDSH_STATE_DIR"
}

compose_file() {
  runtime=$(runtime_file)
  release=$(env_value OWNDSH_RELEASE_VERSION "$runtime")
  [ -n "$release" ] || fail "runtime.env 缺少 OWNDSH_RELEASE_VERSION"
  printf '%s/releases/%s/compose/compose.yml\n' "$OWNDSH_STATE_DIR" "$release"
}

compose() {
  runtime=$(runtime_file)
  docker compose --env-file "$runtime" -f "$(compose_file)" "$@"
}

acquire_operation_lock() {
  lock_directory="$OWNDSH_STATE_DIR/.operation.lock"
  mkdir "$lock_directory" 2>/dev/null || fail "另一个部署操作正在执行"
  trap 'rmdir "$lock_directory" 2>/dev/null || true' EXIT HUP INT TERM
}

wait_healthy() {
  service=$1
  attempts=${2:-60}
  count=0
  while [ "$count" -lt "$attempts" ]; do
    container=$(compose ps -q "$service")
    if [ -n "$container" ]; then
      status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")
      [ "$status" = healthy ] && return 0
      [ "$status" = exited ] && break
    fi
    count=$((count + 1))
    sleep 2
  done
  compose ps >&2 || true
  compose logs --tail 120 "$service" >&2 || true
  fail "$service 未在时限内健康"
}

load_image_archive() {
  archive=$1
  require_file "$archive"
  gzip -dc "$archive" | docker image load >/dev/null
}

volume_for() {
  service=$1
  destination=$2
  container=$(compose ps -aq "$service")
  [ -n "$container" ] || fail "找不到 $service 容器"
  docker inspect --format "{{range .Mounts}}{{if eq .Destination \"$destination\"}}{{.Name}}{{end}}{{end}}" "$container"
}

key_fingerprint() {
  (
    cd "$OWNDSH_STATE_DIR/secrets"
    sha256sum_compat enterprise_master_key plugin_signing_private_key plugin_signing_public_key
  ) | sha256sum_compat | awk '{print $1}'
}
