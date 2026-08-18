# T11 Harness 模型链路验收记录

状态：`completed`

验收日期：2026-08-19（Asia/Shanghai）

## 结论

T11 已完成，且没有进入 T12。企业 bundle 在未修改的 DeepSeek Harness
`dsh-v0.1.0-rc.7` 真实 `web` profile 中通过官方 `ctx.llm` 注册唯一 provider
`enterprise`。员工完成企业 PKCE 后，本机不配置任何上游 API Key，即可取得动态模型目录、解析
`enterprise/default` 并完成 reasoning、text、tool call、usage 与 finish 的中心模型流。

失败链路同样经过真实 `LlmRuntime`：模型未分配、日配额超限和设备撤销分别成为 code 为
`ENT_MODEL_NOT_ASSIGNED`、`ENT_QUOTA_DAILY_EXCEEDED` 和 `ENT_DEVICE_REVOKED` 的终端 error
finish。模型请求不绕浏览器本地 API，平台 Token 只由 Host 内存 Service 注入中心 HTTPS 请求。

## 核心实现

- `EnterpriseGatewayAdapter extends LlmAdapter` 从当前 bootstrap 生成目录；精确 alias 与
  `enterprise/default` 都通过 `resolveModel()` 返回上下文、最大输出、文本能力和 reasoning effort。
- `registerEnterpriseGateway()` 使用官方 `registerAdapter(['enterprise'], adapter)`；bootstrap 模型
  事实变化时对同一 handle 原子执行 `replace(['enterprise'])`，复用 `llm/adapters-updated`，不创建
  产品私有目录事件。
- adapter 通过 `EnterprisePlatformService.request()` 直连
  `/enterprise/gateway/v1/chat/completions`。它自己只生成 attribution、幂等键和版本 header，平台
  Service 是唯一读取内存 Token 并注入 `Authorization` 的代码路径。
- Harness message 映射遵循 rc.7 官方 DeepSeek adapter 的文本、tool result 与 thinking passback
  规则；中心 SSE 被分层处理为 framing、wire 词汇和 StreamChunk 翻译。
- provider retry policy 固定为单次尝试。调用方 abort 或提前停止迭代都会中止 fetch、取消 reader
  并等待停稳；HTTP/流内错误不透传中心或上游原始 message。
- bundle profile 把 `agent-default-model` 覆盖为 provider `enterprise`、model
  `enterprise/default`；同时停用 `llm-deepseek`、`llm-pi-ai` 和个人
  Models 设置页，不把个人 Key 作为企业调用回退。

## rc.7 依赖解析

bundle 与 llm-gateway 的 `@deepseek-ai/dsh-llm` peer 均精确固定为 `0.1.0-rc.7`，不使用会自动
接受后续 rc 的范围。真实 profile 的 pnpm 配置为 `autoInstallPeers: false`：它不会在插件目录再装一份
LLM runtime，而由 rc.7 官方新增的 app dependency fallback 从 Harness 安装闭包解析 Service
Definition。组合验收实际加载 bundle 并调用 `ctx.llm`，证明这条官方树外插件解析路径成立。

## Server 与协议

T11 在既有严格 chat request 增加 `thinking.type=enabled|disabled` 与
`reasoning_effort=high|max`。Server 拒绝未知组合，并在 route 解析后再次核对受管模型的
`reasoning` 能力；不支持的模型在配额预留、上游建连和审计前失败。协议继续禁止 provider、base URL、
上游模型和 credential 字段。

本任务生成后的完整逻辑协议 SHA-256 为：

```text
9ab358ded0311768e00783b3b0f769effb2a3ebe058eb81fe8915622a6518af5
```

## 自动验收

插件 workspace 完整门禁：

```sh
corepack pnpm@11.7.0 run check
```

结果：6 个产品 package 的 typecheck/build 全部通过；contracts 6 项、session-sync 3 项、UI 7 项、
platform-client 18 项、llm-gateway 14 项、bundle 3 项和 workspace 4 项不变量全部通过。

Server 定向 reasoning/request 门禁：

```sh
JAVA_HOME=/usr/local/opt/openjdk@21 \
PATH=/usr/local/opt/openjdk@21/bin:$PATH \
./mvnw -B -ntp -pl ruoyi-modules/ruoyi-enterprise -am \
  -Dmaven.test.skip=false -DskipTests=false \
  -Dtest=GatewayChatRequestParserTest,ModelGatewayServiceTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

结果：8 项全部通过，包括合法/非法 thinking 组合和非 reasoning 模型在 quota 前拒绝。

## 真实 bundle 与 Harness

```sh
corepack pnpm@11.7.0 run pack:bundle
corepack pnpm@11.7.0 run accept:t11-model -- \
  --tgz ../artifacts/enterprise-agent-dsh-bundle-0.1.0.tgz
```

`scripts/t11-harness-model-smoke.mjs` 执行以下不可替代的组合事实：

1. 先校验同级 Harness 精确 commit 和 clean worktree，再把真实 tgz 安装到临时 `web` profile。
2. 通过临时系统 opener 完成真实 platform-client PKCE、Token、enroll 和 bootstrap 状态机。
3. 临时验收插件只使用 profile 内的 `ctx.llm.listProviders()`、`listModels()`、
   `resolveModelInfo()` 和 `stream()`；它不进入发行 tarball。
4. 目录从 `managed-reasoner` 热更新为两个模型，且 topology 计数证明官方 registration replace 已发布。
5. 成功流包含 reasoning、text、tool call、分离 cache/reasoning usage 和 tool-calls finish。
6. 三个失败 code、HTTP status 和同一 requestId 经过跨 package rc.7 error normalization 后保持稳定。
7. 每个中心请求都含平台 Bearer Token、幂等键、Harness attribution 与两个版本 header；body 不含
   provider、base URL、上游模型 route 或 credential。

现有无 ambient shim package consumer 和 T01 Harness 本地 API/Client/Session seed smoke 继续作为
最终门禁运行；T11 没有恢复 Typert Remote、ambient shim 或 Harness 源码路径。

## 安全与边界门禁

验收进程从 Harness 子进程环境移除所有匹配 API key/access token/client secret 的变量。完成四次模型
请求后，脚本扫描临时 `DSH_HOME` 的非依赖文件：平台 Token、`DEEPSEEK_API_KEY`、
`OPENAI_API_KEY` 和 `ANTHROPIC_API_KEY` 均不存在。installation 文件仍只含非秘密设备事实。

组合验收退出前关闭 Harness 与假平台、删除临时 profile，并再次断言同级 `deepseek-harness` 位于
`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 且工作区为空。本任务没有修改任何上游文件。

## 任务边界

T12 可以在独立后续任务交付管理控制台。T11 没有提前实现管理页面、插件分发、Session 同步、部署或
移动端；详细设计中的 T12-T23 仍为 `pending`。
