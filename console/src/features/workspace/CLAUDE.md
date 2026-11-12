# workspace/

> L2 | 父级: ../CLAUDE.md

成员清单

workspace-devices-section.tsx: Console 侧栏专属设备目录，复用 Query 缓存与可用性裁决，可用项为原生新标签链接，不可用项保留键盘可读原因。
workspace-identity.ts: 原生 #root 兄弟身份条，固定设备名称、明确连接状态、当前 document 主动断开与新标签管控台链接，不改变原生品牌新会话语义。
workspace-api.ts: 复用生成的 Cookie operation 和 contracts schema，读取本人设备连接快照、以 expectedLinkId 准确断开并签发绑定当前登录和临时控制密钥的 ticket。
browser-link.ts: 单 document 的 Cookie WebSocket 所有者，经共享 Noise IK、lease ack 和 carrier ready 才提供远端 link；页面退出关闭，准确 link 的接管原因保留，不自动重发 mutation。
browser-link.test.ts: 使用真实双端 Noise/lease 和仅路由控制帧的浏览器服务器夹具，验证加密 HTTP、connect.reject/error 两条 busy 原因、准确 link 接管原因保留与页面退出释放。
native-assembly.ts: 校验精确 rc.5 静态 assembly，仅映射构建时固定资源并顺序执行官方 HTML injections/shell，拒绝外部代码来源。
native-transport.ts: 将官方 fetch/文本 WebSocket/loadBundle 接口接到唯一加密 link；少数装配 metadata 重绑当前 rpcId，业务路径永不回落本机。
native-transport.test.ts: 验证 metadata 关联、mutation 只转发一次、跨 origin 和非 API 路径拒绝。
native-image.ts: Markdown 内嵌图片与文件链接悬停图经加密 link 读取为组件拥有的 Blob URL，取消或卸载时释放，禁止直打 Console 本机。
native-image.test.ts: 验证媒体通过唯一 link、Blob 释放、拒绝后不回落与取消时不发送。
workspace-entry.ts: 独立 document 组合根，固定账号/设备、隔离 Storage、建链后启动官方 UI；集中发布 connecting/connected/disconnected 反馈，官方 boot 成功才标记已连接；主动断开保留终态，退出或原生启动失败释放 link，BFCache 恢复重新建链。
workspace-boundary.ts: 失联时遮罩与 root.inert 阻断原生操作；占用时先获取准确 link 快照，经原生 dialog 确认后断开，独立有界请求不复用已中止的连接 signal，陈旧确认要求重新操作。
workspace-controls.test.ts: 验证手动断开按钮、原生 root.inert、确认取消、重复提交与陈旧快照重新确认。
workspace-storage.ts: 仅在当前 document 隔离账号/设备 localStorage、sessionStorage 与 storage event，不修改 Storage.prototype。
workspace.css: 独立 document 的连接遮罩、原生接管确认与设备身份条样式，通过 flex 为原生根节点分配剩余视口高度，避免进入 Console React 样式树。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
