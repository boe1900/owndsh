# T04 身份适配器验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T04 已完成，且没有进入 T05。`owndsh-enterprise` 已建立统一 `IdentityAdapter` 边界，并实现
OIDC、LDAP、LOCAL 三类真实身份适配器；外部身份只依据身份源、issuer 与稳定 subject 解析，
不会按 username 或 email 隐式合并账号。显式绑定冲突、首次用户同步、外部组到部门的显式映射、
身份源与组映射管理 API 均已落地。

本任务同时扩展唯一 OpenAPI 3.1 真源及 TypeScript/Java 消费链，加入 10 个身份治理 operation、
严格 DTO、成功/错误 envelope、revision CAS、opaque cursor 和脱敏响应。T05 的登录事务、PKCE
回调、Sa-Token client 隔离、设备 enroll/heartbeat/revoke 以及公开登录页面均未提前实现。

## 身份协议边界

OIDC adapter 使用 Nimbus 执行 Discovery、Authorization Code + PKCE code 交换和 ID Token 校验。
校验算法来自 Discovery 声明，而非无条件信任 Token header；issuer、audience、nonce、JWKS 与
Discovery 的 authorization/token/JWKS HTTPS 端点均受检查。adapter 只输出映射后的
`IdentityPrincipal`，原始 Token 和未映射 claims 不跨越其边界。HTTP issuer 仅能由显式开发配置
`enterprise.auth.allow-insecure-oidc=true` 放开。

LDAP adapter 使用 manager search 后再以用户 DN bind，过滤值按 RFC 4515 转义；必须配置稳定
属性（例如 `entryUUID`），不会回退到可变用户名。传输层强制 LDAPS 与 StartTLS 二选一，测试使用
真实 OpenLDAP StartTLS 和主机名校验。

LOCAL adapter 复用 原始服务端框架 BCrypt 与 Redis 登录失败策略，并以 `sys_user.user_id` 作为稳定 subject。
账号不存在、密码错误、账号停用和锁定都走不枚举账号的统一失败路径；停用账号即使密码正确也会
累计失败次数，不会意外清空锁定状态。密码和身份源 secret 在 Java 边界使用可清零 `char[]`。

`ExternalIdentityService` 只按 `(tenant, source, issuer, subject)` 查找绑定。首次外部登录创建独立
平台用户；已有 subject 指向其他用户时拒绝显式绑定。组映射只应用管理员配置的外部组，映射到
多个不同部门时不覆盖已有部门，也不从外部组名自动派生平台角色。

## 管理 API 与秘密隔离

管理 API 位于 `/enterprise/admin/v1/identity-sources` 与
`/enterprise/admin/v1/group-mappings`，共提供身份源 list/get/create/update/test/enable/disable
和组映射 list/create/delete。读写分别要求 `ent:identity:read`、`ent:identity:write`；修改操作使用
expected revision CAS，并统一返回 canonical `requestId`、`data` 或稳定错误 envelope。

两个列表使用 PostgreSQL `id > afterId` keyset 查询，`limit` 范围为 1 至 200。opaque cursor
使用 master key 的独立 `API_CURSOR` purpose 派生 AES-GCM key，AAD 绑定 tenant、列表种类和
筛选条件；篡改、跨 tenant、跨列表或不同筛选条件重放均返回 400。

OIDC client secret 与 LDAP manager password 只以 AES-GCM 密文进入数据库，AAD 绑定 tenant、
表、记录、字段和 key version。管理响应只暴露 `secretConfigured`，OpenAPI 将写入 secret 标记为
`writeOnly`，不返回明文、密文、nonce 或 key version。

## 协议与文档同构

根 OpenAPI 文件保持在 800 行以内，身份 schema 拆分至 `contracts/components/identity.yaml`。
生成器先 bundle 完整逻辑协议再计算 SHA-256，因此根文件或组件分片的变化都会触发漂移失败。
已更新 TypeScript 类型、严格 Zod schema、fixture manifest 和 Java JSON Schema 消费测试；新增
模块均具备 L2 地图，业务与测试文件具备 L3 INPUT/OUTPUT/POS 契约。

## 自动验收

身份纵向与既有数据库能力实际执行：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise -am \
  -Dmaven.test.skip=false test
```

结果：39 个测试全部通过，其中 T04 相关测试 29 个：WireMock OIDC 6 个、OpenLDAP 3 个、LOCAL
3 个、PostgreSQL identity persistence 4 个、MockMvc 管理 API 6 个、秘密/cursor 密码学 7 个。
T03 的 migration/RBAC/revision 审计回归 10 个也全部通过。

全后端回归实际执行：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -Dmaven.test.skip=false test
```

结果：Maven 41 个 reactor 模块全部成功；`owndsh-enterprise` 39 个测试、`owndsh-server` 3 个测试
均通过。后者包含从 OpenAPI 生成 schema 对 T04 身份 fixture 的同源校验。

契约门禁从 pnpm workspace 根 `plugin/` 实际执行：

```sh
pnpm --filter @owndsh/contracts check:generated
pnpm --filter @owndsh/contracts typecheck
pnpm --filter @owndsh/contracts test
```

结果：生成漂移检查和 TypeScript 类型检查通过，Vitest 4 个测试全部通过。

边界门禁实际执行：

```sh
./scripts/bootstrap-harness.sh --check-only
node scripts/upstream-baseline.mjs verify
git diff --check
```

三项均通过；秘密哨兵在 `owndsh-enterprise` 与 `owndsh-server` Surefire 报告中的扫描结果为零。
同级 `deepseek-harness` 保持提交 `47f943859bef60e4160492346772ded9b24f765a` 且工作区干净，
T04 没有修改任何 Harness 文件。OpenAPI 根文件 774 行、最大生成 TypeScript 文件 794 行，新增
业务、测试与文档文件均低于 800 行。

## 任务边界

T05 可以在独立后续任务复用这里的 adapter、external identity 和管理配置，实现登录事务、PKCE、
Sa-Token client 隔离及设备生命周期。T04 不以空 callback、临时 Token 存储、TODO 或 mock 页面
提前占位。
