# enterprise/

> L2 | 父级: ../../../CLAUDE.md

成员清单

auth/: enterprise-admin PKCE 回调页；局部地图见 auth/CLAUDE.md。
devices/: 企业设备 cursor 列表、版本事实与单设备撤销页面。
grants/: 模型授权、配额策略、当前窗口与 prompt-free 用量管理页面。
identity-sources/: 身份源、连接测试、CAS 启停与外部组映射管理页面。
model-catalog/: Provider 与受管模型管理、secret 替换、测试、排序和 CAS 状态页面；物理目录避开 Umi 的 model/models 自动发现约定，服务端组件标识仍为 enterprise/models/index。
plugins/: tgz 上传、版本状态、全量分配/回滚和设备 inventory 管理页面；局部地图见 plugins/CLAUDE.md。
sessions/: Session metadata cursor、独立正文权限时间线与 ACTIVE tombstone 删除页面；局部地图见 sessions/CLAUDE.md。
shared/: 企业页面共享的 cursor 状态机与 revision 冲突恢复策略。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
