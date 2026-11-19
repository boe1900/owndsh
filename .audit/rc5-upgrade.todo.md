# DSH rc.5 插件与桌面发行升级

- [x] Read the Principles section of poteto-mode.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [ ] Phase C: Run the loop.
- [x] 核对官方 rc.3→rc.5 精确源码、发行说明、npm 导出及桌面补丁接缝。
- [x] 保存现有插件回归基线，确认当前 npm 与桌面已发布版本。
- [x] 机械升级精确依赖及 Console 固定 assembly，按真实错误修改接缝。
- [x] 通过插件类型/单元/真实 Host 安装与认证、模型、远程业务验收和 Console 构建。
- [x] 独立审阅变更及发布制品，更新兼容契约和 GEB 地图。
- [ ] 发布经过验证的插件包，核对 registry 版本与完整性。
- [ ] 桌面升级官方精确 commit 并预置新插件，验证补丁、构建及安装包。
- [ ] 提交推送并完成桌面三平台 GitHub 构建与 Release、更新 feed 核对。
- [ ] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.

完成条件：rc.5 实际 Host 使用新插件通过既有核心能力验收，npm 发布的包完整性与验收制品相同；桌面官方 rc.5 和新插件均精确锁定，三平台构建成功，正式 Release 的资产和更新 feed 版本一致。

工作划分：上游契约和桌面接缝各由独立只读审查负责；主代理唯一写入两个仓库，构建共享 packages 时串行。
优先验证安装门禁、远控版本协商与固定源码 hash，不以 peer 范围或类型检查替代实际运行。
用户已授权兼容性验证成功后的插件发布与桌面升级发行；不需要再次请求相同授权。
桌面测试使用隔离 profile，沿用现有数据/品牌/更新源，不替换日常安装或清理 NAS。
