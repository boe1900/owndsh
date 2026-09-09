<!--
[INPUT]: 依赖 Linux amd64 release、HTTP Compose、一次性管理员输入与部署方可选外部反向代理。
[OUTPUT]: 提供 Compose 快速部署入口，以及离线 release 安装、备份恢复、升级回滚、标准流日志采集和外部 TLS 接入说明。
[POS]: deploy 的详细运维入口；普通用户从根 Compose 开始，离线受控环境使用 release 包。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh 部署与运维

普通联网环境直接使用根目录 [Docker Compose 快速开始](../README.md#docker-compose-部署)，从 GHCR 拉取 `next` 前后端镜像。本文后续内容面向需要离线制品、完整校验、备份恢复与应用回滚的单机 Linux `amd64` 环境。

两种方式共用同一生产 Compose 拓扑。对外只有 Console 的 HTTP `8080`；Server、PostgreSQL 和 Redis 没有宿主端口。Console 与管理 API 同域。OwnDsh 不管理证书或终止 TLS；需要 HTTPS 时，由部署方现有的 Nginx、Ingress、负载均衡或零信任网关代理到该 HTTP 入口。

插件签名默认关闭，Compose 无需 `ENT_PLUGIN_SIGNING_PRIVATE_KEY`。显式开启时设置 `ENT_PLUGIN_SIGNING_ENABLED=true`、有效的 Ed25519 PKCS#8 私钥，并给客户端安装配置提供对应公钥与 `verifyPluginSignatures: true`。已有离线部署要继续签名，需在 `runtime.env` 显式设置 `ENT_PLUGIN_SIGNING_ENABLED=true`；原有密钥仍保留并随独立 key 归档备份。

升级应先更新员工 `owndsh-plugin` 再上传无签名插件：旧客户端不接受空签名。开关只影响新上传版本；已上传版本不会补签或清除签名，关闭后新增的无签名版本也不能由旧版服务端读取，回滚前需确认目标版本支持空签名。

## 交付包

在 Linux `amd64` Docker 主机的产品源码根目录构建：

```sh
./deploy/scripts/build-release.sh --version 0.1.0 --output /srv/releases
```

生成的 tarball 包含 `owndsh/server`、`owndsh/console` 镜像归档、PostgreSQL version 0 基线、Compose、运维脚本、预编译 Harness bundle、两份 MIT 许可证和 SHA-256 清单。空数据卷由 PostgreSQL 官方 initdb 只装载一次基线，Flyway 随后迁移；已有数据卷不会重放基线。构建使用固定 Maven 3.9.11、Temurin 21.0.8、Node 24.6.0、Nginx 1.28.0、PostgreSQL 17.6、Redis 7.4.5 标签与 digest。

默认从 `docker.io/library` 读取基础镜像。构建机或目标机网络受限时可设置 `OWNDSH_BASE_IMAGE_REGISTRY` 指向透明 registry mirror；Dockerfile 与 Compose 仍校验同一不可变 digest，mirror 不能替换镜像内容：

```sh
OWNDSH_BASE_IMAGE_REGISTRY=mirror.gcr.io/library \
  ./deploy/scripts/build-release.sh --version 0.1.0 --output /srv/releases
```

若构建机已缓存这四个精确 digest，但 registry 暂时不可访问，可显式使用受验本地缓存。脚本按锁定 SHA-256 反查 `RepoDigest`，任一镜像缺失或不匹配都会拒绝构建，不接受仅有可变 tag 的镜像：

```sh
OWNDSH_USE_LOCAL_BASE_IMAGES=1 \
  ./deploy/scripts/build-release.sh --version 0.1.0 --output /srv/releases
```

## 安装输入

目标机需要 Docker Engine + Compose v2、OpenSSL、curl、tar、gzip，以及 GNU `sha256sum` 或 macOS 自带的 `shasum`。准备：

- 唯一、无路径的 ASCII `http://` 或 `https://` 外部 authority；管理回调固定从它派生。
- Console 在宿主机发布的 HTTP 端口，默认 `8080`。
- 3-30 位初始管理员名，以及内容非空的临时密码文件；正式密码策略在首次登录改密时执行。
- IANA 配额时区；首次 migration 后不可修改。

解包后执行：

```sh
./scripts/install.sh \
  --state-dir /opt/owndsh \
  --public-base-url http://agent.internal:8080 \
  --bootstrap-admin admin \
  --bootstrap-password-file /secure-input/bootstrap-password \
  --http-port 8080 \
  --time-zone Asia/Shanghai
```

若外部网关提供 `https://agent.example.com`，只把 `public-base-url` 改成该 HTTPS 地址即可，Console 仍在内部使用 HTTP `8080`。管理回调自动派生为 `https://agent.example.com/enterprise/auth/callback`。外部网关应转发原始 `Host`、`X-Forwarded-Proto` 和 `X-Forwarded-Port`。

目标机需要 mirror 时，把环境变量放在安装命令之前；安装器会将通过字符校验的 registry 前缀写入 `runtime.env`，供后续重启、升级和恢复复用。

离线安装器会生成 PostgreSQL/Redis 密码、Sa-Token JWT secret、32 字节 master key，并在每次 Compose 操作时从独立 key 文件注入容器环境，不写入普通 `runtime.env`。bootstrap 密码从安装命令指定的文件临时注入且不复制进状态目录；数据库写入 `BOOTSTRAP_ADMIN_COMPLETED` 后，后续启动只读取 marker，不再创建管理员。初始管理员第一次 LOCAL 登录必须在同一登录事务中修改密码。

安装器不删除调用方传入的密码文件。调用方应在确认安装后按自身密钥流程处置输入文件。

## Harness 企业 profile

安装完成后，`STATE/harness/` 包含预编译 `.tgz` 和安装专属 `cordis.patch.yml`。在员工桌面使用 Harness 官方 CLI：

```sh
dsh plugin --profile enterprise add /approved/owndsh-plugin-0.1.0.tgz
install -m 600 /approved/cordis.patch.yml "$DSH_HOME/profiles/enterprise/cordis.patch.yml"
dsh --profile enterprise --dump-config
```

默认关闭服务端签名与客户端验签，不生成公私钥；profile overlay 只包含 `baseUrl` 和关闭的技术刺探开关。需要启用时，安装命令追加 `--enable-plugin-signing`，安装器才会生成 Ed25519 密钥对、设置 `ENT_PLUGIN_SIGNING_ENABLED=true`，并在 overlay 写入 `verifyPluginSignatures: true` 与公钥。不要把 signing 私钥、master key 或平台 Token复制到员工设备。

## 备份与恢复

普通数据与 key 必须落到不同目录；生产中还应复制到不同权限域和异地介质：

```sh
./scripts/backup.sh \
  --state-dir /opt/owndsh \
  --data-output /backup/enterprise-data \
  --key-output /key-custody/enterprise-keys
```

数据归档包含 PostgreSQL custom dump、Redis RDB、artifact tar 和非 secret runtime 元数据。key 归档包含 master key 和存在的 signing key，默认无签名文件也能备份/恢复，绝不进入普通数据库或 artifact 备份。master key 丢失后 provider secret 与 Session 正文不可恢复；signing key 丢失后不能延续既有插件信任根。

恢复会短暂停止 Console、Server 和 Redis，并覆盖目标安装中的数据库、Redis、artifact 与关键 key。恢复脚本先校验 Redis RDB，再由隔离的 Redis 进程加载 RDB 并生成 AOF，避免开启 AOF 的常规进程忽略独立 RDB：

```sh
./scripts/restore.sh \
  --state-dir /opt/owndsh \
  --data-backup /backup/enterprise-data/20260820T080000Z \
  --key-backup /key-custody/enterprise-keys/20260820T080000Z
```

## 升级与应用回滚

从新 release 解包目录执行升级。升级先调用正式备份，再加载新镜像、更新 `STATE/harness/` 中待分发的企业 bundle，并让 Flyway 前向迁移；安装专属 `cordis.patch.yml` 保持原样：

```sh
./scripts/upgrade.sh \
  --state-dir /opt/owndsh \
  --backup-root /backup/pre-upgrade-0.2.0
```

升级脚本不能越过设备边界修改员工 profile。服务端升级完成后，必须把输出的 bundle 重新分发，并在每个 Harness/Desktop profile 上执行上文的官方 `dsh plugin ... add`；否则旧客户端契约可能把新版 bootstrap 误报为平台不可用。应用回滚同样恢复待分发的旧 bundle，并需要重新执行官方 CLI。

若新应用需要降级，切回上一 release 的 Compose 指针和 Server/Console 镜像：

```sh
./scripts/rollback.sh --state-dir /opt/owndsh
```

回滚不会执行 migration undo，不恢复数据库、不替换 key，也不改变 PostgreSQL、Redis 或 artifact 卷；恢复旧 release 指针后可再次执行同一新版的 `upgrade.sh`。发布前必须确认旧应用可读取前向迁移后的 schema；不兼容时只能修复前进或按独立灾难恢复流程处理，不能把应用回滚伪装成数据库回滚。

## 日常检查

```sh
docker compose \
  --env-file /opt/owndsh/runtime.env \
  -f /opt/owndsh/releases/0.1.0/compose/compose.yml ps
curl --fail http://agent.internal:8080/healthz
```

Server 应用日志只写 stdout，JVM 标准错误保留在 stderr，由 Docker/K8s 和日志平台负责采集、轮转与保留。应用不再创建 `/app/logs`、文件日志或 Actuator logfile 端点；Compose 不再声明或挂载 `server_logs`。使用 `docker compose logs -f server` 或 `kubectl logs -f <pod> -c <server-container>` 查看日志。

已有部署需先构建并更新 Server 镜像，再移除 K8s 的日志 `volumeMounts`、专用 `volumes` 和对应权限初始化路径。旧镜像仍依赖文件日志；历史日志卷保留，按既有保留策略另行清理。`storage-init` 继续初始化 `artifacts` 插件卷权限。

手工 JAR 部署时，`server/script/bin/owndsh.sh start` / `restart` 改为前台运行并输出日志，长期后台运行交给 systemd 等进程管理器；Windows 脚本使用独立 Java 控制台窗口显示日志。

Actuator 只暴露不含详情的 health。不要运行 `docker compose down -v`；这会删除 PostgreSQL、Redis 和 artifact 数据卷。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
