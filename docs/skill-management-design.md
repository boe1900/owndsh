<!--
[INPUT]: 依赖 DSH 0.2.0-rc.2 的 ctx.skills/provider 语义、WorkBuddy Skill 格式、OwnDsh 登录会话与公开 GitHub/GitLab 源。
[OUTPUT]: 定义 OwnDsh Skill 目录、按需安装、全局缓存、运行时挂载、来源回源和无权限分配边界。
[POS]: OwnDsh Skill 管理的产品与技术真源；不替代 DSH provider、plugin manager 或工作区语义。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh Skill 管理设计

状态：implementation-in-progress  
基线：DSH 0.2.0-rc.2，OwnDsh Plugin/Console/Server 当前实现

## 1. 冻结结论

OwnDsh 只提供一个简单的全局 Skill 市场和本地运行时。管理员维护 Skill 来源、版本、发布和撤销；用户在 OwnDsh 设置的“技能”页自行安装、启用、编辑、打开目录和卸载。

**永久不做 Skill 权限分配。** 不建立用户、用户组、设备、租户、组织或工作区的 Skill assignment，也不建立设备 Skill inventory、自动分发、远程撤销同步或本地权限矩阵。已发布的 Skill 对登录设备可见，是否安装和启用由当前设备用户决定。

这条边界只针对 Skill。插件原有的安装授权、设备库存和权限模型继续保留；Skill 不注册独立 RBAC 权限码，目录管理接口只要求已有的登录管理会话。

## 2. 范围

### 2.1 要解决的问题

- 在 OwnDsh 设置页提供“可安装 / 已安装”两个视图。
- 兼容 WorkBuddy 的 SKILL.md frontmatter 和 _icon.png。
- 管理员从公开 GitHub 或 GitLab 仓库导入固定 commit，审阅后发布。
- 用户按需下载并安装到 OwnDsh 专用全局目录，离线继续使用已安装副本。
- 使用 DSH 官方 filesystem provider 的 customSkillDirs 和 invalidate()，保留 DSH 原生调用策略。
- 与 DSH 原生项目、用户、bundled 和插件 Skill 隔离，不扫描、不修改、不删除它们。

### 2.2 明确不做

- 项目级 Skill：当前不做，未来也不纳入 OwnDsh 产品模型。
- Skill assignment、设备清单、远程下发、远程禁用、撤销同步和回滚编排。
- 扫描机器上所有 Agent 的 Skill 目录。
- OSS、服务端 ZIP 持久化、GitLab Package Registry 依赖。
- 客户端 GitHub/GitLab 凭据、制品签名、公钥预置和客户端验签。
- OwnDsh 自己的命令解析器、provider rank 算法或 Skill 正文解释器。
- “去对话”按钮。设置页没有可靠的 DSH workspace 上下文，跳转会把 Skill 命令放进错误会话。

## 3. 概念边界

| 集合 | 来源 | OwnDsh 行为 |
| --- | --- | --- |
| Catalog | Server 已登记的 release | 管理员可登记、发布、撤销 |
| Installed | 当前设备 $DSH_HOME/enterprise/skills/ | 用户可安装、启用、编辑、卸载 |
| Effective | Installed 且本地启用的副本 | 由 OwnDsh provider 投影给 DSH |
| External | DSH 原生目录、项目目录、插件 provider、其他 Agent | 只读旁观，不扫描、不纳管 |

Skill 的运行时可用性由 DSH provider 和 SKILL.md 调用策略共同决定；OwnDsh 的本地开关只决定 OwnDsh 副本是否进入 Effective 集合。

插件是独立的软件生命周期。插件暴露的 Skill 由插件 provider 管理，不能被 OwnDsh 扫描后复制成第二份；只有管理员显式导入并发布，才会成为 OwnDsh Catalog 中的独立 Skill。

## 4. 来源与分发

### 4.1 公开仓库

第一版只接受公开 HTTPS GitHub/GitLab 仓库，支持仓库地址、固定 ref/commit 和可选子目录。导入时解析完整 commit，下载归档，校验 Skill 包，再保存来源坐标、归一化归档长度和 SHA-256。发布后的 release 永远绑定该 commit，运行时不重新解析 branch/tag。

GitHub 使用公开 commit API / codeload；GitLab 使用公开 commit API / repository/archive.zip。GitHub 与 GitLab 走同一个 SkillSourceClient 抽象，服务端按 release 的来源坐标回源。

### 4.2 请求时回源

OwnDsh 不保存 ZIP，也不依赖 OSS 或 Package Registry。设备请求 /enterprise/api/v1/skills/{releaseId}/artifact 时，Server 从固定 commit 回源，再执行一次归档、路径、frontmatter、大小和 SHA-256 校验后返回。回源失败只影响本次安装；设备保留旧的完整副本。

数据库只保存 release 元数据、来源坐标、固定 commit、制品长度和 SHA-256。服务端本地 filesystem / GitLab Package adapter 仅保留为已有代码的可替换接口，不作为当前默认路径或验收依赖。

### 4.3 信任边界

不做数字签名。客户端不预置密钥、不维护公钥轮换，也不执行签名验证。SHA-256 只用于发现下载损坏或内容与发布清单不一致；客户端信任已配置的 OwnDsh Server，链路安全由部署的 HTTP(S) 决定。

## 5. Skill 包格式

    skill-name/
    ├── SKILL.md              # 必须：WorkBuddy frontmatter + Markdown 正文
    ├── _icon.png             # 可选：根目录 PNG，最大 512 KiB，最长边 512 px
    ├── references/           # 可选：按需读取
    ├── scripts/              # 可选：按 DSH/Harness Bash 语义执行
    └── templates/            # 可选：按需读取

SKILL.md 字段名严格沿用 WorkBuddy：name、display_name、display_name_en、description、description_zh、description_en、category、version、author、allowed-tools、disable-model-invocation、user-invocable。OwnDsh 发布时要求 name、version、描述、作者和许可证等元数据完整；缺少 name 直接拒绝，不根据目录名猜测。

OwnDsh 保留未知 frontmatter 字段，但不解释它们；不往原文注入 owndsh-* 字段。allowed-tools 只展示和审计，不成为 OwnDsh 权限规则。disable-model-invocation 和 user-invocable 原样交给 DSH。

### DSH 调用策略

DSH 0.2.0-rc.2 原生支持 modelInvocable 与 userInvocable：

| disable-model-invocation | user-invocable | 结果 |
| --- | --- | --- |
| false | true | 模型目录/skill 工具可见，用户 /skill-name 可用 |
| false | false | 仅模型可用 |
| true | true | 仅用户 /skill-name 可用 |
| true | false | 只能由可信内部 ctx.skills.get() 使用 |

OwnDsh 不实现第二套命令解析或调用策略。Skill 正文、references 和 scripts 仍由 DSH 在触发后按需读取；启动时只加载元数据。

## 6. 本地安装与运行时

### 6.1 固定目录

OwnDsh 只挂载自己的全局目录：

    $DSH_HOME/enterprise/skills/

每个 Skill 以目录为边界，下载写入同级临时目录，完成归档、frontmatter、符号链接、大小和 SHA-256 校验后原子替换。失败保留旧副本，不产生半写目录。设备级启用清单只保存在 OwnDsh 本地 manifest，关闭时保留缓存但从 Effective 集合移除。

### 6.2 DSH provider 组合

OwnDsh 注册一个只读的 owndsh provider，配置官方 filesystem provider 的 customSkillDirs 指向上述目录并关闭 default roots。官方 DSH provider 仍独立挂载项目、用户和 bundled root；它们与 OwnDsh provider 共存，不会因 OwnDsh 的隔离配置而消失。

安装、升级、卸载或启用状态变化后调用公开 invalidate()，让下一次 ctx.skills.list/get 看到完整的新目录。OwnDsh 不修改 provider rank；同名 Skill 继续由 DSH 官方 scope/rank 规则裁决，页面只显示 OwnDsh 自己的集合。

### 6.3 离线行为

已安装 Skill 永久按本地完整副本运行；离线时不安装、不升级、不撤销。恢复连接后用户手动刷新或再次安装即可获取最新已发布版本。Server 不在线不会删除本地副本。

## 7. Server 与 API

OpenAPI 真源位于 contracts/components/skill.yaml 和 contracts/paths/skill.yaml。

### Runtime

- GET /enterprise/api/v1/skills：返回所有已发布 release 的脱敏目录和 bootstrap revision。
- GET /enterprise/api/v1/skills/{releaseId}/artifact：按 release 固定来源回源并返回 ZIP。

Runtime 响应不带 assignment、inventory、用户权限或设备权限字段。已发布即进入 Catalog，对当前登录设备可见；设备安装事实留在客户端。

### Admin

- GET /enterprise/admin/v1/skills：分页读取 release 目录。
- POST /enterprise/admin/v1/skills/imports：从公开 GitHub/GitLab 固定 revision 导入 DRAFT。
- POST /enterprise/admin/v1/skills/releases：登记已校验的 DRAFT 元数据。
- POST /enterprise/admin/v1/skills/releases/{id}/actions/publish：CAS 发布。
- POST /enterprise/admin/v1/skills/releases/{id}/actions/revoke：CAS 撤销。

Skill 管理接口不使用 `ent:skill:*` 权限，也不做用户、角色、设备或租户分配；已有登录管理会话即可维护目录，运行时仍由设备会话保护。

### 数据表

ent_skill_release 只保存 release 元数据、来源坐标、固定 commit、artifact provider/ref、大小、SHA-256、状态和 revision。没有 Skill assignment 表、设备 Skill inventory 表或项目绑定字段。

## 8. 设置页

OwnDsh 设置页 Tab 顺序：账号 → 插件 → 技能 → MCP。

技能 Tab 只有两个筛选：

- **可安装**：已发布 Catalog 中当前设备尚未安装的 release。
- **已安装**：本地 OwnDsh 目录中的完整副本。

卡片展示 _icon.png、display_name/name、描述、版本、分类、调用策略和启用状态。动作固定为：

- 可安装：安装。
- 已安装：启用/禁用、编辑 SKILL.md、打开文件夹、卸载。

页面不显示项目 Skill、系统 Skill、插件内部未独立发布的 Skill，也不提供“去对话”。编辑和打开目录由 Host 通过受控文件动作完成，React 不拼接路径、不直接访问文件系统。卡片高度采用紧凑两列布局，窄屏自动单列。

## 9. 安全与失败行为

- 拒绝路径穿越、绝对路径、重复文件、符号链接、加密 ZIP、坏 CRC、超限归档和坏 frontmatter。
- Server 回源或客户端校验失败时不替换旧副本。
- 撤销 release 后，新的安装和更新请求失败；已经安装的本地副本可以离线继续运行，用户可自行卸载。
- 不接收客户端源仓库 token；源仓库访问只发生在 Server。
- 不执行脚本沙箱或额外权限裁决；脚本遵循 DSH/Harness 现有工具权限和用户确认机制。
- frontmatter、描述、图标和脚本输出均按不可信输入处理，不直接拼进管理端 HTML 或系统 prompt。

## 10. 实施与验收

### 已实现纵向切片

1. OpenAPI Skill release/catalog/artifact 契约。
2. Server 公开 GitHub/GitLab 固定 commit 导入、DRAFT/PUBLISHED/REVOKED 状态机和请求时回源。
3. Client ZIP 校验、SHA-256、原子安装、启用/卸载、本地缓存和 Host 文件动作。
4. DSH provider 隔离、invalidate() 接缝和 WorkBuddy 元数据投影。
5. Console 管理目录和 OwnDsh 设置“技能”Tab。

### 必须通过的门禁

- customSkillDirs + includeDefaultRoots: false 只发现 OwnDsh 目录，官方 provider 仍与其共存。
- 安装、原子替换、删除和启用变化后，invalidate() 使下一次 list/get 返回新事实。
- 四种 disable-model-invocation / user-invocable 组合符合 DSH 原生语义。
- GitHub 公开源固定 commit 导入、runtime 回源、长度/SHA-256 校验、源不可达保留旧副本。
- OwnDsh 不扫描或修改其他 Skill 根目录，页面不出现项目/外部 Skill。
- Server Java 21 环境下编译、Skill 单测、迁移测试；Plugin/Console 构建和测试通过。

### 参考实现

dsh-skill-hub 和 dsh-skills-manager 证明了固定 commit、临时目录、归档校验、SHA-256 和原子安装是可复用的最佳实践。OwnDsh 复用这些本地安全原则，但把回源和发布事实放到 Server，客户端只访问 OwnDsh；这同时支持公开 GitHub 和公开 GitLab，也避免把系统上所有 Skill 纳入管理。

## 11. 设计自检

- **边界清楚**：Catalog、Installed、Effective、External 四个集合不混用。
- **最小实现**：没有新建 assignment、inventory、权限矩阵、Runner 或 OSS 层。
- **兼容优先**：WorkBuddy 字段直接保留，DSH 调用策略由官方 provider 解释。
- **可恢复**：旧副本在下载、校验、回源或服务故障时保留。
- **可演进**：未来若支持私有仓库，只增加 Server 端凭据和独立门禁，不改变客户端目录和运行时模型。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
