# Console 远程设备入口调整

- [x] how over the affected subsystem. 已核对 Console 导航、本人设备 API、独立 document 与 pagehide 生命周期。
- [x] architect for parallel design exploration. 两个结构候选与交叉评审完成，选择单插槽业务设备区。
- [x] Blocking first steps. 确认新标签原生链接与独立工作区身份/退出边界。
- [x] Independent workstreams. 只读设计并行；代码由一个隔离 worktree owner 修改。
- [x] Shared mutable state. 主工作树保留原有未提交修改；仅回收 owner 相对快照的变更。
- [x] Smallest safe decomposition. 导航与原生身份接缝耦合，由一个 owner 完成，父代理负责真实浏览器验证。
- [x] Delegate code-writing to a subagent. 数据模型沿用本人设备与统一可用性判断；导航的路由动作与新标签链接明确区分。
- [x] Verify on the matching surface. 员工和管理员全部菜单、桌面/390px/折叠侧栏、真实新标签、原生新会话、三条夹具消息、数分钟持续连接、busy/离开/关闭释放通过。IAB 未验证 Edge 后台挂起，完整边界见 evidence。
- [x] Rebase into small, ordered commits. skip: 用户明确要求先不提交，保留所有未提交产物。
- [x] If the design is contested, interrogate before shipping. skip: 设计未争议，独立审阅无阻塞。
- [x] Run Opening a PR. skip: 用户要求不提交，不创建 PR。
- [x] Ground / Sketch / Agree / Implement / Scrap. 先读图，比较两个结构方案后完成实施和真实验收。
- [x] Frame / Fan out / Cross-judge / Pick / Graft / Verify. 只读交叉评审支持 B 单插槽，合并键盘可读禁用原因与窄屏身份条要求；代码验证另列。 设计产物隔离于 /tmp/owndsh-remote-entry-design，按类型清晰、原生链接、共享组件影响、远端身份和生命周期评分。
- [x] 独立审阅、GEB 回环、保留测试环境并报告。20项差异与后续构建清理各经独立只读审阅，均无阻塞；130测试、tsc、生产build、资源哈希和diff空白检查通过。

throughput checkpoint: 两个只读设计并行；一个隔离 worktree 单写者；父代理验收；无提交或部署。
