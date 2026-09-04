# T02 协议骨架验收记录

状态：`completed`

验收日期：2026-08-18（Asia/Shanghai）

## 结论

T02 已完成。`contracts/enterprise-openapi.yaml` 是 Server、管理端与 Harness 中心 HTTP 的逻辑协议根；本任务只冻结通用 components，不提前声明尚无 Controller 和权限保护的业务 operation。T04 起按纵向任务增加受根文件引用的 `contracts/components/` 分片，生成器对完整 bundle 计算 hash，仍只有一个逻辑协议。

同一真源已生成 TypeScript DTO、Fetch client、strict Zod schema、自包含 Draft 2020-12 JSON Schema、错误码到 HTTP status 映射与协议 SHA-256。TypeScript 和 Java 均遍历 OpenAPI `x-enterprise-fixtures` 声明的同一组 fixture，不存在第二份手写 Java schema。

## 冻结契约

- 通用 `data/requestId` 成功 envelope、cursor page、`If-Match` revision 和 `Idempotency-Key`。
- `EnterpriseUserId`、`EnterpriseDeviceId`、`ManagedModelId`、`PluginVersionId`、`RemoteSessionId` 五类品牌 ID。
- 详细设计第 17 节全部 35 个稳定错误码及 `400/401/403/404/409/413/429/502/503/504` 映射。
- `ValidationErrorDetails`、`RevisionConflictDetails`、`QuotaExceededDetails`、`RequestConflictDetails` 显式错误细节，不接受任意 map。
- 两个成功 fixture、一个配额错误 fixture、未知错误码和未声明字段两个负例。

`Revision` 使用无 `int64` format 的受限 JSON integer，上限为 `Number.MAX_SAFE_INTEGER`。这是协议事实：线上的 JSON number、生成的 TypeScript `number` 和 Zod `z.int()` 必须同构，不能出现类型层为 number、运行时却解析成 bigint 的分裂。

## 生成边界

`@hey-api/openapi-ts 0.99.0`、Swagger Parser 和 Zod 版本均进入 pnpm lock。生成器先写临时目录，普通模式整体替换生成树，`--check` 只比较内容且不修改工作区。Hey API 默认的 Zod object 会剥离未知字段；T02 通过其 resolver 扩展点把 OpenAPI `additionalProperties: false` 生成为 `.strict()`，并由跨语言负例锁定该行为。

contracts 包仍继承 workspace 的 `strict`、`noUncheckedIndexedAccess` 等配置。仅该生成包关闭 `exactOptionalPropertyTypes`，原因是 Hey API 0.99.0 生成的 Fetch runtime 会把若干 Web API 可选字段显式传为 `undefined`；例外没有扩散到兄弟包，线协议仍由 strict Zod 和 JSON Schema fail closed。

## 自动验收

插件 workspace 实际执行：

```sh
corepack pnpm@11.7.0 install --frozen-lockfile
corepack pnpm@11.7.0 --filter @owndsh/contracts check:generated
corepack pnpm@11.7.0 --filter @owndsh/contracts typecheck
corepack pnpm@11.7.0 --filter @owndsh/contracts test
corepack pnpm@11.7.0 run check
corepack pnpm@11.7.0 run pack:contracts
corepack pnpm@11.7.0 run smoke:contracts
```

结果：contracts Vitest 4/4 通过，全部 5 个 fixture 的预期有效性一致；workspace typecheck/build/test、生成无漂移和全新临时 tarball consumer 通过。consumer 只安装发布 `.tgz`，不使用 workspace link、ambient shim 或同级 Harness 源码。

原有官方插件组合链路同时回归执行：

```sh
corepack pnpm@11.7.0 run pack:bundle
node scripts/t01-harness-smoke.mjs \
  --tgz ../artifacts/owndsh-plugin-0.1.0.tgz
```

结果：真实 bundle package consumer、锁定 Harness `web` profile、Client bundle、本地 status API 和 Session seed 全部通过，组合输出仍锁定 Harness commit `47f943859bef60e4160492346772ded9b24f765a`。

后端实际执行：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl owndsh-server -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=EnterpriseContractSchemaTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

结果：`Tests run: 1, Failures: 0, Errors: 0`，35 个 Maven reactor 模块成功。测试使用 `json-schema-validator 3.0.6` 与项目已有 Jackson 3，按 Draft 2020-12 验证生成 schema。

仓库边界实际执行：

```sh
./scripts/bootstrap-harness.sh --check-only
node scripts/upstream-baseline.mjs verify
git diff --check
```

三个检查均通过。同级 Harness 保持锁定 commit `47f943859bef60e4160492346772ded9b24f765a` 且工作区干净；T02 没有修改上游源码。

## 任务边界

T02 没有创建 Server Controller、业务 DTO、数据库模块或管理页面，也没有把通用 fixture 伪装成真实 operation contract test。T03 可以作为下一项独立任务开始，但尚未实施。
