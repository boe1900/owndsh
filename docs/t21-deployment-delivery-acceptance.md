# T21 部署交付验收记录

状态：`completed`

验收日期：2026-08-20（Asia/Shanghai）

## 结论

T21 已完成，且没有进入 T22。平台现在具备可复现的 Linux `amd64` release、只发布 Gateway HTTPS 的单机 Compose、Nginx TLS/可信代理头边界、一次性初始化管理员、部署 secret 生成、健康检查、数据与 key 分离备份、恢复、前向升级和仅应用回滚。

全新状态目录安装、无 bootstrap overlay 常规重启、数据/key 恢复、`0.1.0 -> 0.1.1` 升级和应用回滚均在 `x86_64` Linux Docker runtime 上实际执行。回滚后数据库、Redis、artifact 卷和 key 指纹保持不变，Flyway 保持 V12；当前四个服务健康，唯一宿主端口为 Gateway `18443`。

## 核心实现

- `deploy/compose/compose.yml` 固定 PostgreSQL 17.6、Redis 7.4.5 及全部 build/runtime 基础镜像 digest，强制 `linux/amd64`。PostgreSQL、Redis 和 Server 不发布宿主端口；Server/Gateway 使用只读根文件系统、最小 capability、`no-new-privileges`、tmpfs 和健康检查。
- `deploy/nginx/nginx.conf` 提供 TLS 1.2/1.3 同源入口，覆盖而非追加客户端 `Forwarded`/`X-Forwarded-*`，模型 SSE 关闭 buffering。Nginx 全部临时目录位于 `/tmp`，因此只读根文件系统可正常运行。
- `application-deploy.yml` 通过 configtree 消费 Docker secrets，只暴露无详情 health，关闭 OpenAPI、监控、消息、MCP、任务、AI、工作流和样例能力。
- Flyway V12 仅在匹配上游精确已知 hash 时退役 `admin/test/test1` 与两个已知 client，不删除用户主键；新增 `password_change_required` 和无 secret 的 `ent_deployment_state`。
- `DeploymentBootstrapService` 在 PostgreSQL transaction advisory lock 内原子创建唯一 `enterprise_admin`、设置首次强制改密并写 `BOOTSTRAP_ADMIN_COMPLETED`。管理员、角色和 marker 全成全败；marker 存在后不再要求或读取 bootstrap secret。
- LOCAL 首次登录在同一事务中验证旧密码与新密码策略、更新 BCrypt hash 并清除首次改密标记；失败不会签发授权码或留下半完成状态。
- `build-release.sh` 交付镜像归档、PostgreSQL version 0 基线、Compose/Nginx/脚本、预构建 Harness bundle、许可证和 SHA-256 清单，不从同级 Harness checkout 取文件。
- `install.sh` 在写状态前校验 authority、回调、端口、管理员名、密码、证书和 registry；生成 PostgreSQL/Redis/JWT/master/signing secrets，仅在首次 overlay 挂载 bootstrap 密码，完成后删除安装目录副本并以常规 Compose 重建 Server。
- `backup.sh` 把 PostgreSQL custom dump、Redis RDB、artifact 与非 secret runtime metadata 写入普通数据备份，把 master/signing key 写入独立 key 备份。
- `restore.sh` 先校验 RDB，清空精确 Redis 数据卷，再以隔离 Redis 进程关闭 AOF 加载 RDB、开启 AOF 并等待 rewrite/manifest 完成，避免 Redis 7 在 AOF 模式下忽略独立 `dump.rdb`。
- `upgrade.sh` 强制先备份再加载新镜像和前向迁移；`rollback.sh` 只切回上一组 Server/Gateway 镜像，显式验证 key 指纹且不执行 migration undo、不替换数据或 key。

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

结果：部署配置 8/8 通过；日志扫描器 3/3 通过。门禁覆盖唯一 TLS 端口、digest、bootstrap overlay、registry 注入、可信代理头、只读 Gateway tmpfs、deploy profile、脚本语法、恢复 AOF 路径、回滚不碰数据及安装参数注入负例。

## Server 与管理端回归

受影响 PostgreSQL 定向门禁实际运行 9 项，覆盖身份用户名冲突、模型、网关事务、配额和插件服务端；这些测试都显式创建活动用户，不再借用 V12 已退役的默认账号：

```sh
cd backend
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=IdentityPersistenceIntegrationTest,ModelManagementIntegrationTest,ModelGatewayTransactionIntegrationTest,QuotaManagementIntegrationTest,PluginServerIntegrationTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

完整 Backend 41 模块 reactor 随后通过，`ruoyi-enterprise` 138 项、`ruoyi-admin` 8 项均为零失败，总耗时 2 分 31 秒：

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
cd harness-plugin
corepack pnpm@11.7.0 typecheck
corepack pnpm@11.7.0 test
corepack pnpm@11.7.0 build
corepack pnpm@11.7.0 pack:bundle
corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-contracts check:generated
```

七个产品 package typecheck/build 通过，83 项 Vitest 与 4 项 workspace 边界测试通过；bundle 重新打包为 `artifacts/enterprise-agent-dsh-bundle-0.1.0.tgz`。生成协议无漂移，产品源码仍不导入同级 Harness 或 Typert Remote shim。

## 全新安装证据

全新状态目录：`/tmp/eap-t21-state-fixed.owpNNs`。使用本地测试证书、`https://localhost:18443` authority 和镜像 digest mirror 完整执行安装，结果如下：

- Gateway 是唯一宿主发布端口，`GET /healthz` 返回 `{"groups":["liveness","readiness"],"status":"UP"}`。
- PostgreSQL、Redis、Server、Gateway 全部 healthy；Server/Gateway 镜像均为 `linux/amd64` 交付物。
- Flyway 当前版本为 V12；唯一 `BOOTSTRAP_ADMIN_COMPLETED` marker 指向 `platform.admin`。
- `platform.admin` 活动且仅绑定 `enterprise_admin`，`password_change_required=true`。
- 活动 `admin/test/test1` 为 0，两个已知默认 client 为 0。
- 安装状态中的 `bootstrap_admin_password` 已删除；移除 bootstrap overlay 后常规重启成功。
- 四个当前部署容器日志经正式扫描器检查，共 4 个文件、0 个秘密形状命中。

## 备份恢复证据

实际备份：

```text
data: /tmp/eap-t21-data-backup.PEzcdC/20260820T092550Z
keys: /tmp/eap-t21-key-backup.h8GweE/20260820T092550Z
```

普通数据备份含 `postgres.dump`、`redis.rdb`、`artifacts.tar.gz`、`runtime.env`、`backup.env` 和独立 SHA-256 清单，不含 key。key 备份只有 `enterprise-keys.tar.gz` 与自己的清单。

破坏探针后执行正式恢复，PostgreSQL、Redis、artifact 均从 `after` 恢复为 `before`；master/signing key 组合指纹恢复为 `fc2c6d0f077e129ae441026fde0a44da9e4ae22aeb927c0db404ce52938026c9`。Redis 恢复后的 AOF manifest/rewrite 完成，随后常规 Compose Redis 启动并读回原值。

## 升级与回滚证据

升级候选：

```text
/tmp/eap-t21-release-011.kN9czW/enterprise-agent-platform-0.1.1-linux-amd64.tgz
SHA-256: 255860c3edae72f3b259b040b7c4f89856e4b3b0d2ee58a6aedd2d797809f204
size: 321 MiB
```

`0.1.0 -> 0.1.1` 升级成功，随后应用回滚成功。回滚后 `EAP_RELEASE_VERSION=0.1.1` 保留新 release 元数据，Server/Gateway 镜像回到 `0.1.0`；PostgreSQL、Redis、artifact 卷名不变，key 指纹不变，Flyway 保持 V12，部署继续在 `18443` 健康服务。这个行为明确区分“应用回滚”和“数据灾难恢复”。

## 上游与仓库边界

```sh
node scripts/upstream-baseline.mjs verify-locks
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

T22 应只固化假 IdP/LDAP/DeepSeek upstream/测试插件并自动化详细设计第 21.1 节 14 步功能候选流程，同时补充真实产品 GIF 和简单人工页面验收。当前 MVP 不作为生产上线候选，因此不执行镜像漏洞扫描；不要在候选版任务里改变 T21 的单机拓扑、引入多节点编排或把 key 合并回普通备份。

## 任务边界

T22 是唯一下一项。T22 必须在 T21 本提交之后独立开发、验收和提交；本任务未创建假外部系统、14 步 E2E 或候选版媒体。
