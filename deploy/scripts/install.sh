#!/bin/sh
# [INPUT]: 依赖已校验 release、全新绝对状态目录、隔离 Compose project、HTTP(S) 外部地址、HTTP 发布端口与一次性管理员密码文件。
# [OUTPUT]: 生成运行时 secret，加载镜像，通过环境变量初始化管理员并输出员工 profile 材料。
# [POS]: T21 全新安装事务；已有 runtime.env 时 fail-closed，绝不覆盖既有数据库或 key。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

usage() {
  printf '%s\n' "用法: $0 --state-dir DIR --public-base-url HTTP_OR_HTTPS_URL --admin-redirect-uri URL --bootstrap-admin USER --bootstrap-password-file FILE [--time-zone ZONE] [--http-port PORT]"
}

OWNDSH_STATE_DIR=
public_base_url=
admin_redirect_uri=
bootstrap_admin=
bootstrap_password_file=
time_zone=Asia/Shanghai
http_port=8080
while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir) OWNDSH_STATE_DIR=${2:-}; shift 2 ;;
    --public-base-url) public_base_url=${2:-}; shift 2 ;;
    --admin-redirect-uri) admin_redirect_uri=${2:-}; shift 2 ;;
    --bootstrap-admin) bootstrap_admin=${2:-}; shift 2 ;;
    --bootstrap-password-file) bootstrap_password_file=${2:-}; shift 2 ;;
    --time-zone) time_zone=${2:-}; shift 2 ;;
    --http-port) http_port=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

require_safe_path "$OWNDSH_STATE_DIR"
require_single_line "$public_base_url" "public base URL"
require_single_line "$admin_redirect_uri" "admin redirect URI"
require_single_line "$bootstrap_admin" "bootstrap 用户名"
require_single_line "$time_zone" "部署时区"
require_single_line "$http_port" "HTTP 端口"
printf '%s' "$public_base_url" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' \
  || fail "public base URL 必须是无路径、无注入字符的 HTTP(S) authority"
public_authority=${public_base_url#*://}
case "$public_authority" in
  *:*)
    public_port=${public_authority##*:}
    [ "$public_port" -ge 1 ] && [ "$public_port" -le 65535 ] || fail "public base URL 端口必须在 1..65535"
    ;;
esac
[ "$admin_redirect_uri" = "$public_base_url/enterprise/auth/callback" ] \
  || fail "管理回调必须是 public base URL 下的 /enterprise/auth/callback"
printf '%s' "$bootstrap_admin" | grep -Eq '^[A-Za-z][A-Za-z0-9._-]{2,29}$' || fail "bootstrap 用户名格式不合法"
printf '%s' "$time_zone" | grep -Eq '^[A-Za-z_+-]+(/[A-Za-z_+-]+)+$|^UTC$' || fail "部署时区格式不合法"
printf '%s' "$http_port" | grep -Eq '^[0-9]{1,5}$' || fail "HTTP 端口格式不合法"
[ "$http_port" -ge 1 ] && [ "$http_port" -le 65535 ] || fail "HTTP 端口必须在 1..65535"
base_image_registry=${OWNDSH_BASE_IMAGE_REGISTRY:-docker.io/library}
case "$base_image_registry" in
  *[!A-Za-z0-9./:_-]*|'') fail "OWNDSH_BASE_IMAGE_REGISTRY 格式不安全" ;;
esac
compose_project_name=${OWNDSH_COMPOSE_PROJECT_NAME:-owndsh}
printf '%s' "$compose_project_name" | grep -Eq '^[a-z0-9][a-z0-9_-]{0,62}$' \
  || fail "OWNDSH_COMPOSE_PROJECT_NAME 格式不安全"
require_file "$bootstrap_password_file"
require_command docker
require_command openssl
require_sha256
require_command curl
release_root=$(release_root_for_script)
verify_release "$release_root"

[ ! -e "$OWNDSH_STATE_DIR/runtime.env" ] || fail "状态目录已安装，不能重复执行 install"
mkdir -p "$OWNDSH_STATE_DIR" "$OWNDSH_STATE_DIR/releases" "$OWNDSH_STATE_DIR/secrets" "$OWNDSH_STATE_DIR/harness"
chmod 700 "$OWNDSH_STATE_DIR" "$OWNDSH_STATE_DIR/secrets"
acquire_operation_lock

release=$(env_value OWNDSH_RELEASE_VERSION "$release_root/manifest.env")
server_image=$(env_value OWNDSH_SERVER_IMAGE "$release_root/manifest.env")
console_image=$(env_value OWNDSH_CONSOLE_IMAGE "$release_root/manifest.env")
[ -n "$release" ] && [ -n "$server_image" ] && [ -n "$console_image" ] || fail "release manifest 不完整"
cp -R "$release_root" "$OWNDSH_STATE_DIR/releases/$release"
load_image_archive "$release_root/images/server.tar.gz"
load_image_archive "$release_root/images/console.tar.gz"

openssl rand -base64 48 | tr -d '\n' > "$OWNDSH_STATE_DIR/secrets/postgres_password"
openssl rand -base64 48 | tr -d '\n' > "$OWNDSH_STATE_DIR/secrets/redis_password"
openssl rand -base64 64 | tr -d '\n' > "$OWNDSH_STATE_DIR/secrets/sa_token_jwt_secret_key"
openssl rand -base64 24 | tr -d '\n' > "$OWNDSH_STATE_DIR/secrets/enterprise_master_key"
openssl genpkey -algorithm ED25519 -out "$OWNDSH_STATE_DIR/secrets/plugin_signing_private_key" >/dev/null 2>&1
openssl pkey -in "$OWNDSH_STATE_DIR/secrets/plugin_signing_private_key" -pubout -out "$OWNDSH_STATE_DIR/secrets/plugin_signing_public_key" >/dev/null 2>&1
chmod 600 "$OWNDSH_STATE_DIR"/secrets/*

cat > "$OWNDSH_STATE_DIR/runtime.env" <<EOF
OWNDSH_STATE_DIR=$OWNDSH_STATE_DIR
OWNDSH_RELEASE_VERSION=$release
OWNDSH_SERVER_IMAGE=$server_image
OWNDSH_CONSOLE_IMAGE=$console_image
OWNDSH_BASE_IMAGE_REGISTRY=$base_image_registry
OWNDSH_COMPOSE_PROJECT_NAME=$compose_project_name
OWNDSH_HTTP_BIND=0.0.0.0
OWNDSH_HTTP_PORT=$http_port
ENT_PUBLIC_BASE_URL=$public_base_url
ENT_ADMIN_REDIRECT_URI=$admin_redirect_uri
ENT_DEPLOYMENT_TIME_ZONE=$time_zone
ENT_POSTGRES_DATABASE=owndsh
ENT_POSTGRES_USERNAME=owndsh
EOF
chmod 600 "$OWNDSH_STATE_DIR/runtime.env"

bundle=$(env_value OWNDSH_HARNESS_BUNDLE "$release_root/manifest.env")
cp "$release_root/harness/$bundle" "$OWNDSH_STATE_DIR/harness/$bundle"
{
  printf '%s\n' '- id: owndsh' '  config:' "    baseUrl: '$public_base_url'" '    trustedPluginPublicKey: |-'
  sed 's/^/      /' "$OWNDSH_STATE_DIR/secrets/plugin_signing_public_key"
  printf '%s\n' '    enableTechnicalProbe: false'
} > "$OWNDSH_STATE_DIR/harness/cordis.patch.yml"
chmod 644 "$OWNDSH_STATE_DIR/harness/"*

runtime=$(runtime_file)
base_compose=$(compose_file)
ENT_POSTGRES_PASSWORD="$(cat "$OWNDSH_STATE_DIR/secrets/postgres_password")" \
ENT_REDIS_PASSWORD="$(cat "$OWNDSH_STATE_DIR/secrets/redis_password")" \
SA_TOKEN_JWT_SECRET_KEY="$(cat "$OWNDSH_STATE_DIR/secrets/sa_token_jwt_secret_key")" \
ENT_MASTER_KEY="$(cat "$OWNDSH_STATE_DIR/secrets/enterprise_master_key")" \
ENT_PLUGIN_SIGNING_PRIVATE_KEY="$(cat "$OWNDSH_STATE_DIR/secrets/plugin_signing_private_key")" \
ENT_BOOTSTRAP_ADMIN_USERNAME=$bootstrap_admin \
ENT_BOOTSTRAP_ADMIN_PASSWORD="$(cat "$bootstrap_password_file")" \
  docker compose --env-file "$runtime" -f "$base_compose" up -d
wait_healthy server 90
wait_healthy console 30

marker=$(compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from ent_deployment_state where state_key=\$\$BOOTSTRAP_ADMIN_COMPLETED\$\$"' 2>/dev/null || true)
[ "$marker" = 1 ] || fail "bootstrap 完成 marker 不存在"

curl --fail --silent --show-error "http://127.0.0.1:$http_port/healthz" >/dev/null
printf '%s\n' "安装完成: $public_base_url"
printf '%s\n' "Harness bundle: $OWNDSH_STATE_DIR/harness/$bundle"
printf '%s\n' "Harness profile overlay: $OWNDSH_STATE_DIR/harness/cordis.patch.yml"
