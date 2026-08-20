#!/bin/sh
# [INPUT]: 依赖产品源码、RuoYi PostgreSQL 基线、锁定 digest 的 Linux amd64 Docker base、registry 前缀、pnpm workspace 与许可证。
# [OUTPUT]: 生成含两张应用镜像、version 0 数据库基线、企业 bundle、Compose、脚本、文档和 SHA-256 清单的发布 tarball。
# [POS]: T21 源码到离线交付包的唯一构建入口，不写入安装状态或生产 secret。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_directory/common.sh"

usage() {
  printf '%s\n' "用法: $0 --version VERSION --output DIRECTORY"
}

version=
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version=${2:-}; shift 2 ;;
    --output) output=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[ -n "$version" ] || fail "必须提供 --version"
[ -n "$output" ] || fail "必须提供 --output"
case "$version" in *[!A-Za-z0-9._-]*) fail "版本格式不安全" ;; esac
base_image_registry=${EAP_BASE_IMAGE_REGISTRY:-docker.io/library}
case "$base_image_registry" in
  *[!A-Za-z0-9./:_-]*|'') fail "EAP_BASE_IMAGE_REGISTRY 格式不安全" ;;
esac

require_command docker
require_command node
require_command pnpm
require_command sha256sum
require_command tar
architecture=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
[ "$architecture" = linux/amd64 ] || fail "发布构建要求 linux/amd64 Docker，当前为 $architecture"

source_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
output=$(mkdir -p "$output" && CDPATH= cd -- "$output" && pwd)
server_image="enterprise-agent-platform/server:$version"
gateway_image="enterprise-agent-platform/gateway:$version"
package_name="enterprise-agent-platform-$version-linux-amd64"
staging=$(mktemp -d "${TMPDIR:-/tmp}/eap-release.XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM
package_root="$staging/$package_name"

docker build --platform linux/amd64 --build-arg EAP_BASE_IMAGE_REGISTRY="$base_image_registry" \
  -f "$source_root/deploy/compose/Dockerfile.server" -t "$server_image" "$source_root"
docker build --platform linux/amd64 --build-arg EAP_BASE_IMAGE_REGISTRY="$base_image_registry" \
  -f "$source_root/deploy/compose/Dockerfile.gateway" -t "$gateway_image" "$source_root"

(cd "$source_root/harness-plugin" && pnpm run build && pnpm run pack:bundle)
bundle="$source_root/artifacts/enterprise-agent-dsh-bundle-0.1.0.tgz"
require_file "$bundle"

mkdir -p "$package_root/images" "$package_root/harness" "$package_root/licenses" "$package_root/database"
cp -R "$source_root/deploy/compose" "$package_root/compose"
cp -R "$source_root/deploy/nginx" "$package_root/nginx"
cp -R "$source_root/deploy/scripts" "$package_root/scripts"
cp "$source_root/deploy/README.md" "$package_root/OPERATIONS.md"
cp "$source_root/backend/LICENSE" "$package_root/licenses/backend-MIT.txt"
cp "$source_root/admin-web/LICENSE" "$package_root/licenses/admin-web-MIT.txt"
cp "$source_root/backend/script/sql/postgres/postgres_ry_vue.sql" "$package_root/database/postgres_ry_vue.sql"
cp "$bundle" "$package_root/harness/"

docker image save "$server_image" | gzip -9 > "$package_root/images/server.tar.gz"
docker image save "$gateway_image" | gzip -9 > "$package_root/images/gateway.tar.gz"
cat > "$package_root/manifest.env" <<EOF
EAP_RELEASE_VERSION=$version
EAP_SERVER_IMAGE=$server_image
EAP_GATEWAY_IMAGE=$gateway_image
EAP_HARNESS_BUNDLE=enterprise-agent-dsh-bundle-0.1.0.tgz
EAP_HARNESS_VERSION=0.1.0-rc.7
EAP_HARNESS_COMMIT=99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
EOF

(
  cd "$package_root"
  find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort | xargs sha256sum > SHA256SUMS
)
tar -C "$staging" -czf "$output/$package_name.tgz" "$package_name"
printf '%s\n' "发布包已生成: $output/$package_name.tgz"
