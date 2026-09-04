<!--
[INPUT]: 依赖当前 deploy Compose/Nginx/运维脚本、T21 历史全量演练与部署静态门禁。
[OUTPUT]: 记录当前 HTTP 交付拓扑，以及初始化、备份恢复、升级回滚的可追溯验收证据。
[POS]: 部署交付的验收真源，明确区分现行拓扑静态回归与旧 TLS 拓扑历史演练。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# T21 部署交付验收记录

状态：`completed`

初次验收日期：2026-08-20（Asia/Shanghai）

HTTP 拓扑收敛日期：2026-09-04（Asia/Shanghai）

## 结论

当前 Linux `amd64` release 的 Compose 只通过 Console 发布 HTTP `8080`；Nginx 提供静态资源、API/SSE 代理和健康检查，不管理证书、TLS 或 HSTS。需要 HTTPS 时由部署方已有 Nginx、Ingress 或负载均衡在外层终止。一次性初始化管理员、部署 secret、数据与 key 分离备份、恢复、前向升级和仅应用回滚保持不变。

2026-08-20 曾对旧 TLS 拓扑完整执行全新安装、无 bootstrap overlay 重启、数据/key 恢复、`0.1.0 -> 0.1.1` 升级和应用回滚；这些证据继续证明数据与运维脚本边界，但不证明 2026-09-04 的 HTTP 镜像已重新构建并完成全量安装。当前 HTTP 收敛只记录本轮实际运行的静态 Compose、脚本、协议和认证回归。

## 核心实现

- `deploy/compose/compose.yml` 固定 PostgreSQL 17.6、Redis 7.4.5 及全部 build/runtime 基础镜像 digest，强制 `linux/amd64`。PostgreSQL、Redis 和 Server 不发布宿主端口；Console 只发布 HTTP `8080`，Server/Console 使用只读根文件系统、最小 capability、`no-new-privileges`、tmpfs 和健康检查。
- `deploy/nginx/nginx.conf` 提供 HTTP 同源入口，规范传递可选上级代理的 HTTP(S) 协议与端口，模型 SSE 关闭 buffering。Nginx 全部临时目录位于 `/tmp`，因此只读根文件系统可正常运行。
- `application-deploy.yml` 通过 configtree 消费 Docker secrets，只暴露无详情 health，关闭 OpenAPI、监控、消息、MCP、任务、AI、工作流和样例能力。
- Flyway V12 仅在匹配上游精确已知 hash 时退役 `admin/test/test1` 与两个已知 client，不删除用户主键；新增 `password_change_required` 和无 secret 的 `ent_deployment_state`。
- `DeploymentBootstrapService` 在 PostgreSQL transaction advisory lock 内原子创建唯一 `enterprise_admin`、设置首次强制改密并写 `BOOTSTRAP_ADMIN_COMPLETED`。管理员、角色和 marker 全成全败；marker 存在后不再要求或读取 bootstrap secret。
- LOCAL 首次登录在同一事务中验证旧密码与新密码策略、更新 BCrypt hash 并清除首次改密标记；失败不会签发授权码或留下半完成状态。
- `build-release.sh` 交付镜像归档、PostgreSQL version 0 基线、Compose/Nginx/脚本、预构建 Harness bundle、许可证和 SHA-256 清单，不从同级 Harness checkout 取文件。
- `install.sh` 在写状态前校验 HTTP(S) authority、精确回调、HTTP 发布端口、管理员名、密码文件和 registry；不接收或保存证书。脚本生成 PostgreSQL/Redis/JWT/master/signing secrets，仅在首次 overlay 挂载 bootstrap 密码，完成后删除安装目录副本并以常规 Compose 重建 Server。
- `backup.sh` 把 PostgreSQL custom dump、Redis RDB、artifact 与非 secret runtime metadata 写入普通数据备份，把 master/signing key 写入独立 key 备份。
- `restore.sh` 先校验 RDB，清空精确 Redis 数据卷，再以隔离 Redis 进程关闭 AOF 加载 RDB、开启 AOF 并等待 rewrite/manifest 完成，避免 Redis 7 在 AOF 模式下忽略独立 `dump.rdb`。
- `upgrade.sh` 强制先备份再加载新镜像和前向迁移；`rollback.sh` 只切回上一组 Server/Console 镜像，显式验证 key 指纹且不执行 migration undo、不替换数据或 key。

## 环境与静态门禁

验收环境：

```text
Git 2.39.5
Node.js 24.14.1
admin pnpm 10.34.5
Harness pnpm 11.7.0
OpenJDK 21.0.12
Docker Engine 28.5.2
Docker Compose 2.40.3
Docker runtime: OrbStack x86_64
```

部署静态门禁：

```sh
node --test deploy/tests/deployment.test.mjs
node --test scripts/scan-sensitive-logs.test.mjs
```

2026-08-20 旧拓扑结果：部署配置 8/8 通过；日志扫描器 3/3 通过。门禁当时覆盖唯一 TLS 端口、digest、bootstrap overlay、registry 注入、可信代理头、只读 Gateway tmpfs、deploy profile、脚本语法、恢复 AOF 路径、回滚不碰数据及安装参数注入负例。

## Server 与管理端回归

受影响 PostgreSQL 定向门禁实际运行 9 项，覆盖身份用户名冲突、模型、网关事务、配额和插件服务端；这些测试都显式创建活动用户，不再借用 V12 已退役的默认账号：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=IdentityPersistenceIntegrationTest,ModelManagementIntegrationTest,ModelGatewayTransactionIntegrationTest,QuotaManagementIntegrationTest,PluginServerIntegrationTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

完整 Backend 41 模块 reactor 随后通过，`owndsh-enterprise` 138 项、`owndsh-server` 8 项均为零失败，总耗时 2 分 31 秒：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -Dmaven.test.skip=false -DskipTests=false test
```

管理端按锁定 pnpm 独占资源运行：

```sh
cd admin-web
corepack pnpm@10.34.5 test
corepack pnpm@10.34.5 lint
corepack pnpm@10.34.5 build:prod
```

结果：10 个文件、23 项测试通过，lint/TypeScript/OpenAPI 和 production build 通过。并行 jsdom UI 测试使用 10 秒有界用例预算；单独复现时原超时场景业务断言 2.65 秒通过，证明问题是默认 5 秒外层预算而非产品行为失败。

## Harness 与协议

```sh
cd plugin
corepack pnpm@11.7.0 typecheck
corepack pnpm@11.7.0 test
corepack pnpm@11.7.0 build
corepack pnpm@11.7.0 pack:bundle
corepack pnpm@11.7.0 --filter @owndsh/contracts check:generated
```

七个产品 package typecheck/build 通过，83 项 Vitest 与 4 项 workspace 边界测试通过；bundle 重新打包为 `artifacts/owndsh-plugin-0.1.0.tgz`。生成协议无漂移，产品源码仍不导入同级 Harness 或 Typert Remote shim。

## 2026-09-04 HTTP 拓扑回归

本轮验证当前 Compose 只发布 Console HTTP `8080`，不挂载证书 secret；Nginx 不含 SSL/HSTS 指令；安装脚本接受 HTTP/HTTPS 外部根地址但只管理本机 HTTP 发布端口；本地人工入口不再生成自签 CA。认证回归同时覆盖 HTTP `enterprise-admin` Cookie 与 HTTPS `__Host-enterprise-admin; Secure` Cookie。

实际结果：部署门禁 `10/10`；OpenAPI 生成无漂移且协议测试 `9/9`；Console 生产构建与测试 `38/38`；插件全部 package 类型检查/构建、Vitest `82/82` 和 workspace 边界 `4/4`；Java 25 模块定向构建及认证测试 `14/14` 均通过。

本轮没有重新构建 Linux release 镜像，也没有重新执行全新安装、备份恢复和升级回滚；以下全量运行结果是 2026-08-20 旧 TLS 拓扑的历史证据。

## 历史 TLS 全新安装证据（2026-08-20）

全新状态目录：`/tmp/owndsh-t21-state-fixed.owpNNs`。使用本地测试证书、`https://localhost:18443` authority 和镜像 digest mirror 完整执行安装，结果如下：

- Gateway 是唯一宿主发布端口，`GET /healthz` 返回 `{"groups":["liveness","readiness"],"status":"UP"}`。
- PostgreSQL、Redis、Server、Gateway 全部 healthy；Server/Gateway 镜像均为 `linux/amd64` 交付物。
- Flyway 当前版本为 V12；唯一 `BOOTSTRAP_ADMIN_COMPLETED` marker 指向 `platform.admin`。
- `platform.admin` 活动且仅绑定 `enterprise_admin`，`password_change_required=true`。
- 活动 `admin/test/test1` 为 0，两个已知默认 client 为 0。
- 安装状态中的 `bootstrap_admin_password` 已删除；移除 bootstrap overlay 后常规重启成功。
- 四个当前部署容器日志经正式扫描器检查，共 4 个文件、0 个秘密形状命中。

## 历史备份恢复证据（2026-08-20）

实际备份：

```text
data: /tmp/owndsh-t21-data-backup.PEzcdC/20260820T092550Z
keys: /tmp/owndsh-t21-key-backup.h8GweE/20260820T092550Z
```

普通数据备份含 `postgres.dump`、`redis.rdb`、`artifacts.tar.gz`、`runtime.env`、`backup.env` 和独立 SHA-256 清单，不含 key。key 备份只有 `enterprise-keys.tar.gz` 与自己的清单。

破坏探针后执行正式恢复，PostgreSQL、Redis、artifact 均从 `after` 恢复为 `before`；master/signing key 组合指纹恢复为 `fc2c6d0f077e129ae441026fde0a44da9e4ae22aeb927c0db404ce52938026c9`。Redis 恢复后的 AOF manifest/rewrite 完成，随后常规 Compose Redis 启动并读回原值。

## 历史升级与回滚证据（2026-08-20）

升级候选：

```text
/tmp/owndsh-t21-release-011.kN9czW/owndsh-0.1.1-linux-amd64.tgz
SHA-256: 255860c3edae72f3b259b040b7c4f89856e4b3b0d2ee58a6aedd2d797809f204
size: 321 MiB
```

`0.1.0 -> 0.1.1` 升级成功，随后应用回滚成功。回滚后 `OWNDSH_RELEASE_VERSION=0.1.1` 保留新 release 元数据，Server/Gateway 镜像回到 `0.1.0`；PostgreSQL、Redis、artifact 卷名不变，key 指纹不变，Flyway 保持 V12，部署继续在 `18443` 健康服务。这个行为明确区分“应用回滚”和“数据灾难恢复”。

## 上游与仓库边界

```sh
node scripts/upstream-baseline.mjs verify
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

三份产品上游锁匹配。同级 `deepseek-harness` 精确位于官方 `dsh-v0.1.0-rc.7`、提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，remote 正确且工作区干净；T21 没有修改 Harness 文件。

## 品味自检

- 唯一运行时事实源是 Compose + `runtime.env`；bootstrap overlay 只增加一次性输入，没有复制第二套生产拓扑。
- 初始化安全事实由数据库事务和 marker 保证，安装脚本只编排生命周期；并发、重启或脚本中断不会产生半个管理员。
- 普通数据与 key 备份从接口到目录物理分离；应用回滚和灾难恢复也是两个独立命令，没有用一个万能脚本模糊风险边界。
- 测试用户 fixture 显式创建活动主体，生产 migration 可以安全退役默认账号而不反向绑架旧测试。
- 新增手写文件均小于 800 行并带 L3；deploy、deployment、auth、migration、tests、admin、contracts、docs 的 L2 与项目 L1、README、详细设计和本记录已回环。

## 改进建议

下一次正式发版前，应使用新构建的 HTTP release 完整执行一次全新安装、备份恢复和升级回滚。该门禁不需要给 OwnDsh 增加 TLS；需要 HTTPS 的环境由部署方外层网关覆盖。

## 任务边界

部署交付只拥有 HTTP Compose 与生命周期脚本，不拥有部署方的域名、证书或 TLS 配置。历史演练不可冒充当前镜像演练，当前静态回归也不可替代发版前的全量安装门禁。
