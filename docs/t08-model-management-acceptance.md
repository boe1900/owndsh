# T08 模型管理验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T08 已完成，且没有进入 T09。Server 已提供 provider、受管模型和 USER/DEPT 模型授权管理，
并把当前用户的有效模型目录接入 ACTIVE `dsh-desktop` 设备 bootstrap。实现复用 T03 已落库的
`ent_model_provider`、`ent_managed_model` 和 `ent_model_grant`，没有新增 migration，也没有提前实现
配额、模型网关、插件分发或 Session 同步。

RuoYi PostgreSQL 基线的 `sys_user/sys_dept` 没有 `tenant_id`。详细设计第 5.1 节冻结的是单部署
固定 tenant，而不是 SaaS 多租户；因此企业模型链在 `ent_*` 表上按 tenant 约束，用户和部门使用
部署内全局主键。本次真实 PostgreSQL 测试发现并纠正了把 tenant 列错误投射到 RuoYi 系统表的实现。

## 核心实现

- `org.dromara.enterprise.model` 按 domain/application/persistence/web 分层，Spring composition root
  只负责装配 JDBC ports、短事务服务、provider probe、有效模型 resolver 和 bootstrap service。
- provider 支持 list/get/create/update/test/enable/disable；model 支持 CRUD、排序字段与启停；grant
  支持 list/create/update/delete 和最多 200 项的原子 batch create。19 个管理 operation 使用冻结的
  `ent:model:*`、`ent:grant:*` 权限码、UUID v4 `Idempotency-Key` 和 revision `If-Match`。
- 每次真实配置写入都在同一事务中完成资源 CAS、`BOOTSTRAP` revision 递增和显式 metadata 审计；
  默认授权唯一性由 PostgreSQL 部分唯一索引兜底，批量冲突全量回滚。
- model/grant DELETE 达到目标状态后可以安全重放；首次删除才递增 bootstrap revision 和写审计，
  已删除或并发删除不会制造虚假 revision。
- 有效模型是当前 USER 与当前 DEPT 授权并集，并要求 grant、model、provider 三层 `ACTIVE`；默认
  优先级固定为 USER、DEPT、最小 `sortOrder` fallback，同模型重复授权只输出一次。
- bootstrap 每次重新验证 Sa-Token terminal 对应设备的 owner、client 与 ACTIVE 状态，再读取当前
  RuoYi 用户和有效模型。runtime 只获得 alias、显示名和模型能力，不获得 provider、base URL、
  upstream model 或 credential。

## 密钥与上游探测

provider credential 创建时必填，更新时必须显式提交 `replaceSecret`。未替换会保持原始密文；替换
使用 T03 `SecretCipher` 的 `PROVIDER_SECRET` 用途和
`tenant_id:ent_model_provider:id:credential_ciphertext:key_version` AAD。明文字符/字节容器在局部使用后
清零，数据库只保存 ciphertext、12 字节 nonce 和 key version，所有响应只暴露
`credentialConfigured`。

provider test 接受尚未保存的 base URL、timeout 和可选新 credential；没有新 credential 时才解密
已保存值。JDK HttpClient 固定请求 `/models`、禁止所有重定向并丢弃正文，返回值只有 `success`、
`latencyMs` 和稳定 `upstreamStatus` 类别。审计 metadata、异常响应和测试日志均不包含 provider
名称、URL、上游模型或密钥。

## 协议验收

OpenAPI 逻辑真源新增 `components/model.yaml` 和 `paths/model.yaml`，总 operation 数为 42。T08 的
20 个 operation 均有实际 MockMvc 成功与失败请求；响应使用同源生成的严格 JSON Schema 验证，
覆盖缺失幂等键、缺失 revision、坏 cursor、资源不存在、坏 JSON 与设备撤销。

协议生成新增 provider/model/grant/bootstrap DTO、strict Zod、Fetch 类型、9 个独立 JSON Schema
以及 10 个正反 fixture。`provider-secret-leak.json` 明确证明任何 provider 响应夹带 credential 都会
被 Java JSON Schema 与 TypeScript Zod 拒绝；完整协议 hash 为
`a793affb5bd7ed8f8444cc0b0353e9b0bb05f9a03ef56bba830db1e3fb50cbfb`。

## 自动验收

T08 定向服务端门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false \
  -Dsurefire.failIfNoSpecifiedTests=false \
  -Dtest=EffectiveModelResolverTest,ProviderProbeTest,T08ApiContractTest,ModelManagementIntegrationTest test
```

结果：11 项全部通过。其中 PostgreSQL 17 Testcontainers 真实执行 1 项集成测试，覆盖 provider
密文保持、CAS、默认唯一冲突回滚、batch 全成全败、幂等删除、USER/DEPT 默认切换、三层停用、
ACTIVE bootstrap、设备撤销和审计秘密扫描；WireMock probe 覆盖 Bearer、状态分类和 no-redirect。

后端完整门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false test
```

结果：64 项全部通过，包含 PostgreSQL 17、Redis 8、OpenLDAP、WireMock、迁移、身份、PKCE、设备、
revision、审计和 T08 模型纵向回归。

跨端协议与插件 workspace 门禁：

```sh
corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-contracts generate
corepack pnpm@11.7.0 run check
```

结果：生成无漂移，6 个 package 的 typecheck/build 全部通过；contracts 4 项、llm-gateway 4 项、
session-sync 3 项、UI 7 项、platform-client 18 项、bundle 3 项和 workspace 4 项不变量全部通过。

## 上游与边界门禁

```sh
node scripts/upstream-baseline.mjs verify
./scripts/bootstrap-harness.sh --check-only
git diff --check
```

产品三个上游锁均匹配。同级 `deepseek-harness` 保持 detached HEAD
`47f943859bef60e4160492346772ded9b24f765a` 且工作区干净，本任务没有修改任何 Harness 文件。
所有手写 Java 文件均少于 800 行，新增业务文件具备 L3 契约，model 四层与测试/协议/文档 L2 地图
已同步。

## 任务边界

T09 可以在独立后续任务实现 quota policy/window、PostgreSQL reservation、Redis RPM/concurrency、
settlement/recovery 和 usage API。T08 没有调用真实 DeepSeek chat completion，没有实现 SSE、Token
预留或用量结算，也没有修改员工桌面 UI 或处理移动端；详细设计中的 T09-T23 仍为 `pending`。
