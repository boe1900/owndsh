#!/bin/sh
# [INPUT]: 依赖 Linux amd64 Docker、OpenSSL、Node/pnpm、锁定 release 与同级干净 Harness；可选复用 EAP_LOCAL_RELEASE_TARBALL。
# [OUTPUT]: 在全新临时状态中启动正式后端、安装企业 bundle 并启动一个使用真实系统浏览器的 Harness，持续到 Ctrl+C。
# [POS]: 人工功能验收的唯一启动入口，不运行 Playwright、候选 fixture、多设备控制面、截图或自动业务操作。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
harness_root="$project_root/../deepseek-harness"
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/enterprise-local-demo.XXXXXX")
state_directory="$temporary_root/state"
release_output="$temporary_root/release"
harness_log="$temporary_root/harness.log"
release_project="eap-local-$(date +%s)-$$"
harness_pid=
release_root=

fail() {
  printf '%s\n' "本地体验启动失败: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令 $1"
}

free_port() {
  node -e "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"
}

release_compose() {
  docker compose --env-file "$state_directory/runtime.env" \
    -f "$release_root/compose/compose.yml" "$@"
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -n "$harness_pid" ] && kill -0 "$harness_pid" 2>/dev/null; then
    kill -TERM "$harness_pid" 2>/dev/null || true
    wait "$harness_pid" 2>/dev/null || true
  fi
  if [ -n "$release_root" ] && [ -f "$state_directory/runtime.env" ]; then
    release_compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary_root"
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

for command in curl docker node corepack openssl tar; do require_command "$command"; done
[ "$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')" = linux/amd64 ] \
  || fail "Docker runtime 必须是 linux/amd64"
[ -d "$harness_root/.git" ] || fail "同级 deepseek-harness 不存在"
"$project_root/scripts/bootstrap-harness.sh" --check-only >/dev/null

mkdir -p "$temporary_root/certificates" "$release_output"
https_port=${EAP_LOCAL_HTTPS_PORT:-$(free_port)}
harness_port=${EAP_LOCAL_HARNESS_PORT:-$(free_port)}
for port in "$https_port" "$harness_port"; do
  case "$port" in ''|*[!0-9]*) fail "本地端口必须是数字" ;; esac
  [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || fail "本地端口必须在 1024..65535"
done
platform_origin="https://127.0.0.1:$https_port"

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=Enterprise Local Demo CA' \
  -keyout "$temporary_root/certificates/ca.key" \
  -out "$temporary_root/certificates/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 -subj '/CN=127.0.0.1' \
  -keyout "$temporary_root/certificates/tls.key" \
  -out "$temporary_root/certificates/tls.csr" >/dev/null 2>&1
printf '%s\n' 'subjectAltName=IP:127.0.0.1,DNS:localhost' 'extendedKeyUsage=serverAuth' \
  > "$temporary_root/certificates/tls.ext"
openssl x509 -req -days 2 -sha256 -in "$temporary_root/certificates/tls.csr" \
  -CA "$temporary_root/certificates/ca.crt" -CAkey "$temporary_root/certificates/ca.key" -CAcreateserial \
  -extfile "$temporary_root/certificates/tls.ext" -out "$temporary_root/certificates/tls.crt" >/dev/null 2>&1
chmod 600 "$temporary_root/certificates"/*.key

admin_initial_password=${EAP_LOCAL_ADMIN_INITIAL_PASSWORD:-CandidateBootstrap!42}
admin_password=${EAP_LOCAL_ADMIN_PASSWORD:-CandidateAdminReady!42}
printf '%s\n' "$admin_initial_password" > "$temporary_root/bootstrap-password"
chmod 600 "$temporary_root/bootstrap-password"

release_tarball=${EAP_LOCAL_RELEASE_TARBALL:-}
if [ -z "$release_tarball" ]; then
  "$project_root/deploy/scripts/build-release.sh" --version 0.1.0-local --output "$release_output"
  release_tarball="$release_output/enterprise-agent-platform-0.1.0-local-linux-amd64.tgz"
fi
[ -f "$release_tarball" ] || fail "release tarball 不存在: $release_tarball"
tar -xzf "$release_tarball" -C "$release_output"
release_root=$(find "$release_output" -mindepth 1 -maxdepth 1 -type d \
  -name 'enterprise-agent-platform-*-linux-amd64' | head -n 1)
[ -n "$release_root" ] || fail "release 根目录不存在"

COMPOSE_PROGRESS=quiet EAP_COMPOSE_PROJECT_NAME="$release_project" "$release_root/scripts/install.sh" \
  --state-dir "$state_directory" \
  --public-base-url "$platform_origin" \
  --admin-redirect-uri "$platform_origin/enterprise/auth/callback" \
  --bootstrap-admin candidate.admin \
  --bootstrap-password-file "$temporary_root/bootstrap-password" \
  --tls-cert "$temporary_root/certificates/tls.crt" \
  --tls-key "$temporary_root/certificates/tls.key" \
  --time-zone Asia/Shanghai \
  --https-port "$https_port"

bundle=$(find "$state_directory/harness" -type f -name '*.tgz' -print | head -n 1)
[ -n "$bundle" ] || fail "release 未包含 Harness bundle"
dsh_home="$temporary_root/dsh-home"
DSH_HOME="$dsh_home" corepack pnpm@11.7.0 --dir "$harness_root" dsh \
  plugin --profile web add --ignore-scripts "$bundle" >/dev/null
cp "$state_directory/harness/cordis.patch.yml" "$dsh_home/profiles/web/cordis.patch.yml"
chmod 600 "$dsh_home/profiles/web/cordis.patch.yml"

NODE_EXTRA_CA_CERTS="$temporary_root/certificates/ca.crt" DSH_HOME="$dsh_home" \
  corepack pnpm@11.7.0 --dir "$harness_root" dsh --profile web --port "$harness_port" \
  > "$harness_log" 2>&1 &
harness_pid=$!
attempt=0
while ! curl --fail --silent \
  "http://127.0.0.1:$harness_port/enterprise/api/v1/local/status" >/dev/null 2>&1; do
  kill -0 "$harness_pid" 2>/dev/null || fail "Harness 在就绪前退出；日志: $harness_log"
  attempt=$((attempt + 1))
  [ "$attempt" -lt 300 ] || fail "Harness 120 秒内未就绪；日志: $harness_log"
  sleep 0.4
done

printf '%s\n' \
  "本地人工验收环境已启动" \
  "管理端: $platform_origin" \
  "Harness: http://127.0.0.1:$harness_port" \
  "LOCAL 账号: candidate.admin" \
  "初始密码: $admin_initial_password" \
  "首次登录新密码: $admin_password" \
  "登录按钮会调用真实系统浏览器；首次访问平台需接受本地 CA。" \
  "按 Ctrl+C 停止并删除本次临时环境。"
wait "$harness_pid"
harness_pid=
