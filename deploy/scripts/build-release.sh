#!/bin/sh
# [INPUT]: 依赖产品源码、Harness 机器锁、RuoYi PostgreSQL 基线、锁定 digest 的 Linux amd64 Docker base、可选受验本地镜像缓存、pnpm workspace 与许可证。
# [OUTPUT]: 生成含 Server/新控制台 Gateway 镜像、version 0 数据库基线、企业 bundle、Compose、脚本、许可证、Harness 基线和 SHA-256 清单的发布 tarball。
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
require_sha256
require_command tar
architecture=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
[ "$architecture" = linux/amd64 ] || fail "发布构建要求 linux/amd64 Docker，当前为 $architecture"

local_image_by_digest() {
  expected_digest=$1
  image_ref=$(docker image ls --digests --format '{{.Repository}}@{{.Digest}}' \
    | awk -v digest="$expected_digest" '$0 ~ "@" digest "$" { print; exit }')
  [ -n "$image_ref" ] || fail "本地缺少锁定基础镜像: $expected_digest"
  printf '%s\n' "$image_ref"
}

source_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
harness_lock="$source_root/upstream/deepseek-harness.lock.json"
require_file "$harness_lock"
harness_version=$(node -e 'const lock = require(process.argv[1]); if (!/^[A-Za-z0-9._-]+$/.test(lock.version ?? "")) throw new Error("invalid Harness version lock"); process.stdout.write(lock.version)' "$harness_lock")
harness_commit=$(node -e 'const lock = require(process.argv[1]); if (!/^[0-9a-f]{40}$/.test(lock.commit ?? "")) throw new Error("invalid Harness commit lock"); process.stdout.write(lock.commit)' "$harness_lock")
output=$(mkdir -p "$output" && CDPATH= cd -- "$output" && pwd)
server_image="enterprise-agent-platform/server:$version"
gateway_image="enterprise-agent-platform/gateway:$version"
package_name="enterprise-agent-platform-$version-linux-amd64"
staging=$(mktemp -d "${TMPDIR:-/tmp}/eap-release.XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM
package_root="$staging/$package_name"

if [ "${EAP_USE_LOCAL_BASE_IMAGES:-0}" = 1 ]; then
  maven_image=$(local_image_by_digest sha256:922927df2c662cdd47ddb116443d6bec4696cfae3de1a0ddac8fcc7b87ce61ae)
  jre_image=$(local_image_by_digest sha256:cddd554e8d69b48b46e8b0c9d1ce72ae5fe8d84819dcdb7131328531e9cc100b)
  node_image=$(local_image_by_digest sha256:51dbfc749ec3018c7d4bf8b9ee65299ff9a908e38918ce163b0acfcd5dd931d9)
  nginx_image=$(local_image_by_digest sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284)
  DOCKER_BUILDKIT=0 docker build --platform linux/amd64 \
    --build-arg EAP_MAVEN_IMAGE="$maven_image" --build-arg EAP_JRE_IMAGE="$jre_image" \
    -f "$source_root/deploy/compose/Dockerfile.server" -t "$server_image" "$source_root"
  DOCKER_BUILDKIT=0 docker build --platform linux/amd64 \
    --build-arg EAP_NODE_IMAGE="$node_image" --build-arg EAP_NGINX_IMAGE="$nginx_image" \
    -f "$source_root/deploy/compose/Dockerfile.gateway" -t "$gateway_image" "$source_root"
else
  docker build --platform linux/amd64 --build-arg EAP_BASE_IMAGE_REGISTRY="$base_image_registry" \
    -f "$source_root/deploy/compose/Dockerfile.server" -t "$server_image" "$source_root"
  docker build --platform linux/amd64 --build-arg EAP_BASE_IMAGE_REGISTRY="$base_image_registry" \
    -f "$source_root/deploy/compose/Dockerfile.gateway" -t "$gateway_image" "$source_root"
fi

(cd "$source_root/harness-plugin" && pnpm run build && pnpm run pack:bundle)
bundle="$source_root/artifacts/enterprise-agent-dsh-bundle-0.1.0.tgz"
require_file "$bundle"

mkdir -p "$package_root/images" "$package_root/harness" "$package_root/licenses" "$package_root/database"
cp -R "$source_root/deploy/compose" "$package_root/compose"
cp -R "$source_root/deploy/nginx" "$package_root/nginx"
cp -R "$source_root/deploy/scripts" "$package_root/scripts"
cp "$source_root/deploy/README.md" "$package_root/OPERATIONS.md"
cp "$source_root/backend/LICENSE" "$package_root/licenses/backend-MIT.txt"
cp "$source_root/console-web/BEAUTIFUL_UI_LICENSE" "$package_root/licenses/console-web-beautiful-ui-MIT.txt"
cp "$source_root/backend/script/sql/postgres/postgres_ry_vue.sql" "$package_root/database/postgres_ry_vue.sql"
cp "$bundle" "$package_root/harness/"

docker image save "$server_image" | gzip -9 > "$package_root/images/server.tar.gz"
docker image save "$gateway_image" | gzip -9 > "$package_root/images/gateway.tar.gz"
cat > "$package_root/manifest.env" <<EOF
EAP_RELEASE_VERSION=$version
EAP_SERVER_IMAGE=$server_image
EAP_GATEWAY_IMAGE=$gateway_image
EAP_HARNESS_BUNDLE=enterprise-agent-dsh-bundle-0.1.0.tgz
EAP_HARNESS_VERSION=$harness_version
EAP_HARNESS_COMMIT=$harness_commit
EOF

(
  cd "$package_root"
  find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort \
    | while IFS= read -r file; do sha256sum_compat "$file"; done > SHA256SUMS
)
tar -C "$staging" -czf "$output/$package_name.tgz" "$package_name"
printf '%s\n' "发布包已生成: $output/$package_name.tgz"
