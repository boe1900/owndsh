#!/bin/sh
# [INPUT]: 依赖完整源码、Java 21、双 pnpm 工具链、Linux amd64 Docker 与干净同级 Harness。
# [OUTPUT]: 运行 T22 全量代码、协议、consumer 与 release 完整性门禁，并把同一 release 交给 14 步功能候选验收。
# [POS]: T22 功能候选总门禁；不创建长期部署、不修改上游，镜像漏洞扫描不属于非生产 MVP 验收范围。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_directory/.." && pwd)
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/enterprise-t22-checks.XXXXXX")
release_output="$temporary_root/release"
java_home=${JAVA_HOME:-/usr/local/opt/openjdk@21}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  rm -rf "$temporary_root"
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$release_output"
[ -x "$java_home/bin/java" ] || { printf '%s\n' '缺少 Java 21' >&2; exit 1; }
[ "$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')" = linux/amd64 ] \
  || { printf '%s\n' 'Docker runtime 必须是 linux/amd64' >&2; exit 1; }

printf '%s\n' 'T22 gate 1/7: 上游锁、Harness commit 与补丁格式'
"$project_root/scripts/bootstrap-harness.sh" --check-only
node "$project_root/scripts/upstream-baseline.mjs" verify-locks
node "$project_root/scripts/upstream-baseline.mjs" verify
git -C "$project_root" diff --check

printf '%s\n' 'T22 gate 2/7: Backend 完整 reactor'
(
  cd "$project_root/backend"
  JAVA_HOME="$java_home" PATH="$java_home/bin:$PATH" \
    ./mvnw -B -ntp -Dmaven.test.skip=false -DskipTests=false test
)

printf '%s\n' 'T22 gate 3/7: 管理端 test/lint/production build 与 fixture'
(
  cd "$project_root/admin-web"
  corepack pnpm@10.34.5 test
  corepack pnpm@10.34.5 lint
  corepack pnpm@10.34.5 build:prod
  node --test e2e/fixtures/fixtures.test.mjs e2e/support/support.test.mjs
)

printf '%s\n' 'T22 gate 4/7: Harness workspace、OpenAPI drift、pack 与真实 consumer'
(
  cd "$project_root/harness-plugin"
  corepack pnpm@11.7.0 check
  corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-contracts check:generated
  corepack pnpm@11.7.0 pack:contracts
  corepack pnpm@11.7.0 smoke:contracts
  corepack pnpm@11.7.0 pack:platform-client
  corepack pnpm@11.7.0 smoke:platform-client
  corepack pnpm@11.7.0 pack:plugin-distribution
  corepack pnpm@11.7.0 smoke:plugin-distribution
  corepack pnpm@11.7.0 pack:session-sync
  corepack pnpm@11.7.0 smoke:session-sync
  corepack pnpm@11.7.0 pack:bundle
  node scripts/t01-harness-smoke.mjs
)

printf '%s\n' 'T22 gate 5/7: Compose、日志敏感扫描器和 Shell 静态门禁'
node --test "$project_root/deploy/tests/deployment.test.mjs"
node --test "$project_root/scripts/scan-sensitive-logs.test.mjs"
sh -n "$project_root/scripts/t22-candidate.sh"
sh -n "$project_root/scripts/t22-release-checks.sh"

printf '%s\n' 'T22 gate 6/7: 构建唯一 release 并校验制品完整性'
"$project_root/deploy/scripts/build-release.sh" --version 0.1.0-t22 --output "$release_output"
release_tarball="$release_output/enterprise-agent-platform-0.1.0-t22-linux-amd64.tgz"
[ -f "$release_tarball" ] || { printf '%s\n' 'release tarball 缺失' >&2; exit 1; }

printf '%s\n' 'T22 gate 7/7: 同一 release 的 14 步真实功能候选验收'
EAP_T22_RELEASE_TARBALL="$release_tarball" "$project_root/scripts/t22-candidate.sh"

"$project_root/scripts/bootstrap-harness.sh" --check-only
[ -z "$(git -C "$project_root/../deepseek-harness" status --porcelain)" ] \
  || { printf '%s\n' 'Harness checkout 在 release checks 后不干净' >&2; exit 1; }
git -C "$project_root" diff --check
printf '%s\n' 'T22 功能候选 checks 全部通过（按 MVP 范围不执行镜像漏洞扫描）'
