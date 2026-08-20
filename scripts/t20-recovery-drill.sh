#!/bin/sh
# [INPUT]: 依赖可用 Docker daemon、postgres:17-alpine、redis:8-alpine 与本机 tar/hash 工具。
# [OUTPUT]: 提供 PostgreSQL/Redis kill-restart、全新实例恢复、artifact/key 分离备份与只读磁盘故障验收。
# [POS]: scripts 的 T20 隔离故障演练，只使用随机临时目录和专用容器，不依赖 T21 部署树。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

set -eu
umask 077
export LC_ALL=C
export LANG=C

command -v docker >/dev/null 2>&1 || { echo "docker 不可用" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar 不可用" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon 不可用" >&2; exit 1; }

task_tmp_root=${TMPDIR:-/tmp}
work_dir=$(mktemp -d "$task_tmp_root/enterprise-t20.XXXXXX")
run_id="enterprise-t20-$$"
pg_source="$run_id-pg-source"
pg_restore="$run_id-pg-restore"
redis_source="$run_id-redis-source"
redis_restore="$run_id-redis-restore"
disk_probe="$run_id-disk-probe"

cleanup() {
  docker rm -f "$pg_source" "$pg_restore" "$redis_source" "$redis_restore" "$disk_probe" >/dev/null 2>&1 || true
  case "$work_dir" in
    "$task_tmp_root"/enterprise-t20.*) rm -rf -- "$work_dir" ;;
    *) echo "拒绝清理未验证路径: $work_dir" >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$work_dir/backups" "$work_dir/source/artifacts/sha256/aa" "$work_dir/source/keys"
printf '%s\n' 'approved-plugin-artifact-v1' > "$work_dir/source/artifacts/sha256/aa/probe.tgz"
dd if=/dev/urandom of="$work_dir/source/keys/master.key" bs=32 count=1 2>/dev/null
dd if=/dev/urandom of="$work_dir/source/keys/signing.key" bs=64 count=1 2>/dev/null

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

wait_postgres() {
  container=$1
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    if docker exec "$container" pg_isready --username=enterprise --dbname=enterprise >/dev/null 2>&1; then return 0; fi
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "PostgreSQL 未就绪: $container" >&2
  return 1
}

wait_redis() {
  container=$1
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    if docker exec "$container" redis-cli ping 2>/dev/null | grep -q '^PONG$'; then return 0; fi
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "Redis 未就绪: $container" >&2
  return 1
}

docker run -d --name "$pg_source" \
  -e POSTGRES_USER=enterprise \
  -e POSTGRES_PASSWORD=t20-local-only \
  -e POSTGRES_DB=enterprise \
  postgres:17-alpine >/dev/null
wait_postgres "$pg_source"
docker exec "$pg_source" psql --username=enterprise --dbname=enterprise --set=ON_ERROR_STOP=1 \
  --command="create table recovery_probe(id integer primary key,payload text not null); insert into recovery_probe values (1,'database-restored');" \
  >/dev/null
docker exec "$pg_source" pg_dump --username=enterprise --dbname=enterprise --format=custom \
  > "$work_dir/backups/database.dump"

docker run -d --name "$redis_source" redis:8-alpine redis-server --appendonly no --save '' >/dev/null
wait_redis "$redis_source"
docker exec "$redis_source" redis-cli set enterprise:t20:quota 7 >/dev/null
docker exec "$redis_source" redis-cli set enterprise:t20:lease active >/dev/null
docker exec "$redis_source" redis-cli save >/dev/null
docker cp "$redis_source:/data/dump.rdb" "$work_dir/backups/redis.rdb" >/dev/null

tar -czf "$work_dir/backups/artifacts.tar.gz" -C "$work_dir/source/artifacts" .
tar -czf "$work_dir/backups/keys.tar.gz" -C "$work_dir/source/keys" .
chmod 600 "$work_dir/backups/database.dump" "$work_dir/backups/redis.rdb" \
  "$work_dir/backups/artifacts.tar.gz" "$work_dir/backups/keys.tar.gz"

if tar -tzf "$work_dir/backups/artifacts.tar.gz" | grep -Eq '(master|signing)\.key$'; then
  echo "artifact 备份错误包含 key" >&2
  exit 1
fi

echo "[T20] kill/restart PostgreSQL 与 Redis"
docker kill "$pg_source" >/dev/null
if docker exec "$pg_source" pg_isready >/dev/null 2>&1; then
  echo "PostgreSQL kill 后仍可达" >&2
  exit 1
fi
docker start "$pg_source" >/dev/null
wait_postgres "$pg_source"
test "$(docker exec "$pg_source" psql --username=enterprise --dbname=enterprise --tuples-only --no-align --command='select payload from recovery_probe where id=1')" = 'database-restored'

docker kill "$redis_source" >/dev/null
if docker exec "$redis_source" redis-cli ping >/dev/null 2>&1; then
  echo "Redis kill 后仍可达" >&2
  exit 1
fi
docker start "$redis_source" >/dev/null
wait_redis "$redis_source"
test "$(docker exec "$redis_source" redis-cli --raw get enterprise:t20:quota)" = '7'

echo "[T20] 恢复到全新 PostgreSQL 与 Redis 实例"
docker run -d --name "$pg_restore" \
  -e POSTGRES_USER=enterprise \
  -e POSTGRES_PASSWORD=t20-local-only \
  -e POSTGRES_DB=enterprise \
  postgres:17-alpine >/dev/null
wait_postgres "$pg_restore"
docker cp "$work_dir/backups/database.dump" "$pg_restore:/tmp/database.dump" >/dev/null
docker exec "$pg_restore" pg_restore --exit-on-error --username=enterprise --dbname=enterprise /tmp/database.dump
test "$(docker exec "$pg_restore" psql --username=enterprise --dbname=enterprise --tuples-only --no-align --command='select payload from recovery_probe where id=1')" = 'database-restored'

docker create --name "$redis_restore" redis:8-alpine redis-server --appendonly no --save '' >/dev/null
docker cp "$work_dir/backups/redis.rdb" "$redis_restore:/data/dump.rdb" >/dev/null
docker start "$redis_restore" >/dev/null
wait_redis "$redis_restore"
test "$(docker exec "$redis_restore" redis-cli --raw get enterprise:t20:quota)" = '7'
test "$(docker exec "$redis_restore" redis-cli --raw get enterprise:t20:lease)" = 'active'

mkdir -p "$work_dir/restore/artifacts" "$work_dir/restore/keys"
tar -xzf "$work_dir/backups/artifacts.tar.gz" -C "$work_dir/restore/artifacts"
tar -xzf "$work_dir/backups/keys.tar.gz" -C "$work_dir/restore/keys"
test "$(digest "$work_dir/source/artifacts/sha256/aa/probe.tgz")" = "$(digest "$work_dir/restore/artifacts/sha256/aa/probe.tgz")"
cmp "$work_dir/source/keys/master.key" "$work_dir/restore/keys/master.key"
cmp "$work_dir/source/keys/signing.key" "$work_dir/restore/keys/signing.key"

echo "[T20] 验证 artifact 只读磁盘故障"
docker run --rm --name "$disk_probe" \
  -v "$work_dir/restore/artifacts:/artifacts:ro" \
  redis:8-alpine sh -ec \
  'test -r /artifacts/sha256/aa/probe.tgz; if touch /artifacts/write-must-fail 2>/dev/null; then exit 1; fi'

echo "T20 恢复演练通过: PostgreSQL=1 Redis=2 artifact=1 keys=2 kill/restart=2 disk-fault=1"
