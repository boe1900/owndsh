#!/usr/bin/env sh
# [INPUT]: 依赖 upstream/deepseek-harness.lock.json、Node.js、Git CLI 与可访问的官方 GitHub 仓库
# [OUTPUT]: 在产品仓库同级目录准备干净且检出锁定 commit 的 DeepSeek Harness checkout
# [POS]: scripts 的 macOS/Linux 开发环境入口，与 bootstrap-harness.ps1 保持行为一致
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
lock_path="$project_root/upstream/deepseek-harness.lock.json"
default_checkout=$(CDPATH= cd -- "$project_root/.." && pwd)/deepseek-harness
checkout=$default_checkout
check_only=false

if [ "${1:-}" = "--check-only" ]; then
  check_only=true
  shift
fi
if [ "$#" -gt 1 ]; then
  echo "usage: $0 [--check-only] [destination]" >&2
  exit 2
fi
if [ "$#" -eq 1 ]; then
  checkout=$1
fi

repository=$(node -e "const x=require(process.argv[1]); process.stdout.write(x.repository)" "$lock_path")
version=$(node -e "const x=require(process.argv[1]); process.stdout.write(x.version)" "$lock_path")
commit=$(node -e "const x=require(process.argv[1]); process.stdout.write(x.commit)" "$lock_path")

case "$commit" in
  *[!0-9a-f]*|'') echo "invalid Harness commit in $lock_path" >&2; exit 1 ;;
esac
if [ "${#commit}" -ne 40 ]; then
  echo "invalid Harness commit in $lock_path" >&2
  exit 1
fi

if [ ! -e "$checkout" ]; then
  if [ "$check_only" = true ]; then
    echo "Harness checkout does not exist: $checkout" >&2
    exit 1
  fi
  git clone "$repository" "$checkout"
fi
if [ ! -d "$checkout/.git" ]; then
  echo "destination is not a Git checkout: $checkout" >&2
  exit 1
fi

origin=$(git -C "$checkout" remote get-url origin)
normalized_origin=${origin%/}
normalized_origin=${normalized_origin%.git}
normalized_repository=${repository%/}
normalized_repository=${normalized_repository%.git}
if [ "$normalized_origin" != "$normalized_repository" ]; then
  echo "Harness origin mismatch: expected $repository, got $origin" >&2
  exit 1
fi
if [ -n "$(git -C "$checkout" status --porcelain)" ]; then
  echo "Harness checkout has local changes; refusing to change revisions: $checkout" >&2
  exit 1
fi

if [ "$check_only" = false ]; then
  git -C "$checkout" fetch origin --tags --prune
  git -C "$checkout" cat-file -e "$commit^{commit}"
  git -C "$checkout" switch --detach "$commit"
fi

head_commit=$(git -C "$checkout" rev-parse HEAD)
if [ "$head_commit" != "$commit" ]; then
  echo "Harness checkout is not at the locked commit $commit: $checkout" >&2
  exit 1
fi

printf 'Repository: %s\nVersion: %s\nCommit: %s\nCheckout: %s\n' "$repository" "$version" "$head_commit" "$checkout"
