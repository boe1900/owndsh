-- [INPUT]: 依赖 V2/V8/V34 演进的 ent_device_plugin 观测快照。
-- [OUTPUT]: 删除已退役的设备插件库存表及其索引、约束。
-- [POS]: 插件库存的前向退役迁移；插件目录、范围、宿主安装事实和历史审计独立保留。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

drop table ent_device_plugin;
