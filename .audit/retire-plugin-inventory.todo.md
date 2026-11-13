# 退役插件设备库存

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame — 删除插件设备状态、同源运行异常、上报与库存接口；市场、安装、模型、Remote 设备生命周期保持原职责。
- [x] Phase B: Design the workflow — 沿既有边界机械删除，无新类型或架构；复用上一轮 how 调查，skip: architect 候选方案不适用于已确定的整链路删除。
- [x] Phase C: Run the loop
- [x] Console：删除设备状态与运行异常入口及专属查询、类型、测试。
- [x] Plugin：删除库存上报、专属注入、平台客户端方法及契约 facade。
- [x] Server：删除库存 Controller/DTO/领域与持久化路径、更新现有测试。
- [x] Contracts：删除库存 paths/schema/fixture，统一重新生成双端契约。
- [x] Database：新增 V58 删除库存表，历史 Flyway 文件及旧审计读取保留。
- [x] GEB：更新受影响的 L3/L2/L1 和现行说明。
- [x] Phase D: Keep the audit trail — 本地 TSV 记录边界、验证及结果。
- [x] Phase E: Verify and hand back — 类型、模块、迁移/API 测试及真实页面核查；独立审阅完整 diff。
- [x] 独立审查闭环：代码无发现；修正当前设计、角色矩阵、表清单与演示上报承诺后，文档复核无发现。
