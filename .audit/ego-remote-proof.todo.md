# Ego 远程面板验证

基线 a2b435474 已提交并 push 到 origin/main，远端分支核对一致。Ego 新行为在独立验证目录与测试服务中执行。

## Prototype

1. Scope the decision the prototype exists to make: which layout, which interaction, which density, or for an empirical fork which behavior, timing, or approach. No decision means no prototype. Route to Feature.
2. Gather references when the design space is open. Search for prior art, summarize a moodboard of themes, palettes, and layouts, let the user pick directions before building. Skip when the direction is set.
3. Build throwaway in an isolated scratch dir, separate from production source. For a visual decision, vanilla HTML/CSS/JS or the lightest stack that renders the idea, CDN deps, a dev server with hot reload. For a behavioral or timing decision, the smallest script that exercises the question. No production framework, no tests, no abstractions.
4. When comparing alternatives, build them behind one switcher (buttons or a keypress), each variant labeled. This is the **exhaust-the-design-space** principle skill made cheap.
5. Verify on the matching surface. For a visual decision, screenshot each variant via the driver skill and drive the interaction. For a behavioral or timing decision, observe the thing you are deciding by logging the timing, printing the output, or watching the render. The observation is the test here, not an assertion.
6. Present alternatives, tradeoffs, and a recommendation. The output is the decision plus the throwaway artifact, not shippable code. Hand the chosen direction to **Feature** (or `architect` for the shape) for the real build.

## 本轮进度

- [x] Ground。既有实测证明 AI 工具在目标 Mac 执行，缺少原生 Ego client 和自定义 HTTP/SSE 通道。
- [x] Sketch。比较固定受信任 client 与隔离 document 两种结构，两个候选均建议 factory 局部网络绑定。
- [x] Agree。用户已授权验证，选择固定原 bundle + 精确 Host 路由，复用现有 carrier。
- [x] Implement。隔离目录运行，固定插件版本，不加载目标供应的任意代码；NAS 18081 已部署，18080 保留。
- [x] Verify。Edge 在 NAS 测试 Console 中看到 Mac loopback 页面，点击、输入、导航及断开清理。
- [x] Scrap。根据实测说明方案边界，区分验证代码与可发布产品。

已验证真实 NAS Relay + Mac Host 的 catalog、六种路径拒绝、命名 SSE、原生库存继续可读；局部 EventSource 接收三帧 1280×813 CDP 画面，link 结束后 EventSource CLOSED、watcher 归零。边界回归 15 项通过。

2026-11-13 Edge 界面验收完成。用户授权验证码后从 18080 正常登录，18081 复用同主机 Cookie。实时画面、点击、粘贴输入、导航、刷新、右栏暂停/恢复、主动断开、重连和活动标签关闭通过。原生终端返回验证标记与 Darwin，原有真实模型会话仍可读取。

发现 EGO-P01，原版 Ego 并发发送输入请求，出现松开先于按下返回。隔离适配器增加 link 私有的 64 项顺序输入队列后，测试页记录正确事件序列。去掉临时诊断、重新构建部署并重连后，页面再次显示点击计数 2 与完整唯一文本。最终 TypeScript、生产构建和 3 个文件共 9 项 Console 回归通过。

可行性验证结论为通过，不将原型直接发布。EGO-P02 至 EGO-P06 的正式接入边界已记录在 docs/ego-remote-proof-20261112.md，包含可选能力、控件反馈、输入退化、撤权与跨平台验收。最终活动测试标签已关闭，watcher=0、idle，NAS 服务和 Mac 测试网页保留。

Step 2 skip: 原生 Ego 面板是用户明确的参照，不重做 UI 视觉探索。
Step 4 skip: 比较的是安全与承载结构，通过设计和运行验证裁决，不制作视觉切换器。

## Throughput checkpoint

- Blocking first steps。先完成基线提交与 push，再处理新增验证。
- Independent workstreams。两个只读候选独立输出，浏览器验收仅一个操作者。
- Shared mutable state。新行为在隔离验证目录构建，Host 只更新隔离测试 profile，稳定 Console 保留。
- Smallest safe decomposition。优先复用 Ego 原生 UI 和已有加密 HTTP 流，不重写浏览器，不做任意插件平台。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
