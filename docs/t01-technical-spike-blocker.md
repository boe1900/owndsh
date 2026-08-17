# T01 技术刺探阻塞记录

状态：`in_progress`（首项技术刺探未通过，主线停止）

记录日期：2026-08-17（Asia/Shanghai）

## 阻塞结论

锁定 DeepSeek Harness `47f943859bef60e4160492346772ded9b24f765a`（`0.1.0-rc.5`）不能从树外 workspace 为 `@enterprise-agent/dsh-platform-client` 生成 Typert Remote contribution。生成器能发现 package、`enterprisePlatform` Service 和 `authStatus` 成员，但生成模型的 `invocations` 为空；package 按公开约定声明 `./remote` 出口后，构建以如下稳定错误终止：

```text
TypertAnalysisError: typert(host): @enterprise-agent/dsh-platform-client publishes Remote artifacts but has no Remote methods
```

第 16.2 节要求树外 package 完成 Typert 生成、Host 服务发现、Client 自挂载和浏览器调用，并规定公开扩展点不成立时 T01 失败、停止主线。当前失败发生在这条链的第一步，因此没有继续 PKCE loopback、Sa-Token `deviceId`/不共享 Token、SSE 代理、Client slot、企业 `.tgz` 安装和 Session seed 恢复刺探，也没有开始 T02。

## 最小复现

试验时的复现 workspace 位于产品仓库的 `harness-plugin/`，只使用锁定 Harness 的公开 package exports。最小 Host 类为：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

class EnterprisePlatformService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'enterprisePlatform', { namespace: 'enterprise' })
  }

  @Remote
  authStatus(): { readonly state: 'SIGNED_OUT' } {
    return { state: 'SIGNED_OUT' }
  }
}
```

package 按生成器 README 声明 `./typert` 和 `./remote`，workspace 根 `tsconfig.host.json` 通过 project reference 引用 package 的普通 `tsconfig.json`，构建配置调用公开的 `typertPlugin({ mode: 'package', faces: ['host'] })`。实际运行：

```sh
corepack pnpm@11.7.0 install --no-frozen-lockfile
corepack pnpm@11.7.0 --filter @enterprise-agent/dsh-platform-client run build
```

以下两种公开包消费形态均得到同一错误：

1. `link:` 指向锁定 checkout 中已构建的 `@deepseek-ai/dsh-typert-protocol` package，并分别测试 TypeScript `preserveSymlinks` 关闭和开启。
2. 在未修改的锁定 checkout 中执行 `pnpm pack`，把生成的 `@deepseek-ai/dsh-typert-protocol-0.1.0-rc.5.tgz` 作为普通 `file:` 开发依赖安装。

第二种复现排除了 pnpm workspace link 身份造成的假象。Harness checkout 在复现前后均保持锁定 commit，`git status --porcelain` 为空。

## 根因定位

`WorkspaceAnalyzer` 的输出证明 package discovery 和 Service discovery 正常：

```json
{
  "package": "@enterprise-agent/dsh-platform-client",
  "services": ["enterprisePlatform"],
  "members": ["authStatus"],
  "invocations": []
}
```

锁定生成器的 `isTypeMetaSymbol()` 只在下列任一条件成立时把符号认作 `Remote`/`TypertRemoteService` 元符号：声明文件属于当前分析 workspace 中登记为 `@deepseek-ai/dsh-typert-protocol` 的 package，或声明被包在同名 ambient module 中。树外消费者安装到 `node_modules` 的协议包使用直接 ESM 声明，不属于当前 workspace，也没有 ambient module 外壳，所以装饰器语法虽被发现，符号身份校验仍失败，最终不产生 invocation。

Harness 自带生成器 fixture 使用手写 ambient `typert-protocol.d.ts`，只能证明 fixture 模式，不能证明真实树外 package 消费已安装公开包。产品不得复制该 shim，否则测试会绕过实际发布形态并产生错误的通过结论。

相关上游位置：

- `packages/typert/generator/src/analyzer.ts`：`isTypeMetaSymbol()` 的元符号来源判定。
- `packages/typert/generator/src/workspace.ts`：声明 `./remote` 但 invocation 为空时的拒绝。
- `packages/typert/generator/tests/fixtures/remote-model/typert-protocol.d.ts`：当前仅在 ambient fixture 中成立的协议身份。

## 已拒绝的绕过

- 不把 ambient `@deepseek-ai/dsh-typert-protocol` shim 加入产品编译。
- 不把同级 Harness 源码目录加入产品 TypeScript project references 或 `paths`。
- 不复制生成器、协议包或 `api-remotes` 源码到产品仓库。
- 不手写 Remote contribution，也不修改 `@deepseek-ai/dsh-api-remotes` 的固定集合。
- 不修改同级 Harness checkout 的任何跟踪文件。

这些做法会让 T01 看似通过，却无法证明发布后的树外 `.tgz` 使用官方公开扩展点工作，违反第 4 节仓库边界和第 16.2 节退出条件。

## 解锁条件

只有同时满足以下条件后才能继续 T01：

1. DeepSeek Harness 官方生成器支持从已安装的公开 `@deepseek-ai/dsh-typert-protocol` package 识别 Remote 元符号，并有不依赖 ambient shim 的树外 fixture。
2. 官方变更包含生成器测试、树外发布文档和可由 package consumer 调用的构建入口。
3. `upstream/deepseek-harness.lock.json` 更新到包含该能力的新 commit，`./scripts/bootstrap-harness.sh` 在干净同级 checkout 上通过。
4. 重新从 T01 第一项开始，完成七项自动测试或可重复 smoke、企业 bundle `.tgz` 安装和真实浏览器调用后，才把 T01 标记为 `completed` 并开始 T02。

## 本次仓库处置

失败的试验 package 和生成制品没有保留在产品主线；它们不能通过 workspace build，也不是可交付代码。产品仓库只提交本阻塞记录、详细设计状态和 README 导航。没有创建空接口、占位 package 或 T02 预实现。
