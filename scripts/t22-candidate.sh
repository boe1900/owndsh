#!/bin/sh
# [INPUT]: 依赖 Linux amd64 Docker、OpenSSL/Java/Node/pnpm、锁定 fixture/release/Harness、审计员 migration seed 与全新临时状态目录。
# [OUTPUT]: 构建并安装候选 release，预置最小 auditor 后以隔离 Compose project 自动执行 14 步 Playwright/Harness 验收、失败取证、可选人工暂停并生成无密钥 GIF。
# [POS]: T22 候选版唯一动态入口；只清理自身 project/volume/临时目录，绝不修改同级 Harness 或复用生产状态。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
fixture_compose="$project_root/admin-web/e2e/fixtures/compose.yml"
release_overlay="$project_root/admin-web/e2e/fixtures/compose.release.yml"
auditor_seed="$project_root/admin-web/e2e/fixtures/candidate-auditor.sql"
harness_root="$project_root/../deepseek-harness"
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/enterprise-t22-candidate.XXXXXX")
release_project="eap-t22-release-$(date +%s)-$$"
fixture_project="eap-t22-fixture-$(date +%s)-$$"
state_directory="$temporary_root/state"
logs_directory="$temporary_root/logs"
certificates="$temporary_root/certificates"
plugin_artifacts="$temporary_root/plugins"
release_output="$temporary_root/release"
harness_log="$logs_directory/harness.log"
harness_pid=
release_root=

fail() {
  printf '%s\n' "T22 候选验收失败: $*" >&2
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
    -f "$release_root/compose/compose.yml" -f "$release_overlay" "$@"
}

release_compose_base() {
  docker compose --env-file "$state_directory/runtime.env" \
    -f "$release_root/compose/compose.yml" "$@"
}

fixture_compose_command() {
  docker compose -p "$fixture_project" -f "$fixture_compose" "$@"
}

capture_compose_logs() {
  if [ -n "$release_root" ] && [ -f "$state_directory/runtime.env" ]; then
    for service in postgres redis server gateway; do
      release_compose logs --no-color "$service" > "$logs_directory/$service.log" 2>&1 || true
    done
  fi
  fixture_compose_command logs --no-color > "$logs_directory/fixtures.log" 2>&1 || true
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -n "$harness_pid" ] && kill -0 "$harness_pid" 2>/dev/null; then
    kill -TERM "$harness_pid" 2>/dev/null || true
    wait "$harness_pid" 2>/dev/null || true
  fi
  if [ "$status" -ne 0 ]; then
    capture_compose_logs
  fi
  if [ -n "$release_root" ] && [ -f "$state_directory/runtime.env" ]; then
    release_compose_base down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  fixture_compose_command down -v --remove-orphans >/dev/null 2>&1 || true
  if [ "${EAP_T22_KEEP:-0}" = 1 ]; then
    printf '%s\n' "T22 临时证据保留于: $temporary_root"
  else
    rm -rf "$temporary_root"
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

for command in curl docker node corepack openssl strings tar ffmpeg; do require_command "$command"; done
[ "$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')" = linux/amd64 ] \
  || fail "Docker runtime 必须是 linux/amd64"
[ -d "$harness_root/.git" ] || fail "同级 deepseek-harness 不存在"
"$project_root/scripts/bootstrap-harness.sh" --check-only >/dev/null

java_home=${JAVA_HOME:-/usr/local/opt/openjdk@21}
keytool="$java_home/bin/keytool"
[ -x "$keytool" ] || fail "缺少 Java 21 keytool"
mkdir -p "$logs_directory" "$certificates/platform" "$certificates/idp" \
  "$certificates/ldap" "$plugin_artifacts" "$release_output"

https_port=${EAP_T22_HTTPS_PORT:-$(free_port)}
fixture_port=${EAP_T22_FIXTURE_PORT:-$(free_port)}
ldap_port=${EAP_T22_LDAP_PORT:-$(free_port)}
platform_origin="https://127.0.0.1:$https_port"
idp_origin="https://candidate-idp.localhost:$fixture_port"

# 每组信任根独立，避免候选 IdP、LDAP 和平台 TLS 在测试中共享一个万能 CA。
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=EAP T22 Platform CA' \
  -keyout "$certificates/platform/ca.key" -out "$certificates/platform/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 -subj '/CN=127.0.0.1' \
  -keyout "$certificates/platform/tls.key" -out "$certificates/platform/tls.csr" >/dev/null 2>&1
printf '%s\n' 'subjectAltName=IP:127.0.0.1,DNS:localhost' 'extendedKeyUsage=serverAuth' \
  > "$certificates/platform/tls.ext"
openssl x509 -req -days 2 -sha256 -in "$certificates/platform/tls.csr" \
  -CA "$certificates/platform/ca.crt" -CAkey "$certificates/platform/ca.key" -CAcreateserial \
  -extfile "$certificates/platform/tls.ext" -out "$certificates/platform/tls.crt" >/dev/null 2>&1

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=EAP T22 IdP CA' \
  -keyout "$certificates/idp/ca.key" -out "$certificates/idp/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 -subj '/CN=candidate-idp.localhost' \
  -keyout "$certificates/idp/idp.key" -out "$certificates/idp/idp.csr" >/dev/null 2>&1
printf '%s\n' 'subjectAltName=DNS:candidate-idp.localhost,DNS:localhost,IP:127.0.0.1' 'extendedKeyUsage=serverAuth' \
  > "$certificates/idp/idp.ext"
openssl x509 -req -days 2 -sha256 -in "$certificates/idp/idp.csr" \
  -CA "$certificates/idp/ca.crt" -CAkey "$certificates/idp/ca.key" -CAcreateserial \
  -extfile "$certificates/idp/idp.ext" -out "$certificates/idp/idp.crt" >/dev/null 2>&1

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=EAP T22 LDAP CA' \
  -keyout "$certificates/ldap/ca.key" -out "$certificates/ldap/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 -subj '/CN=ldap.candidate.test' \
  -keyout "$certificates/ldap/ldap.key" -out "$certificates/ldap/ldap.csr" >/dev/null 2>&1
printf '%s\n' 'subjectAltName=DNS:ldap.candidate.test,DNS:localhost,IP:127.0.0.1' 'extendedKeyUsage=serverAuth' \
  > "$certificates/ldap/ldap.ext"
openssl x509 -req -days 2 -sha256 -in "$certificates/ldap/ldap.csr" \
  -CA "$certificates/ldap/ca.crt" -CAkey "$certificates/ldap/ca.key" -CAcreateserial \
  -extfile "$certificates/ldap/ldap.ext" -out "$certificates/ldap/ldap.crt" >/dev/null 2>&1
chmod 600 "$certificates"/*/*.key
chmod 644 "$certificates"/*/*.crt

truststore_password="T22trust$(openssl rand -hex 8)"
truststore="$certificates/candidate-truststore.jks"
"$keytool" -importcert -noprompt -storetype JKS -alias candidate-idp-ca \
  -file "$certificates/idp/ca.crt" -keystore "$truststore" -storepass "$truststore_password" >/dev/null 2>&1
"$keytool" -importcert -noprompt -storetype JKS -alias candidate-ldap-ca \
  -file "$certificates/ldap/ca.crt" -keystore "$truststore" -storepass "$truststore_password" >/dev/null 2>&1
for trust_alias in candidate-idp-ca candidate-ldap-ca; do
  "$keytool" -list -storetype JKS -alias "$trust_alias" \
    -keystore "$truststore" -storepass "$truststore_password" >/dev/null 2>&1 \
    || fail "候选 truststore 缺少 $trust_alias"
done

oidc_client_secret=${EAP_T22_OIDC_CLIENT_SECRET:-candidate-oidc-secret-t22}
upstream_key=${EAP_T22_UPSTREAM_KEY:-candidate-upstream-key-t22}
provider_secret=$upstream_key
ldap_admin_password=${EAP_T22_LDAP_ADMIN_PASSWORD:-CandidateLdapAdmin42}
admin_initial_password=${EAP_T22_ADMIN_INITIAL_PASSWORD:-CandidateBootstrap!42}
admin_password=${EAP_T22_ADMIN_PASSWORD:-CandidateAdminReady!42}
printf '%s\n' "$admin_initial_password" > "$temporary_root/bootstrap-password"
chmod 600 "$temporary_root/bootstrap-password"

export EAP_T22_FIXTURE_PROJECT="$fixture_project"
export EAP_T22_FIXTURE_PORT="$fixture_port"
export EAP_T22_LDAP_PORT="$ldap_port"
export EAP_T22_IDP_ORIGIN="$idp_origin"
export EAP_T22_OIDC_CLIENT_ID=enterprise-candidate
export EAP_T22_OIDC_CLIENT_SECRET="$oidc_client_secret"
export EAP_T22_UPSTREAM_KEY="$upstream_key"
export EAP_T22_IDP_TLS_DIR="$certificates/idp"
export EAP_T22_LDAP_TLS_DIR="$certificates/ldap"
export EAP_T22_LDAP_ADMIN_PASSWORD="$ldap_admin_password"
fixture_compose_command up -d --wait

release_tarball=${EAP_T22_RELEASE_TARBALL:-}
if [ -z "$release_tarball" ]; then
  "$project_root/deploy/scripts/build-release.sh" --version 0.1.0-t22 --output "$release_output" \
    > "$logs_directory/release-build.log" 2>&1
  release_tarball="$release_output/enterprise-agent-platform-0.1.0-t22-linux-amd64.tgz"
fi
[ -f "$release_tarball" ] || fail "候选 release tarball 不存在"
tar -xzf "$release_tarball" -C "$release_output"
release_root=$(find "$release_output" -mindepth 1 -maxdepth 1 -type d -name 'enterprise-agent-platform-*-linux-amd64' | head -n 1)
[ -n "$release_root" ] || fail "候选 release 根目录不存在"

EAP_COMPOSE_PROJECT_NAME="$release_project" "$release_root/scripts/install.sh" \
  --state-dir "$state_directory" \
  --public-base-url "$platform_origin" \
  --admin-redirect-uri "$platform_origin/enterprise/auth/callback" \
  --bootstrap-admin candidate.admin \
  --bootstrap-password-file "$temporary_root/bootstrap-password" \
  --tls-cert "$certificates/platform/tls.crt" \
  --tls-key "$certificates/platform/tls.key" \
  --time-zone Asia/Shanghai \
  --https-port "$https_port" > "$logs_directory/install.log" 2>&1

export EAP_T22_LDAP_TRUSTSTORE="$truststore"
release_compose up -d --force-recreate --wait server gateway
curl --fail --silent --show-error --cacert "$certificates/platform/ca.crt" \
  "$platform_origin/healthz" >/dev/null
release_compose exec -T postgres sh -ec \
  'export PGPASSWORD="$(cat /run/secrets/postgres_password)"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - >/dev/null' \
  < "$auditor_seed"

corepack pnpm@10.34.5 --dir "$project_root/admin-web/e2e/fixtures/plugins/v1" \
  pack --pack-destination "$plugin_artifacts" >/dev/null
corepack pnpm@10.34.5 --dir "$project_root/admin-web/e2e/fixtures/plugins/v2" \
  pack --pack-destination "$plugin_artifacts" >/dev/null
plugin_v1=$(find "$plugin_artifacts" -type f -name '*1.0.0.tgz' -print | head -n 1)
plugin_v2=$(find "$plugin_artifacts" -type f -name '*1.1.0.tgz' -print | head -n 1)
[ -n "$plugin_v1" ] && [ -n "$plugin_v2" ] || fail "候选双版本插件未生成"

bundle=$(find "$state_directory/harness" -type f -name '*.tgz' -print | head -n 1)
public_key="$state_directory/secrets/plugin_signing_public_key"
corepack pnpm@11.7.0 --dir "$project_root/harness-plugin" accept:t22-candidate -- \
  --base-url "$platform_origin" --bundle "$bundle" \
  --platform-ca "$certificates/platform/ca.crt" --plugin-public-key "$public_key" \
  --harness-root "$harness_root" > "$harness_log" 2>&1 &
harness_pid=$!

attempt=0
while ! grep -q '^T22_HARNESS_READY ' "$harness_log" 2>/dev/null; do
  kill -0 "$harness_pid" 2>/dev/null || fail "T22 Harness 载体在就绪前退出"
  attempt=$((attempt + 1))
  [ "$attempt" -lt 300 ] || fail "T22 Harness 载体 120 秒内未就绪"
  sleep 0.4
done
ready_json=$(sed -n 's/^T22_HARNESS_READY //p' "$harness_log" | tail -n 1)
control_url=$(node -e 'const value=JSON.parse(process.argv[1]);process.stdout.write(value.controlUrl)' "$ready_json")
postgres_container=$(release_compose ps -q postgres)
second_workspace=$(mktemp -d "$temporary_root/second-workspace.XXXXXX")
manual_acceptance_signal=
if [ "${EAP_T22_MANUAL_ACCEPTANCE:-0}" = 1 ]; then
  manual_acceptance_signal="$temporary_root/manual-acceptance-complete"
fi

ENT_E2E_BASE_URL="$platform_origin" \
ENT_T22_HARNESS_CONTROL_URL="$control_url/control" \
ENT_T22_FIXTURE_ORIGIN="$idp_origin" \
ENT_T22_FIXTURE_CONTROL_ORIGIN="https://127.0.0.1:$fixture_port" \
ENT_T22_ADMIN_USERNAME=candidate.admin \
ENT_T22_ADMIN_INITIAL_PASSWORD="$admin_initial_password" \
ENT_T22_ADMIN_PASSWORD="$admin_password" \
ENT_T22_AUDITOR_USERNAME=candidate.auditor \
ENT_T22_AUDITOR_PASSWORD="$admin_initial_password" \
ENT_T22_OIDC_CLIENT_SECRET="$oidc_client_secret" \
ENT_T22_PROVIDER_SECRET="$provider_secret" \
ENT_T22_PLUGIN_V1="$plugin_v1" \
ENT_T22_PLUGIN_V2="$plugin_v2" \
ENT_T22_POSTGRES_CONTAINER="$postgres_container" \
ENT_T22_SECOND_WORKSPACE="$second_workspace" \
ENT_T22_MANUAL_ACCEPTANCE_SIGNAL="$manual_acceptance_signal" \
  corepack pnpm@10.34.5 --dir "$project_root/admin-web" exec playwright test \
    e2e/candidate-release.spec.ts --reporter=list > "$logs_directory/playwright.log" 2>&1

wait "$harness_pid"
harness_pid=
grep -q '^T22_HARNESS_ACCEPTED ' "$harness_log" || fail "Harness 未输出候选验收完成证据"

capture_compose_logs
literal_file="$temporary_root/controlled-literals"
printf '%s\n' "$oidc_client_secret" "$upstream_key" "$ldap_admin_password" \
  "$admin_initial_password" "$admin_password" "$truststore_password" > "$literal_file"
node "$project_root/scripts/scan-sensitive-logs.mjs" --literal-file "$literal_file" "$logs_directory"

assets="$project_root/docs/assets"
ffmpeg -hide_banner -loglevel error -y -framerate 1 -pattern_type glob \
  -i "$assets/t22-*.png" \
  -vf 'fps=10,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white' \
  "$assets/t22-end-to-end-candidate.gif"
for media in "$assets"/t22-*.png "$assets/t22-end-to-end-candidate.gif"; do
  strings "$media" | while IFS= read -r line; do
    for secret in "$oidc_client_secret" "$upstream_key" "$ldap_admin_password" \
      "$admin_initial_password" "$admin_password" "$truststore_password"; do
      case "$line" in *"$secret"*) fail "候选媒体包含受控 secret" ;; esac
    done
  done
done

"$project_root/scripts/bootstrap-harness.sh" --check-only >/dev/null
[ -z "$(git -C "$harness_root" status --porcelain)" ] || fail "候选验收污染了 Harness checkout"
printf '%s\n' "T22 候选验收通过: 14/14，GIF=$assets/t22-end-to-end-candidate.gif"
