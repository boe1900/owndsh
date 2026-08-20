#!/bin/sh
# [INPUT]: 依赖已校验 release、全新绝对状态目录、端口一致的生产 HTTPS 输入与一次性管理员密码文件。
# [OUTPUT]: 生成安装 secret，加载镜像，事务初始化管理员，移除 bootstrap 副本并输出员工 profile 材料。
# [POS]: T21 全新安装事务；已有 runtime.env 时 fail-closed，绝不覆盖既有数据库或 key。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

usage() {
  printf '%s\n' "用法: $0 --state-dir DIR --public-base-url HTTPS_URL --admin-redirect-uri HTTPS_URL --bootstrap-admin USER --bootstrap-password-file FILE --tls-cert FILE --tls-key FILE [--time-zone ZONE] [--https-port PORT]"
}

EAP_STATE_DIR=
public_base_url=
admin_redirect_uri=
bootstrap_admin=
bootstrap_password_file=
tls_cert=
tls_key=
time_zone=Asia/Shanghai
https_port=443
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) EAP_STATE_DIR=${2:-}; shift 2 ;;
    --public-base-url) public_base_url=${2:-}; shift 2 ;;
    --admin-redirect-uri) admin_redirect_uri=${2:-}; shift 2 ;;
    --bootstrap-admin) bootstrap_admin=${2:-}; shift 2 ;;
    --bootstrap-password-file) bootstrap_password_file=${2:-}; shift 2 ;;
    --tls-cert) tls_cert=${2:-}; shift 2 ;;
    --tls-key) tls_key=${2:-}; shift 2 ;;
    --time-zone) time_zone=${2:-}; shift 2 ;;
    --https-port) https_port=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

require_safe_path "$EAP_STATE_DIR"
require_single_line "$public_base_url" "public base URL"
require_single_line "$bootstrap_admin" "bootstrap 用户名"
require_single_line "$time_zone" "部署时区"
require_single_line "$https_port" "HTTPS 端口"
printf '%s' "$public_base_url" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' \
  || fail "public base URL 必须是无路径、无注入字符的 HTTPS authority"
[ "$admin_redirect_uri" = "$public_base_url/enterprise/auth/callback" ] \
  || fail "管理回调必须是 public base URL 下的 /enterprise/auth/callback"
printf '%s' "$bootstrap_admin" | grep -Eq '^[A-Za-z][A-Za-z0-9._-]{2,29}$' || fail "bootstrap 用户名格式不合法"
printf '%s' "$time_zone" | grep -Eq '^[A-Za-z_+-]+(/[A-Za-z_+-]+)+$|^UTC$' || fail "部署时区格式不合法"
printf '%s' "$https_port" | grep -Eq '^[0-9]{1,5}$' || fail "HTTPS 端口格式不合法"
[ "$https_port" -ge 1 ] && [ "$https_port" -le 65535 ] || fail "HTTPS 端口必须在 1..65535"
public_port=443
case "$public_base_url" in
  https://*:*) public_port=${public_base_url##*:} ;;
esac
[ "$public_port" = "$https_port" ] || fail "public base URL 端口必须与 HTTPS 发布端口一致"
base_image_registry=${EAP_BASE_IMAGE_REGISTRY:-docker.io/library}
case "$base_image_registry" in
  *[!A-Za-z0-9./:_-]*|'') fail "EAP_BASE_IMAGE_REGISTRY 格式不安全" ;;
esac
require_file "$bootstrap_password_file"
require_file "$tls_cert"
require_file "$tls_key"
require_command docker
require_command openssl
require_command sha256sum
require_command curl
release_root=$(release_root_for_script)
verify_release "$release_root"

[ ! -e "$EAP_STATE_DIR/runtime.env" ] || fail "状态目录已安装，不能重复执行 install"
mkdir -p "$EAP_STATE_DIR" "$EAP_STATE_DIR/releases" "$EAP_STATE_DIR/secrets" "$EAP_STATE_DIR/tls" "$EAP_STATE_DIR/harness"
chmod 700 "$EAP_STATE_DIR" "$EAP_STATE_DIR/secrets" "$EAP_STATE_DIR/tls"
acquire_operation_lock

release=$(env_value EAP_RELEASE_VERSION "$release_root/manifest.env")
server_image=$(env_value EAP_SERVER_IMAGE "$release_root/manifest.env")
gateway_image=$(env_value EAP_GATEWAY_IMAGE "$release_root/manifest.env")
[ -n "$release" ] && [ -n "$server_image" ] && [ -n "$gateway_image" ] || fail "release manifest 不完整"
cp -R "$release_root" "$EAP_STATE_DIR/releases/$release"
load_image_archive "$release_root/images/server.tar.gz"
load_image_archive "$release_root/images/gateway.tar.gz"

openssl rand -base64 48 | tr -d '\n' > "$EAP_STATE_DIR/secrets/postgres_password"
openssl rand -base64 48 | tr -d '\n' > "$EAP_STATE_DIR/secrets/redis_password"
openssl rand -base64 64 | tr -d '\n' > "$EAP_STATE_DIR/secrets/sa_token_jwt_secret_key"
openssl rand 32 > "$EAP_STATE_DIR/secrets/enterprise_master_key"
openssl genpkey -algorithm ED25519 -out "$EAP_STATE_DIR/secrets/plugin_signing_private_key" >/dev/null 2>&1
openssl pkey -in "$EAP_STATE_DIR/secrets/plugin_signing_private_key" -pubout -out "$EAP_STATE_DIR/secrets/plugin_signing_public_key" >/dev/null 2>&1
cp "$tls_cert" "$EAP_STATE_DIR/tls/tls.crt"
cp "$tls_key" "$EAP_STATE_DIR/tls/tls.key"
cp "$bootstrap_password_file" "$EAP_STATE_DIR/secrets/bootstrap_admin_password"
chmod 600 "$EAP_STATE_DIR"/secrets/* "$EAP_STATE_DIR"/tls/*

cert_hash=$(openssl x509 -in "$EAP_STATE_DIR/tls/tls.crt" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | awk '{print $1}')
key_hash=$(openssl pkey -in "$EAP_STATE_DIR/tls/tls.key" -pubout -outform DER | sha256sum | awk '{print $1}')
[ "$cert_hash" = "$key_hash" ] || fail "TLS 证书与私钥不匹配"

cat > "$EAP_STATE_DIR/runtime.env" <<EOF
EAP_STATE_DIR=$EAP_STATE_DIR
EAP_RELEASE_VERSION=$release
EAP_SERVER_IMAGE=$server_image
EAP_GATEWAY_IMAGE=$gateway_image
EAP_BASE_IMAGE_REGISTRY=$base_image_registry
EAP_COMPOSE_PROJECT_NAME=enterprise-agent-platform
EAP_HTTPS_BIND=0.0.0.0
EAP_HTTPS_PORT=$https_port
ENT_PUBLIC_BASE_URL=$public_base_url
ENT_ADMIN_REDIRECT_URI=$admin_redirect_uri
ENT_DEPLOYMENT_TIME_ZONE=$time_zone
ENT_POSTGRES_DATABASE=enterprise_agent
ENT_POSTGRES_USERNAME=enterprise_agent
EOF
chmod 600 "$EAP_STATE_DIR/runtime.env"

bundle=$(env_value EAP_HARNESS_BUNDLE "$release_root/manifest.env")
cp "$release_root/harness/$bundle" "$EAP_STATE_DIR/harness/$bundle"
{
  printf '%s\n' '- id: enterprise-agent' '  config:' "    baseUrl: '$public_base_url'" '    trustedPluginPublicKey: |-'
  sed 's/^/      /' "$EAP_STATE_DIR/secrets/plugin_signing_public_key"
  printf '%s\n' '    enableTechnicalProbe: false'
} > "$EAP_STATE_DIR/harness/cordis.patch.yml"
chmod 644 "$EAP_STATE_DIR/harness/"*

runtime=$(runtime_file)
base_compose=$(compose_file)
bootstrap_compose="$EAP_STATE_DIR/releases/$release/compose/compose.bootstrap.yml"
ENT_BOOTSTRAP_ADMIN_USERNAME=$bootstrap_admin \
EAP_BOOTSTRAP_PASSWORD_FILE="$EAP_STATE_DIR/secrets/bootstrap_admin_password" \
  docker compose --env-file "$runtime" -f "$base_compose" -f "$bootstrap_compose" up -d
wait_healthy server 90
wait_healthy gateway 30

marker=$(compose exec -T postgres sh -ec 'export PGPASSWORD="$(cat /run/secrets/postgres_password)"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from ent_deployment_state where state_key=\$\$BOOTSTRAP_ADMIN_COMPLETED\$\$"' 2>/dev/null || true)
[ "$marker" = 1 ] || fail "bootstrap 完成 marker 不存在"

compose up -d --force-recreate server gateway
wait_healthy server 90
wait_healthy gateway 30
rm -f "$EAP_STATE_DIR/secrets/bootstrap_admin_password"

curl --fail --silent --show-error --cacert "$EAP_STATE_DIR/tls/tls.crt" "$public_base_url/healthz" >/dev/null
printf '%s\n' "安装完成: $public_base_url"
printf '%s\n' "Harness bundle: $EAP_STATE_DIR/harness/$bundle"
printf '%s\n' "Harness profile overlay: $EAP_STATE_DIR/harness/cordis.patch.yml"
