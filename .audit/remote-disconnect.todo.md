# Remote 断开与接管

用户目标：本人设备工作区可主动断开，占用页可结束旧连接后重连。不提交、不 push、不部署 NAS。

## Feature playbook

### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. `how` over the affected subsystem.
2. `architect` for parallel design exploration.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Delegate code-writing to a subagent using your configured feature model (default in poteto-mode's Models section) with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain**, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). Pick each subagent's reasoning level for the job, per the Subagents section. When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation. No "standing by" reply that waits on a nested agent. **Give every file-writing delegate its own worktree** (spawn it with `isolation: "worktree"`, or hand it an exclusive branch), and do not write files or run a suite in a worktree a delegate still holds. On Claude Code, `isolation: "worktree"` branches from the remote default branch unless the `worktree.baseRef` setting is `"head"`. When the delegate builds on commits the default branch lacks, commit them, create its worktree with `git worktree add <path> -b <delegate-branch> HEAD`, and name that base commit in the brief. Fencing a file in the brief's prose is not a lock (**principle-separate-before-serializing-shared-state**). Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
6. Rebase into small, ordered commits. Stack follow-ups.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
7. If the design is contested, `interrogate` before shipping.
8. Run **Opening a PR**.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.

Feature 6/8 skip: 用户要求不提交、不 push、不创建 PR。

## 本次进度

- [x] Ground：Cookie owner 授权、Gateway/Redis 和浏览器生命周期。
- [x] Sketch / Frame / Fan out / Cross-judge / Pick / Graft：独立设计和接口选择。
- [x] Agree：已授权，默认继续。
- [x] Implement：隔离 worktree 单写者，43 文件精确增量整合至主树。
- [x] Verify：后端边界和并发、前端、真实双标签及陈旧确认，真实模型七轮、审批、文件、预览和终端。
- [x] Scrap：n/a，架构通过真实链路验证。
- [x] 独立审阅、GEB 回环，API 确认验收控制连接已释放。
- [x] 窄屏 CSS 修复后完整 Console check 通过，19 个测试文件共 136 项，TypeScript 与生产构建通过。

## Throughput checkpoint

- Blocking first steps：先确定 owner 授权和原子断开边界。
- Independent workstreams：只读设计并行，代码一个 owner 串行实现。
- Shared mutable state：Gateway links 是单控制连接不变量，沿用同步边界；agent 输出隔离。
- Smallest safe decomposition：一个 owner 负责 API 与页面，根 agent 验收，避免跨层契约漂移。
