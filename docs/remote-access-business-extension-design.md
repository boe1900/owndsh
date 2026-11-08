<!--
[INPUT]: docs/remote-access-implementation-design.md 的 Host Bridge 业务预留、上游 workspace/file/terminal 研究。
[OUTPUT]: 提供 R6/R7 业务 RPC 的候选 endpoint、scope、文件传输和终端生命周期约束。
[POS]: OwnDsh Remote 的后续业务扩展附录；不属于首期连接基础，也不授权任何未冻结 endpoint。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh Remote 业务扩展设计

本文只描述 R6 会话与工作区、R7 文件与终端的候选边界。首期连接基础只实现 `host.describe` 和统一的 `REMOTE_FEATURE_NOT_SUPPORTED`，具体 schema 需在产品页面冻结后另行确认。

## 1. Host Bridge RPC 分类

业务消息在 Noise 通道内使用：

```text
{ "type": "rpc.request", "requestId": "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "method": "session/list", "params": {} }
{ "type": "rpc.response", "requestId": "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "result": {} }
{ "type": "rpc.error", "requestId": "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "error": { "code": "REMOTE_SCOPE_DENIED" } }
{ "type": "event", "streamId": "str_01ARZ3NDEKTSV4RRFFQ69G5FAV", "event": "session/update", "data": {} }
```

Host endpoint 只允许注册表中的方法；未知方法返回 `REMOTE_FEATURE_NOT_SUPPORTED`。所有 mutation 都要求连接、用户、session/workspace/terminal/attachment scope 通过后才 dispatch 到 Gateway。

### 业务 endpoint 预留

产品首期连接基础不实现业务 endpoint，只冻结 capability 名称、方法命名和错误边界，供后续页面设计后接入：

```text
session.*
workspace.*
terminal.*
approval.*
model.*
plugin.*
```

Host 对尚未实现或未宣告的 endpoint 统一返回 `REMOTE_FEATURE_NOT_SUPPORTED`；控制端不得因为方法名存在就显示业务入口。具体 endpoint schema、流事件和 mutation 幂等规则在业务范围确认后另建实施章节。

### 会话与流（后续阶段）

后续阶段候选 endpoint：

```text
workspace/follow
session/list
session/page
session/events
session/follow
session/create
session/prompt
session/cancel
session/modelCatalog
session/selectModel
session/attachment
```

`session/prompt`、`session/create`、`session/cancel` 需要客户端生成 `operationId`；Host 维护短期 operation receipt，超时后返回 `unknown`，控制端先读取状态再重试，不能因连接失败自动重放 mutation。流消息必须保序，取消只取消目标 session，不影响其他 session。

审批和问题回答通过 `session/follow` / `session/events` 的事件投影传递；控制端的 approve/reject endpoint 必须在最终业务范围决策后加入，不能因上游存在就开放所有 Owner 操作。

### Workspace/File（后续阶段）

```text
workspace/list
workspace/stat
workspace/read
workspace/readBytes
workspace/download
workspace/upload
workspace/watch
```

Host 将客户端给出的相对路径解析到服务端已确认 workspace root，执行 realpath/containment 校验，拒绝绝对路径、`..` 穿越、符号链接逃逸、NUL 和控制字符。workspaceId 和 sessionId 必须来自 Host catalog，不能接受客户端自报 cwd。

文件传输使用 `transfer.open/chunk/close`：每个 chunk 带 transferId、sequence、length 和可选 sha256；单方向 active transfer 默认最多 2；chunk 不超过 48 KiB；Relay/secure frame 仍受 1 MiB/4 MiB 上限。大文件使用流，不把完整内容读入内存。上传、覆盖、删除、重命名、目录创建的首版范围列入待决策项。

### Terminal（后续阶段）

```text
terminal/environment
terminal/shells
terminal/list
terminal/create
terminal/write
terminal/resize
terminal/close
terminal/rename
terminal/retain
terminal/follow
```

每个 terminal 有 `terminalId`、sessionId、workspaceId、shell、cwd、state、controllerAttachmentId。只有创建或显式 retain 成功的 attachment 能调用 write/resize；关闭 attachment 会取消订阅，但 Host-owned process 可按策略保留。默认上限沿用上游：输入 64 KiB、cols 240、rows 100、总数 256、单 session 8、scrollback 1000、snapshot 256 KiB、follower 1 MiB、idle 2 小时、poll 30 秒。

Terminal 输出是 untrusted data，控制端按文本渲染，不执行 ANSI 中的链接或命令。断线后控制端重新 `retain`/`follow`，不能假设输出完整重放。
