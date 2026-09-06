# 真实模型转发验收 - 2026-09-06

首轮验证了 7 次真实供应商调用，发现取消释放延迟与供应商隐藏输入造成的预留缺口。随后修复取消链路，新增 3 次真实复测通过：取消后 667 毫秒确认结算及租约释放，两个模型的正常计量仍完全一致。Token 配额按确认的产品规则允许已获准请求超额完成，并在额度耗尽后拒绝新请求。

## 环境与边界

- 本地入口为 `http://localhost:18080`，保留现有供应商、模型、授权、会话与配额配置。
- 本地 Server/Console 已更新到本次修复，镜像分别为 `owndsh-server:local-gateway-20260906`、`owndsh-console:local-gateway-20260906`，健康检查正常，Flyway 已应用 V29。
- 升级前 PostgreSQL 备份为 `/tmp/owndsh-live-model-20260906/before-v29.dump`，目录权限为 0700；备份及包含运行凭据的配置不进入 Git。
- 调用链为锁定官方 `pi-ai@0.82.1` Responses 客户端、项目的 `startEnterpriseProxy`、Nginx、Server 授权/配额网关、已配置真实供应商。复用当前有效 Harness 会话；本轮没有操作 Desktop 聊天 UI。
- 当前配置的 `gpt-5.6-luna`、`gpt-5.6-terra` 都使用 Responses。没有配置其他协议的真实供应商，因此本轮不代表 Completions/Anthropic 的真实服务验收。
- 测试仅发送合成短文本与无副作用的 `echo_value` 工具定义；正常请求输出上限 128，取消请求上限 512，关闭客户端自动重试。
- 原始响应在单一消费链中采集，使用 OpenAI SDK 的 SSE 解析器提取最终 usage；没有旁路消费取消后的响应。供应商密钥保持由 Server 注入，未输出或写入验收记录。

## 结果

输入列是不含缓存的输入。每次完整请求均验证 `输入 + 输出 + 缓存 = 实测总量 = 配额扣额`，同时检查最终 usage 快照、唯一 finished 审计与 Redis 租约释放。

| 场景 | 模型 | 输入 | 输出 | 缓存 | 实测总量 | 结果 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 短流式 | gpt-5.6-luna | 552 | 6 | 3840 | 4398 | 通过，约 2.24 秒 |
| 短流式 | gpt-5.6-terra | 552 | 6 | 3840 | 4398 | 通过，约 1.78 秒 |
| 工具调用 | gpt-5.6-luna | 4430 | 19 | 0 | 4449 | 通过，`echo_value({"value":"gateway-ok"})`，约 2.27 秒 |
| 重复请求 1 | gpt-5.6-luna | 552 | 6 | 3840 | 4398 | 缓存计数一致，约 2.24 秒 |
| 重复请求 2 | gpt-5.6-luna | 552 | 6 | 3840 | 4398 | 缓存计数一致，约 2.68 秒 |
| 首段文本后取消 1 | gpt-5.6-terra | 未知 | 未知 | 未知 | 未知 | 最终 CHARGED_MAX，扣额 615；总历时 53.6 秒，10 秒清理等待断言失败 |
| 首段文本后取消 2 | gpt-5.6-terra | 未知 | 未知 | 未知 | 未知 | 第 4.05 秒取消，约 59.79 秒后确认账本和租约清理；扣额 615 |

5 次完整请求实测共 22041 tokens。另有 2 次未知用量，各扣额 615；它们没有混入实测总计，也未被伪装成输出 tokens。这不是供应商账单对账结果。

取消后的管理 API 也验证为 `totalTokens=0`、`chargedTokens=615`、`unmeasuredRequests=1`、`result=CHARGED_MAX`。控制台已显示实测总计、配额扣额和用量未知；未知的分类零值由 result 表示未知，不代表实际消耗为零。

## 首轮发现

1. **取消释放延迟。** 两次请求最终都正确结算、审计并释放租约，但第二次取消后约 60 秒仍占用资源。日志在流写入时报告 `Broken pipe`；`ModelGatewayService.GatewayStream.writeTo` 在 `exchange.next()` 等待上游时没有下游探活。需要补齐容器取消通知及有界的断开检测，并用“上游发出首段后静默”的真实 HTTP 测试验证取消到释放的时延。本轮不将最终清理成功视为及时释放验收通过。
2. **供应商额外输入使预留偏小。** 普通短请求本地仅预留 216/217 tokens，但供应商报告 4392 输入 + 6 输出；usage attribution 显示供应商 instructions 带来 4380 输入，其中 3840 命中缓存。`QuotaTokenEstimator` 只看到客户端正文，无法覆盖这部分隐藏输入。实测结算正确，但如启用严格 Token 配额，预留阶段不能据此承诺不超额；应先约束供应商额外注入，或按可验证的供应商输入开销修订预留规则。当前环境仅启用 RATE 策略，没有用真实账户执行 Token 超额实验。

## 请求证据

| 场景 | request ID |
| --- | --- |
| Luna 短流式 | `req_01M1TH51RB9RWZQ7J03GY92HV6` |
| Terra 短流式 | `req_01M1TH544EHM770V4CHKR7WNMK` |
| 工具调用 | `req_01M1TH6WPPN14VSFKJC03A42MP` |
| 重复请求 1 | `req_01M1TH7SQ333TT99SCFS8W838X` |
| 重复请求 2 | `req_01M1TH7W3NY7C8N6NS26FYKH8V` |
| 取消 1 | `req_01M1TH8K81PDNYJPH1T1BCW9X8` |
| 取消 2 | `req_01M1THDYPER36K6ESVV65HZQ9Q` |

本机执行脚本为 `/tmp/owndsh-real-model-smoke.mjs`，结果在 `/tmp/owndsh-live-model-20260906/results*.json`。脚本使用当前环境的既有会话，不创建或持久化新的认证凭据。两次取消的供应商最终 usage 均未收到，无法从客户端推导其精确实际消耗。

## 取消修复与复测

真实 Jetty/MVC HTTP 测试定位到两处原因：网关等待 `exchange.next()` 时没有周期下游探活；当前 Spring 的 `ServletServerHttpResponse.getBody()` 默认返回禁止 flush 的包装流，即使调用 `output.flush()`，小段正文也可能停留在缓冲区。

- Controller 使用 Servlet 可刷出的响应流，保留其异步生命周期；错误、超时及完成通知均触发清理。
- 服务在上游静默时每 5 秒发送 SSE 注释心跳，正文和心跳由同一线程写出；独立租约线程不会被下游写入阻塞。
- 取消先停止续租并关闭上游，再幂等结算。usage 观察、快照与结算由相同生命周期锁协调，已确认实测量不被取消覆盖。
- 新增真实 HTTP 测试让上游发送最终 usage 后静默，验证心跳实际到达客户端、断开与异步超时在 10 秒内清理，保留实测 15 tokens，账本与 finished 审计各一次。单元测试补充无 usage 时的取消、关闭顺序及阻塞心跳期间续租。

后端转发、计量、配额、迁移与审计回归共 **108 项通过，0 失败、0 跳过**。生产构建通过；本地 Server 已更新为 `owndsh-server:local-gateway-cancel-20260906`，Server/Console 均 healthy，入口仍为 `http://localhost:18080`。重建使用原 `compose.json` 叠加同目录 `cancel-fix.compose.json`，没有增加迁移或更改现有策略。

| 复测 | 实测总量 | 配额扣额 | 结果 | request ID |
| --- | ---: | ---: | --- | --- |
| Terra 首段文本后取消 | 未知 | 615 | 第 2.548 秒取消，667 毫秒后确认账本与 Redis 租约释放；CHARGED_MAX，finished 审计唯一 | `req_01M1TKE3Z5HWJETA13RTJ939HS` |
| Luna 正常流式 | 4398 | 4398 | 输入 552、输出 6、缓存 3840；供应商/客户端/账本一致 | `req_01M1TKEQ4T4SVXPP2QCEFA0MWS` |
| Terra 正常流式 | 4398 | 4398 | 输入 552、输出 6、缓存 3840；供应商/客户端/账本一致 | `req_01M1TKERNQP6H5CMQK87Y2Y4T2` |

复测命令为原脚本的 `cancel-fixed`、`normal-fixed` 模式，结果分别保存在 `results-cancel-fixed.json` 和 `results-normal-fixed.json`；取消模式新增小于 10 秒的断言，初测证据保留。667 毫秒是本次真实测量，心跳的断开检测仍取决于网络错误可见性；关闭连接不代表供应商保证立即停止计费。

## Token 超额规则

保留发送前预留检查；通过检查的请求允许完成，结算按真实 usage 全额记账，不截断到策略额度。已耗尽额度的窗口拒绝后续请求，其他已经获准的并发请求仍可完成，因此允许超额的可能是多笔在途请求。

真实 PostgreSQL 测试将日额度设为 110，已有消耗 87，同时批准两笔各预留 10 的请求。第一笔实际消耗 25，使累计变为 112，此时新的 1-token 请求被拒绝；第二笔仍按实际 30 完成，累计为 142、预留归零，重复结算不重复扣额，后续请求继续被拒绝。

供应商隐藏输入仍不在本地估算内；按此产品规则无需添加固定补偿配置，也不承诺固定的超额比例或金额上限。当前真实环境仍仅启用 RATE，Token 超额场景由数据库集成测试验证，没有修改真实账户额度。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
