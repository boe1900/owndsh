<!--
[INPUT]: 依赖第一阶段控制面、OpenAPI、身份/模型/插件/会话/审计事实，GitHub/GitLab/Auth0/Keycloak/Datadog 身份与授权语义、OpenAI Project/spend/rate limit 官方语义，以及 Beautiful UI MIT registry 与 TanStack 稳定版本。
[OUTPUT]: 提供第二阶段产品控制台重建、后台能力裁剪、固定角色路由、成员身份、模型授权和使用限额收敛的冻结详细设计与验收顺序。
[POS]: 第一阶段 MVP 之后的产品化实施真源；约束新前端和身份语义，不宣称尚未实施的代码已经完成。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 第二阶段：产品控制台与成员身份收敛详细设计

状态：`implementation-ready-p2-08`

设计日期：2026-08-31（Asia/Shanghai）

适用基线：DSH Desktop `2.0.3`、DeepSeek Harness `0.1.1-rc.2`、第一阶段 Server/Flyway V17。

## 1. 结论

第二阶段不继续美化 RuoYi/plus-ui 管理端，而是在同一仓库建立独立的新产品控制台。旧 `admin-web/`
只作为业务行为、接口兼容和回滚参考；新控制台不得导入其 Umi、Ant Design、ProComponents、动态菜单、
布局状态或页面组件。

新控制台采用 React、Vite 和最新稳定 TanStack 技术栈。产品壳明确以
[Beautiful UI Harness](https://www.beautifului.dev/harness) 为结构与视觉基线：窄侧栏、紧凑顶部工作区、平面中央内容区、
低对比度表面和轻边框。登录、回调、首次改密、权限错误及全部业务页面共享同一套 tokens、排版和控件，不再出现
独立的 RuoYi 登录模板。Beautiful UI 源码引入后由产品维护，运行时不依赖其服务。

产品不再暴露通用企业后台。菜单、部门、岗位、字典、参数、认证客户端、OSS、公告、在线用户、缓存监控、
代码生成器和工作流等能力退出新控制台。左侧导航只服务于模型接入、访问策略、插件、成员和活动记录。

身份模型收敛为成熟开发者平台的共同语义：一个平台成员可以绑定多个 OIDC、LDAP 或本地身份；稳定身份键
来自身份源和外部 subject，用户名与邮箱不得自动合并账号；固定角色和访问策略负责授权，外部组不再映射
RuoYi 部门。

## 2. 背景与问题

### 2.1 第一阶段已证明的能力

第一阶段已经证明以下链路真实可用，第二阶段必须复用而不是重写：

- 管理端和 Harness 的 Authorization Code + PKCE 登录。
- OIDC、LDAP、LOCAL 三类身份适配器及稳定 subject。
- Provider、受管模型、授权、配额和三协议模型网关。
- 插件发布、分配、设备安装状态和回滚。
- Session 复制、恢复、正文权限、删除和 retention。
- 审计、requestId 关联、设备撤销和单机私有部署。
- OpenAPI 3.1 真源和 Java/TypeScript 生成链。

第二阶段不改变 Harness 模型协议所有权。`@deepseek-ai/dsh-llm-pi-ai` 继续拥有 provider、reasoning、SSE、
重试和模型协议语义；企业服务仍只负责认证、授权、配额、审计、受管模型覆盖和上游密钥注入。

### 2.2 当前控制台的产品问题

当前 `admin-web/` 是锁定 plus-ui/RuoYi React 快照，仍带有传统后台的结构性假设：

- Umi Max 与服务端菜单共同决定运行时路由。
- `ProLayout`、顶部工具栏、布局设置和 TagsView 占据全局外壳。
- 后端 `component` 字符串通过 `dynamicPage.tsx` 分发 React 页面。
- 菜单管理、部门、岗位、字典和系统参数成为产品概念。
- Ant Design/ProComponents 决定页面密度和视觉，而不是产品任务。
- 成员来源只藏在详情抽屉，列表不能识别 OIDC、LDAP、本地或多身份成员。
- 外部身份组映射 RuoYi 部门，认证和组织结构发生错误耦合。

继续换主题只能隐藏问题，不能消除运行时依赖和产品语义。

## 3. 目标与非目标

### 3.1 目标

1. 建立可独立构建的新产品控制台，旧前端不成为运行时依赖。
2. 使用 Beautiful UI 的视觉基础和选定源码组件，形成一致的产品设计系统。
3. 使用 TanStack Router、Query、Table 和 Form 分别拥有路由、服务端状态、表格和表单行为。
4. 使用固定产品角色决定页面可见性，使用稳定权限码保护动作和 Server API。
5. 把管理信息架构压缩到完成产品任务所需的最小集合。
6. 让成员、登录身份、固定角色和资源访问策略成为彼此独立的模型。
7. 保持现有数据库、用户、外部身份、模型、插件、会话、配额和审计数据连续。
8. 新控制台关键链路通过真实 Server E2E 后再切换，不以静态 mock 宣称完成。

### 3.2 非目标

- 不实现完整 IAM、HR、ERP 或组织架构产品。
- 不实现自定义角色设计器、菜单设计器或任意权限树。
- 不实现 SCIM；有真实客户需求后再设计。
- 不实现外部目录组织树同步。
- 不按用户名或邮箱自动合并身份。
- 不在第二阶段物理删除全部 RuoYi 表、接口或源码模块。
- 不重写已经稳定的模型网关、插件协议和 Session 协议。
- 不引入 TanStack Start、Next.js、SSR 或独立 Node 服务。
- 不同时运行 Umi Router 和 TanStack Router。
- 不迁移已隐藏的 Generator、Demo、Workflow、RuoYi AI 和 Job 页面。

## 4. 冻结技术决策

### 4.1 新项目边界

新项目目录固定为 `console-web/`：

```text
console-web/
  src/
    app/                    # Router、providers、启动与全局错误边界
    routes/                 # TanStack Router 文件路由
    features/               # models/access/plugins/members/activity/settings
    ui/
      beautiful/            # 选定 Beautiful UI 源码及产品适配
      primitives/           # 产品自有最小基础控件
    api/                    # OpenAPI 生成客户端和薄查询封装
    auth/                   # 会话、角色矩阵和路由 guard
    styles/                 # foundation、tokens、主题和全局样式
    test/                   # Vitest/Testing Library 公共装配
  e2e/                      # 真实 Server Playwright
  package.json
  vite.config.ts
```

禁止从 `admin-web/src` 导入代码。允许从 `contracts/` 重新生成 API 客户端；允许参考旧页面行为和测试场景，
但不得复制 Umi、AntD 或 ProComponents 组件层。

### 4.2 稳定版本基线

以下版本在 2026-08-31 通过 npm `latest` dist-tag 核实，不使用 alpha、beta、rc 或 `next`：

| 能力 | 包 | 基线版本 |
|---|---|---:|
| UI runtime | `react` / `react-dom` | `19.2.8` |
| 构建 | `vite` | `8.2.2` |
| React 编译插件 | `@vitejs/plugin-react` | `6.1.1` |
| 类型系统 | `typescript` | `6.0.3` |
| 路由 | `@tanstack/react-router` | `1.170.32` |
| 路由生成 | `@tanstack/router-plugin` | `1.168.35` |
| 服务端状态 | `@tanstack/react-query` | `5.102.8` |
| 表格 | `@tanstack/react-table` | `9.2.4` |
| 表单 | `@tanstack/react-form` | `1.33.5` |
| Schema | `zod` | `4.5.4` |
| CSS | `tailwindcss` / `@tailwindcss/vite` | `4.3.3` |
| 图标 | `lucide-react` | `1.37.0` |
| 单元测试 | `vitest` | `4.1.11` |
| E2E | `@playwright/test` | `1.62.1` |
| 包管理器 | `pnpm` | `11.24.0` |

运行时使用 Node 24 LTS；最低边界不得低于 Vite/TanStack 要求的 Node `20.19`。实施任务创建 lockfile 前再次
读取 npm `latest`，若版本变化，只升级同一稳定 major/minor 的兼容组合并在验收记录中固定最终版本。禁止用
`latest` 范围写入 `package.json`。

P2-01 实测 `@hey-api/openapi-ts 0.99.0` 在 TypeScript 7.0.2 下因编译器 API 不兼容而无法启动，控制台因此固定
仓库已验证的 TypeScript 6.0.3；只有 Hey API 正式兼容且生成、类型检查与构建同时通过后才升级 TypeScript 7。
生成客户端沿用协议包的 optional 语义，不启用 `exactOptionalPropertyTypes`；`skipLibCheck` 只隔离当前 TanStack
Router 1.171.27 发布包中 `__beforeLoadContext` 的无效声明，不跳过控制台或 Hey API 生成源码检查。

P2-01 于 2026-08-31 验收完成：`pnpm check` 的 OpenAPI 生成、typecheck、production build 和 Vitest 全部通过；
生成器直接读取分片 YAML 真源；`1280×800` 与 `390×844` 浏览器检查无横向滚动、文字溢出或控制台错误。

### 4.3 为什么不用 TanStack Start

控制台由 Java Server 提供 API，并以静态资源交付。它不需要 SSR、Server Functions 或第二个服务端运行时。
Vite SPA 可以保持单镜像、同源 TLS、现有 PKCE 回调和私有部署拓扑，复杂度更低。

### 4.4 状态所有权

| 状态 | 所有者 |
|---|---|
| URL、页面参数、分页和筛选 | TanStack Router search schema |
| Server 查询缓存与 mutation 失效 | TanStack Query |
| 表格排序、列和选择 | TanStack Table，必要状态进入 URL |
| 表单值、校验和提交 | TanStack Form + Zod |
| 登录 Token | 现有标签页会话边界，不持久化 refresh token |
| 主题、侧栏折叠等纯 UI 状态 | 组件本地状态或最小 localStorage |

新项目默认不引入 Zustand、Redux、MobX、Axios 或第二套表单/表格状态库。OpenAPI 客户端使用平台已有的
标准请求边界；只有生成器明确需要时才增加最小 fetch wrapper。

### 4.5 产品表格边界

模型、访问策略及后续资源列表统一使用 `@tanstack/react-table` 作为 headless 行为核心，负责排序、筛选、
分页、行选择和列显隐；TanStack Query 持有 Server cursor 页面，TanStack Router 持有需要分享或恢复的筛选状态。
表格的 surface、边框、密度、状态色和响应式滚动必须沿用 Beautiful UI `RecordsTable` 视觉，不引入第二套主题。

shadcn/ui 只作为可访问表格、checkbox、menu、popover 等控件的源码与组合范式参考；组件进入仓库后改用现有
Beautiful UI tokens 和 Lucide 图标，不运行 shadcn CLI，不安装整套 UI runtime，也不保留 shadcn 默认视觉。
首批统一支持全文搜索、状态筛选、多列排序、列显隐、行选择、本地分页、Server cursor 续页及移动端横向滚动。
列固定、批量 mutation 和行操作随真实业务动作接入；只有实测超过 500 个已加载行并出现性能问题时才引入
`@tanstack/react-virtual`，不预先增加虚拟化复杂度。

## 5. Beautiful UI 采用设计

### 5.1 来源和许可证

- 官网：<https://www.beautifului.dev/>
- Harness 参考：<https://www.beautifului.dev/harness>
- 源码：<https://github.com/slev12397/beautiful-ui>
- 设计核实时 HEAD：`3ea4c18114de3d4bc9b63b8e3ea6f533b1a562bd`
- 许可证：MIT，Copyright (c) 2026 Shane Levine。

实施以 GitHub 仓库的锁定 commit 为唯一源码基线，不按截图重写，也不拼装 registry 子集。上游
`components/atoms`、`components/primitives`、`components/site`、组件注册表和完整 Harness 迁移到
`console-web/src/components`、`src/lib` 与 `/examples`；产品页与示例必须复用同一份组件源码。构建时不访问
上游仓库或 registry。

允许且必须记录的迁移差异只有：Next.js 运行时改为 Vite/TanStack、收费 Central Icons 改为 Lucide、移除
PostHog 外发。DialKit 只在 `/examples/harness` 的开发态运行，不进入企业产品页。其余差异必须先更新
`upstream/beautiful-ui.lock.json` 与本文，再进入实现。

Harness 上游依赖的 `@central-icons-react/round-outlined-radius-2-stroke-2` 使用 Iconists 商业许可证，不属于
Beautiful UI 的 MIT 授权范围，禁止复制或安装。产品图标统一替换为 ISC 许可证的 `lucide-react`。

### 5.2 第一批采用组件

| Registry | 产品用途 | 决策 |
|---|---|---|
| `foundation` | 颜色、表面、边框、阴影、圆角、动画 | 采用并裁剪全局副作用 |
| Harness shell + `sidebar-nav` | 产品侧栏、工作区下拉、tab 和中央内容画布 | 完整实现保留在 `/examples/harness`；产品壳复用组件并只注入企业导航数据 |
| `glide-menu` | 侧栏/菜单交互基础 | 随依赖审阅后采用 |
| `search` | 页面和资源搜索 | 采用，接静态路由与 Query 数据 |
| `records-table` | 模型、成员、插件等数据表视觉 | 采用视觉，行为改由 TanStack Table 驱动 |
| `filter-table` | 状态分段筛选 | 选择性采用，不与 Records Table 重复 |
| `loading-state` | 较长查询和后台任务状态 | 采用 Drive/Dots，不引入演示视频 |
| `approval-card` | 发布、停用、撤销等显式确认 | 采用可访问交互，不能替代 Server 校验 |
| `task-rows` | 插件发布、设备同步等任务状态 | 有真实任务页面时采用 |

Chat、Prompt Bar、Thinking、Streaming Text、Tool Chips、Flowchart、Fine-tune Card、Insight Cards、Code Block
和 Selection Actions 保留在 `/examples` 与 `/examples/harness` 作为随时可运行的上游参考，但不进入第二阶段
企业产品路由或产品 bundle 的首屏执行路径。

### 5.3 视觉规则

已登录页面使用 Harness shell；`/login`、PKCE callback、首次改密、403/404 和全局错误页不显示侧栏，使用同一
foundation 上最大 400px 的单列内容区，并共享字体、控件、焦点、主题和动效规则，禁止渐变背景、宣传插画或独立模板。

1. 第一视口固定呈现 Harness 式产品侧栏和当前业务内容，不创建营销首页；骨架只复用布局语义，不复制聊天功能。
2. 桌面端左侧为 224px 至 240px 固定导航，顶部保留紧凑页面标题/操作区，中央内容占剩余宽度；不保留 RuoYi 工具栏或 TagsView。
3. 不使用面包屑、TagsView、布局设置、尺寸选择、语言工具条、文档/Git 链接或全屏工具条。
4. 不创建传统仪表盘卡片矩阵。默认入口直接进入“模型”。
5. 页面标题保持紧凑；表格、筛选和命令在同一内容平面组织，不把页面 section 做成浮动卡片。
6. 不嵌套卡片；卡片只用于重复对象、确认和真正需要边界的工具。
7. 颜色使用 Beautiful UI 的中性 surface/ink/line 和少量语义色，不形成单一紫色、蓝色或米色主题。
8. 圆角遵循原始 token：chip 6px、control 8px；普通产品卡片不超过 8px，除非组件语义要求窗口边界。
9. 字间距固定为 `0`。Beautiful UI foundation 原始 `-0.01em` 在产品导入时必须覆盖。
10. 图标只使用 Lucide；按语义选择最接近图标，禁止保留收费图标依赖、复制其 SVG 或为个别缺口再引入图标库。
11. 图标按钮带可访问名称和 tooltip；文字不能溢出按钮、导航、表格和详情面板。
12. 深浅主题复用 Beautiful UI tokens；只提供一个主题切换，不提供布局设计器。
13. 低于 768px 时侧栏变为覆盖式 drawer；固定格式表格定义最小列宽和水平滚动，不压缩到重叠。
14. 所有交互满足键盘访问、焦点可见、语义 label、`prefers-reduced-motion` 和 WCAG AA 对比度。

## 6. 信息架构和功能裁剪

### 6.1 左侧导航

新控制台固定为五个主入口和一个底部设置入口：

```text
模型
访问策略
插件
成员
活动记录

────────
设置
```

没有“系统管理”“系统设置”“运行状态”三个后台式根菜单，也没有可配置菜单树。

### 6.2 页面职责

| 页面 | 包含能力 | 不包含 |
|---|---|---|
| 模型 | Provider、受管模型、连接测试、模型能力和启停 | 模型协议 adapter、客户端重试设置 |
| 访问策略 | 模型授权、固定角色作用域、配额 | 任意权限树、菜单授权 |
| 插件 | 包、版本、发布、分配、设备安装结果 | 通用文件存储管理 |
| 成员 | 状态、固定角色、登录身份、设备和会话摘要 | 部门、岗位、社交账号中心 |
| 活动记录 | 用量、审计、Session 管理和关键运行异常 | 独立登录日志/操作日志/在线用户页面 |
| 设置 | OIDC/LDAP/LOCAL、系统基本信息、服务健康 | 菜单、字典、参数、客户端、OSS 配置 |

模型 Provider 与受管模型使用同一功能域；设备和会话进入成员详情或活动记录；身份源进入设置。不得为每张
后端表创建一个一级菜单。

### 6.3 明确退役的管理功能

新控制台不实现以下页面或入口：

- 菜单管理和路由 component 配置。
- 部门、组织树和岗位。
- 自定义角色 CRUD、权限树和数据范围编辑。
- 字典、系统参数、通知公告。
- OAuth/认证客户端通用管理。
- OSS 配置和通用文件管理。
- 在线用户、缓存、Server、登录日志和操作日志的 RuoYi 页面。
- Generator、Demo、Workflow、RuoYi AI、Job 和上游宣传入口。
- 用户导入导出、社交账号绑定、性别、手机号等与本产品无关的通用 HR 字段。

第二阶段只移除产品入口和新前端依赖。旧表和旧接口的物理删除必须等新控制台上线一个稳定版本、生产查询
确认无调用并有独立 migration 方案后再进行。

## 7. 静态路由和固定角色授权

### 7.1 路由真源

TanStack Router 文件路由是唯一前端路由真源。新控制台不得调用 `/getRouters`，不得读取数据库菜单生成
页面，不得接受后端 `component` 字符串，也不需要 `dynamicPage` 注册表。

导航由本地静态 route metadata 生成：

```ts
type ConsoleRouteMeta = {
  label: string
  icon: LucideIcon
  order: number
  allowedRoles: BuiltInRole[]
  requiredPermissions?: string[]
}
```

这是编译期代码，不提供运行时菜单编辑器。

### 7.2 固定角色页面矩阵

| 页面 | enterprise_admin | model_admin | plugin_admin | auditor | employee |
|---|---:|---:|---:|---:|---:|
| 模型 | 管理 | 管理 | 无 | 无 | 无控制台 |
| 访问策略 | 管理 | 管理模型策略 | 无 | 无 | 无控制台 |
| 插件 | 管理 | 无 | 管理 | 无 | 无控制台 |
| 成员 | 管理 | 无 | 无 | 无 | 无控制台 |
| 活动记录 | 全部 | 模型相关 | 插件相关 | 全部只读 | 无控制台 |
| 设置 | 管理 | 无 | 无 | 无 | 无控制台 |

页面可见性使用角色矩阵；按钮和 API 继续使用 `ent:*` 权限码。角色是产品概念，权限码是 Server 安全边界。
前端隐藏页面或按钮不代替 `@SaCheckPermission`。

多角色用户取页面和权限并集。固定角色不可改名、删除或编辑权限集合；成员页面只允许分配/取消固定角色。

### 7.3 会话启动接口

新控制台增加一个产品化 bootstrap operation，返回当前成员、固定角色、权限码和基本部署信息，不返回菜单树：

```json
{
  "member": {
    "id": "...",
    "displayName": "Candidate Admin",
    "avatarUrl": null
  },
  "roles": ["enterprise_admin"],
  "permissions": ["ent:model:read", "ent:model:write"],
  "deployment": {
    "name": "Enterprise Agent Platform"
  }
}
```

路由 `beforeLoad` 验证登录和角色。未登录进入 `/login`；无控制台角色进入 403；直接访问无权路由进入第一个
可访问产品页面。Server 对每个 operation 独立验证权限。

### 7.4 旧权限数据的迁移策略

第二阶段不为了删除 UI 而立即重写 Sa-Token/RuoYi 权限查询。`sys_menu/sys_role_menu` 可以暂时作为内部权限码
存储，但新控制台不读取其中的菜单层次，产品也不提供编辑入口。

当新控制台稳定后，可独立评估把固定角色权限集合迁入专用表或 Java 固定映射。只有新旧权限结果逐项相同、
真实授权 E2E 通过后才允许删除旧菜单依赖。

## 8. 成员与身份模型

### 8.1 成熟产品共同路线

这不是一组可有可无的竞品参考，而是第二阶段身份设计的约束基线。身份源会迁移，用户名、邮箱、组织名称和
外部组会变化，但设备、Session、用量、审计和资源授权必须始终归属于稳定的平台成员。若把外部账号直接当成
成员，或让最后一次登录的身份覆盖成员资料和部门，系统会在接入第二个身份源时立即产生账号冲突和授权漂移。

以下结论于 2026-08-31 根据官方公开文档核实。五个产品的内部表结构不同，本设计只采用其可观察语义和安全
不变量，不照搬某个产品的历史兼容行为。

#### 8.1.1 五个产品分别证明了什么

**GitHub：个人账号、组织成员关系和企业身份是三件事。**

[GitHub SSO](https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-single-sign-on/about-authentication-with-single-sign-on)
允许既有个人账号加入启用 SSO 的组织，并保留该账号原有身份和贡献。用户通过 IdP 返回后，GitHub 在组织或
Enterprise 范围记录 linked external identity，用它校验成员资格，并可据此决定组织和 Team 访问。一个外部身份
在同一组织内只能链接一个 GitHub 账号；已被其他账号占用时拒绝登录。更换链接身份会明确警告可能失去组织
和 Team 访问。

对本项目的约束：`Member` 是设备、Session、审计和授权的稳定所有者；外部身份只是认证绑定。身份换绑必须
显式发生并检查唯一性，不能因为某次 SSO 返回了相同邮箱就迁移成员数据。

**GitLab：平台用户、SAML identity、Group membership 和 provisioning 相互独立。**

[GitLab Group SAML SSO](https://docs.gitlab.com/user/group/saml_sso/) 使用持久且唯一的 SAML `NameID` 识别外部
用户，并明确不建议使用易变的邮箱或用户名。既有 GitLab 用户可以在已登录状态下发起 SSO，将 SAML identity
链接到账号；链接本身不会改变既有 Group role。SCIM 另行负责向 Group 添加或移除用户，Group Sync 再根据
外部组声明维护 Group 访问。

GitLab 对受控 enterprise user 提供相同邮箱自动关联等窄场景兼容，但这依赖其企业账号所有权前提，不是通用
安全规则，本项目不复制。对本项目的约束：认证、成员资格和自动 provisioning 是三个生命周期；第二阶段只做
手工/JIT，不因尚未实现 SCIM 而把登录回调变成目录同步器。

**Auth0：一个平台用户可包含多个 identity，但身份默认彼此独立。**

[Auth0 Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking) 的用户档案包含
`identities[]`；关联时明确指定 primary 和 secondary identity，主档案的 `user_id` 和主要属性继续作为权威，
secondary identity 进入主档案的身份集合。官方同时说明身份默认分离、关联不会自动合并档案，并要求对参与
关联的账号进行认证，避免攻击者仅凭相同邮箱接管账号。

对本项目的约束：采用“一个 Member 对多个 Member Identity”的结构和二次认证原则，但不复制 Auth0 的两个
用户档案合并操作。已有两个 `Member` 都可能拥有设备、Session、用量和审计，第二阶段不提供不可逆的数据合并。

**Keycloak：本地用户是落点，Identity Brokering 和 User Federation 是不同接入机制。**

[Keycloak Identity Brokering](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker) 在外部 IdP 首次登录
时把身份链接到 Realm 的本地用户；默认 First Broker Login 可创建唯一用户，也可通过确认和重新认证链接既有
用户。官方明确警告：在允许用户自由注册用户名或邮箱的通用环境中，自动按这些字段链接账号是危险的。
Keycloak 还把 OIDC/SAML Identity Brokering 与 LDAP/AD User Federation 分开管理，说明协议接入方式不应改变
产品侧用户和授权模型。

对本项目的约束：OIDC、LDAP 和 LOCAL 可以有不同 adapter，但最终都解析为稳定 `Member Identity`；链接既有
成员必须经过一次性事务和真实认证。不得把“能检测到同邮箱账号”实现成“可以自动链接”。

**Datadog：外部属性映射的是产品角色和 Team，不是产品导航或通用部门。**

[Datadog SAML Group Mapping](https://docs.datadoghq.com/account_management/saml/mapping/) 将 IdP assertion 的
属性键值映射到 Datadog Role 或 Team。命中属性时增加对应关系，属性移除时撤销由映射产生的关系；修改映射
不会修改 IdP 属性、Role 或 Team 本身。Datadog 还明确区分 Role 的登录授权作用和 Team 的资源归属/协作作用，
SCIM 则是另一条 provisioning 生命周期。

Datadog 的严格 Role Mapping 会在 assertion 不匹配时移除原角色，官方要求启用前检查 assertion，防止用户被
锁在系统外。本项目只采用“外部组映射产品授权对象”的方向，不复制这种全量覆盖语义。若后续实现映射，必须
区分手工分配和映射分配，只撤销对应身份源产生的授权。

#### 8.1.2 共同不变量

五类产品可以收敛为同一条职责链：

```text
认证：Identity Provider + Stable Subject
  ↓  唯一绑定，不等于成员本身
成员：Product Member
  ↓  产品内稳定主体
授权：Built-in Role + Resource Access Policy
  ↓  可选自动化
生命周期：Manual / JIT；SCIM 在出现真实客户需求后独立增加
```

不可破坏的不变量如下：

1. **成员稳定。** IdP、邮箱、用户名或外部组变化，不改变设备、Session、用量和审计所属的 `Member ID`。
2. **身份可多绑。** 一个成员可以有多个登录身份，但同一身份源下的稳定 subject 只能绑定一个成员。
3. **认证不等于授权。** 身份认证成功后仍需检查成员状态、固定角色和资源访问策略。
4. **关联必须证明控制权。** 相同邮箱或用户名只能用于提示冲突，不能作为账号关联凭证。
5. **资料有明确所有者。** Identity 保存外部观测值；Member 展示资料不被最后一次登录来源任意覆盖。
6. **登录与 provisioning 分离。** JIT、邀请、SCIM 和停用是成员生命周期，不应隐藏在 OIDC/LDAP adapter 内。
7. **外部组只映射产品概念。** 合法目标是固定角色、访问策略或未来的协作 Team，不是部门、菜单或前端路由。
8. **变化必须可审计。** 身份绑定、解绑、成员停用和授权来源变化都要记录操作者、来源和稳定对象 ID。

#### 8.1.3 第二阶段采用矩阵

| 成熟产品语义 | 本项目决策 | 第二阶段边界 |
|---|---|---|
| 平台成员与外部身份分离 | 采用 | `sys_user` 表达 Member，`ent_external_identity` 表达绑定 |
| 一个成员绑定多个登录身份 | 采用 | OIDC、LDAP、LOCAL 均显示在成员详情 |
| source + stable subject 唯一定位身份 | 采用 | 不使用用户名、邮箱或显示名作为身份键 |
| 通过真实认证显式关联既有成员 | 采用 | 一次性 link transaction + 目标身份认证 + 审计 |
| 未知身份首次登录 JIT 创建成员 | 采用 | 每个身份源只能选 `JIT` 或 `LINK_ONLY` |
| 外部组映射产品角色/访问范围 | 延后 | 第二阶段继续手工分配固定角色，不提前设计通用映射器 |
| SCIM 创建、停用和组同步 | 延后 | 有客户提出登录前回收或批量同步需求时独立设计 |
| 相同邮箱/用户名自动关联 | 拒绝 | 即使邮箱已验证也不能证明两个账号应归为同一成员 |
| 外部目录同步 RuoYi 部门/岗位 | 拒绝 | 产品不拥有 HR 组织树，登录不得写 `sys_dept`/`sys_post` |
| 客户编辑菜单、路由和权限树 | 拒绝 | 静态产品路由 + 固定角色 + Server 权限码 |
| 合并两个已有平台成员及历史数据 | 拒绝 | 第二阶段只绑定新身份，不迁移设备、Session、用量或审计 |

#### 8.1.4 生命周期和冲突规则

| 事件 | 唯一允许结果 |
|---|---|
| 已绑定身份登录 | 解析原 Member，再检查成员状态和授权；不得按 claims 重建成员 |
| 未知身份以 `JIT` 登录 | 创建无特权 Member 和 Identity；角色由管理员另行分配 |
| 未知身份以 `LINK_ONLY` 登录 | 拒绝普通登录，只接受有效 link transaction |
| 绑定第二登录方式 | 有权限的管理员发起一次性事务，目标身份完成新鲜认证后建立绑定；未来自助流程改由目标 Member 会话发起 |
| subject 已绑定其他 Member | 返回稳定冲突，不自动换绑、复制或合并数据 |
| 邮箱、用户名或显示名变化 | 更新允许同步的观测字段，不改变身份键和 Member ID |
| Identity Provider 停用 | 只阻止该来源认证；成员仍可使用其他有效身份 |
| Member 停用 | 所有身份停止登录，并按现有撤销机制使成员凭证失效 |
| Identity 解绑 | 只删除该认证入口；历史审计和业务数据仍属于原 Member |
| 外部组变化 | 第二阶段不生效；未来只改变该映射来源拥有的角色/策略关系 |

实现和 E2E 必须证明：同名用户跨身份源不会自动合并；同一 stable subject 不能绑定两个成员；外部组永远不会
写入部门；修改邮箱不会创建新成员；成员停用会拒绝其全部身份；身份关联必须有新鲜认证和审计记录。任一条件
不成立，都说明实现退化成了“企业后台用户同步”，不能进入第二阶段发布。

### 8.2 目标实体

```text
Identity Provider
OIDC / LDAP / LOCAL
        |
        v
Member Identity
provider_id + issuer + external_subject
        |
        | 多对一
        v
Member
        |
        +--> Built-in Roles
        +--> Model / Plugin / Quota Access Policies
```

对应当前存储：

| 当前对象 | 第二阶段语义 | 决策 |
|---|---|---|
| `sys_user` | Member | 保留数据，产品 DTO 去除 HR 字段 |
| `ent_identity_source` | Identity Provider | 保留 |
| `ent_external_identity` | Member Identity | 保留并作为身份绑定真源 |
| `sys_user_role` | Member Built-in Roles | 保留固定角色分配 |
| `ent_model_grant` / quota | Access Policy | 保留 |
| `ent_external_group_mapping.dept_id` | 旧部门映射 | 停止登录写入，标记 legacy |
| `sys_dept` / `sys_post` | RuoYi 组织数据 | 新产品不使用 |

### 8.3 稳定身份键

- OIDC 使用身份源、校验后的 issuer 和 ID Token `sub`。
- LDAP 使用身份源和配置的稳定属性；OpenLDAP 使用 `entryUUID`，Active Directory 使用 `objectGUID`。
- LOCAL 使用平台成员 ID 作为稳定 subject。
- `preferred_username`、LDAP `uid`、邮箱、昵称和显示名都不是唯一身份键。

相同用户名来自不同身份源时默认是两个身份，不能自动合并。用户名冲突只影响显示别名，不影响身份解析。

### 8.4 一个成员绑定多个身份

成员详情展示全部登录身份：

```text
成员：张三
  Microsoft Entra  OIDC   subject-123   最后登录 2026-08-31
  Corporate AD     LDAP   objectGUID    最后登录 2026-08-30
  本地应急账号      LOCAL  member-id     最后登录 2026-08-20
```

当前 `ent_external_identity` 已允许不同 source 绑定同一 `user_id`。现有 `linkToExistingUser` 服务可以复用，
但第二阶段必须通过正式 API 和认证事务暴露，不能由管理员手填 subject。

安全的显式绑定流程：

1. 管理员在成员详情选择“添加登录方式”和目标身份源。
2. Server 创建绑定当前成员和 source 的一次性 link transaction，TTL 不超过 10 分钟。
3. 目标成员通过对应 OIDC 或 LDAP 完成真实认证。
4. callback 使用认证得到的稳定 subject 调用现有显式绑定服务。
5. subject 已绑定其他成员时拒绝，返回稳定冲突码；不自动迁移设备、Session 或授权。
6. 绑定成功写审计并立即出现在成员详情。

解除身份必须满足成员仍有至少一种可用登录方式；唯一 LOCAL `enterprise_admin` 身份不得解除。第二阶段不提供
自动合并两个已产生数据的成员账号，避免隐式迁移设备、会话、审计归属和用量。

### 8.5 首次登录和资料同步

身份源只提供两种 provisioning mode：

- `JIT`：未知稳定 subject 首次登录创建独立成员。
- `LINK_ONLY`：只允许通过有效 link transaction 绑定既有成员。

不增加复杂审批工作流。JIT 创建时复制显示名和邮箱；后续登录只更新 identity 的最后登录和必要观测，不因
最后使用的 OIDC/LDAP 身份覆盖平台成员资料。成员状态是最终权威：成员停用后，所有身份都不能登录。

身份源停用只阻止该来源的新认证，不自动停用已经通过其他身份登录的成员。

### 8.6 外部用户组和部门

当前登录会把外部组解析到 `sys_dept` 并可能更新成员部门。第二阶段必须停止这一副作用：

- 登录不创建、修改或覆盖部门。
- 多个身份源不会形成“最后登录来源覆盖部门”的行为。
- 旧 `ent_external_group_mapping` 数据保留但不参与新登录授权。
- 新控制台不提供外部组到部门页面。

为最大化简化，第二阶段角色由管理员在成员页面显式分配，不实现外部组自动映射。真实客户需要自动化时，
后续阶段可以增加“外部组 → 固定角色/访问策略”，仍不得映射部门。

### 8.7 成员页面

成员列表最小字段：

- 成员显示名和平台账号。
- 状态。
- 固定角色。
- 登录方式摘要，例如“Entra ID”“LDAP”“本地”“Entra ID + 1”。
- 最后活动时间。

列表使用聚合成员 API，一次返回身份源摘要；禁止对每行调用现有单用户 identity-summary，避免 N+1 请求。

成员详情包含：基本资料、固定角色、登录身份、设备、Session 摘要和关键审计事件。External Subject 默认截断，
允许显式复制；不返回 groups、原始 claims、Token、密码或 provider secret。

“账号来源”和“登录方式”不是同一概念。第二阶段列表只承诺显示登录方式；如果未来需要审计成员由邀请、JIT、
导入或 SCIM 创建，再增加结构化 `provisioningSource`，不从 remark 或首个 identity 猜测。

## 9. 授权、使用限额与速率控制

### 9.1 参考与职责边界

这部分采用成熟开发者平台的共同分层，而不复制任一产品的完整计费系统：

- [OpenAI Projects and Access](https://developers.openai.com/api/docs/guides/terraform/projects-and-access/) 将成员/Group、Role、Project 和资源权限分开。
- [OpenAI Spend Limits](https://developers.openai.com/api/docs/guides/spend-limits/) 允许 Organization 与 Project 月度硬上限同时生效，达到后以 `429` 拒绝。
- [OpenAI Rate Limits](https://developers.openai.com/api/docs/guides/rate-limits/) 将 RPM/TPM 等吞吐限制与月度使用上限分开，并按 Organization、Project 或模型族计数。
- [Datadog Granular Access](https://docs.datadoghq.com/account_management/rbac/granular_access/) 用 Role 表达职责、Team 表达功能群组，仅在必要时直接授权用户。

本产品没有由请求选择和计费的 Project，因此不引入空壳 Project。第二阶段使用四个互不替代的控制面：

| 控制面 | 回答的问题 | 第二阶段真源 |
|---|---|---|
| 管理 RBAC | 谁能修改平台配置 | 固定角色 + `ent:*` Server 权限码 |
| 模型授权 | 当前成员能否调用某模型 | Model `USE` allow grant |
| 使用限额 | 一段时间内最多消耗多少 | Organization/Member Token hard limit |
| 速率控制 | 瞬时允许多快、多少并发 | Organization/Member RPM + concurrency |

### 9.2 第二阶段冻结模型

- 模型授权主体只开放 `ALL_MEMBERS` 和 `MEMBER`；授权为 additive allow，不实现 deny、条件表达式或优先级语言。
- `ACCESS_GROUP` 留到出现批量授权需求后增加；它是产品本地群组，不是部门，外部组未来只能映射到它。
- 默认模型是 Organization 设置，不再属于授权记录；成员无权使用默认模型时回退其第一个有效模型。
- 使用限额只开放 `ORGANIZATION` 和 `MEMBER`。所有匹配硬上限独立生效，任一达到即以稳定 `429` 拒绝。
- 月度 Token 是主要使用限额，日限额作为高级可选项；未启用或字段为 `null` 表示无限制，不使用极大数字模拟。
- RPM 和 concurrency 在产品上单独显示为“速率限制”，不与 Token 使用量混称为预算。
- 不配置可靠的 provider/model 单价前只称“Token 使用限额”，不伪装成费用预算；费用预算留待可信价格真源。
- 新部署默认不启用 Token 硬上限。管理员主动启用前仍展示用量，避免百万 Token 种子值误伤编码 Agent。

```text
Member --Built-in Role--> 管理操作
Member --Model Grant----> 可用模型
Request -> Organization Limit -> Member Limit -> Rate Control -> Gateway
```

### 9.3 复用和发布门禁

1. 保留现有 PostgreSQL 预留/结算、Redis RPM/并发 lease、幂等 ledger 和恢复状态机，不建立第二套配额内核。
2. 第二阶段 Flyway 直接删除旧 `DEPT` grant/quota；不生成迁移报告、转换 API、确认 UI 或兼容窗口。
3. OpenAPI、DTO、Schema、Resolver 和数据库约束均删除 `DEPT` 授权/配额分支，不保留 legacy enum 或隐藏 fallback。
4. grant `is_default` 退出协议和写模型，不从历史值推断新默认；Organization 默认模型由管理员在新设置中明确选择。
5. 新部署默认不写 Token 硬上限；既有非部门授权和限额仅在能无歧义映射到新 scope 时保留。
6. 产品 UI 分开呈现“模型访问”“使用限额”“速率限制”，Server 仍在每次请求统一裁决。
7. 发布 E2E 必须覆盖无限制、Organization 上限、Member 上限、RPM、并发、无 usage 断流和 `maxTokens` 缺省；不得把预留量显示成实际用量。

OpenAI 官方语义证明了多层硬上限和独立速率限制的合理性，但其 rate limit 主要是 Organization/Project 级；本项目
的 Member 限额是企业公平使用策略，不宣称与 OpenAI 完全相同。只有请求真正引入项目归属和独立账本后，才允许
增加 Project scope。

## 10. 产品 API 和协议调整

### 10.1 原则

- `contracts/enterprise-openapi.yaml` 继续是跨端协议真源。
- 新控制台只消费 product DTO，不直接依赖 RuoYi `SysUser`、menu 或 dept DTO。
- Snowflake ID 在 JSON 中继续使用字符串。
- mutation 继续使用 revision/`If-Match`，冲突只刷新事实，不自动重放。
- secret 只可写入或替换，永不回显。

### 10.2 必要 operation

| Operation | 用途 | 备注 |
|---|---|---|
| `getConsoleBootstrap` | 当前成员、角色、权限和部署名 | 不返回菜单 |
| `listMembers` | 成员分页、角色和登录方式摘要 | 替代 RuoYi 用户列表 |
| `getMember` | 成员、身份、设备、Session 摘要 | 产品详情 DTO |
| `updateMemberStatus` | 启停成员 | 停用撤销会话/设备 |
| `replaceMemberRoles` | 替换固定角色集合 | 不接受权限树 |
| `startIdentityLink` | 创建一次性身份绑定事务 | 绑定 member/source |
| `completeIdentityLink` | 认证回调完成绑定 | 不接收手填 subject |
| `unlinkMemberIdentity` | 解除非最后身份 | revision + 审计 |
| `getAccessSettings` / `updateAccessSettings` | Organization 默认模型 | revision + 权限校验 |

Provider、模型、授权、配额、插件、用量、审计、设备和 Session operation 优先复用现有企业 API。只有现有 DTO
暴露 RuoYi 概念或造成 N+1 时才新增产品投影，不创建第二套业务状态机。

## 11. 前端数据与错误行为

### 11.1 Query keys

每个 feature 只维护稳定层级：

```text
['bootstrap']
['models', filters]
['model', id]
['members', filters]
['member', id]
['plugins', filters]
['activity', filters]
```

mutation 成功后只失效所属实体和列表；不全局清空缓存。revision conflict 显示 Server 最新事实和重试入口，
不自动重复写请求。

### 11.2 错误呈现

- 401：清理当前管理会话并回到登录。
- 403：显示无权页面，不伪装成资源不存在。
- 409 revision：显示冲突并刷新当前实体。
- 429：显示配额或速率事实，不进行前端盲目重试。
- 5xx/网络错误：保留页面上下文，提供明确重试按钮。
- 任何 secret、Token、LDAP 密码和原始身份 claims 不进入 toast、日志或 Query cache diagnostics。

## 12. 迁移和切换

### 12.1 并行开发，不并行拼装

`console-web/` 与 `admin-web/` 在源码层并存，但不互相导入。开发期间新控制台使用独立端口连接同一真实 Server。
生产切换前网关仍服务旧管理端；新控制台完成关键 E2E 后，一次性把管理静态资源切到新构建。

禁止在同一页面嵌入旧管理端 iframe，也禁止用新侧栏包裹旧 AntD 页面。这两种方案都会保留旧路由、主题和权限
语义，不能形成干净产品。

### 12.2 数据连续性

- 不换 PostgreSQL、Redis 或 artifact 数据卷。
- 不重建用户、外部身份、模型、非部门授权与限额、插件、设备、Session、用量 ledger 和审计数据。
- 切换 migration 删除旧 `DEPT` grant/quota，并收紧协议、Schema 和数据库约束；第二阶段不兼容这两类旧配置。
- 旧 grant `is_default` 不迁移为 Organization 默认模型；切换后由管理员明确设置。
- 停止部门同步后保留已有 `dept_id`，不批量清空；新产品不显示或使用该字段。
- 旧菜单和部门映射不进入新产品运行时；物理表清理不与本次访问模型切换绑定。

### 12.3 回滚

新控制台首次发布保留旧 `admin-web` 构建产物一个版本，仅用于故障对照，不作为 `DEPT` 兼容运行面。应用回滚
只能回到兼容新授权 Schema 的版本，不回滚数据库卷，也不恢复已删除的部门授权/配额。旧访问配置不属于第二阶段
回滚承诺；阻断问题优先以前向修复处理。

## 13. 测试与质量门禁

### 13.1 前端快速门禁

- TypeScript `noEmit`。
- ESLint/Oxlint 中选择一套，不并存两套重复规则。
- Vitest 覆盖角色路由矩阵、search schema、表单校验、身份摘要和 revision conflict。
- Beautiful UI 导入组件至少覆盖键盘操作、disabled、loading、empty 和 reduced-motion。
- 生产 build 不包含 AntD、ProComponents、Umi、Central Icons、旧页面或运行时 registry 请求。

### 13.2 真实 E2E

Playwright 必须通过真实 PostgreSQL、Redis、Java Server 和 HTTPS 同源入口验证：

1. LOCAL 管理员 PKCE 登录并进入“模型”。
2. 五种固定角色分别只能看到角色矩阵允许的页面。
3. 直接访问无权静态路由返回 403，直接调用无权 API 仍被 Server 拒绝。
4. 创建 Provider、模型、ALL_MEMBERS/MEMBER 授权及 Organization/Member 限额后，Harness bootstrap 和模型调用实际生效。
5. 发布插件并观察设备安装状态。
6. 成员列表一次请求显示 LOCAL/OIDC/LDAP/多身份摘要。
7. 同名或同邮箱的 OIDC/LDAP 身份不自动合并；邮箱和显示名变化不创建新成员。
8. 同一 stable subject 不能绑定两个成员；有效 link transaction 经目标身份真实认证后绑定第二身份。
9. OIDC/LDAP 外部组不写部门，也不在第二阶段自动授予角色。
10. 停用身份源只阻止该来源；停用成员后全部身份、设备和模型调用失效。
11. 审计员只能读取活动记录，不能执行任何 mutation。
12. 桌面宽度与移动宽度截图无重叠、截断或空白主内容。
13. 新控制台网络请求不出现 `/getRouters`、旧菜单 API 或 Beautiful UI registry。

### 13.3 发布阻断

以下任一情况阻止切换：

- 任意角色可见或可调用未授权资源。
- 登录身份按用户名/邮箱错误合并。
- 外部登录覆盖内部部门或成员授权。
- 新控制台需要旧 Umi/AntD 页面才能完成关键业务。
- Secret、Token、密码或原始 claims 出现在浏览器存储、页面、日志或 trace。
- 模型、插件、Session 或审计关键链路缺少真实 Server E2E。
- 新页面在 1280px 桌面或 390px 移动视口发生遮挡或文字溢出。

## 14. 实施任务

任务状态沿用 `pending`、`in_progress`、`completed`，同一时间最多一个主线任务为 `in_progress`。

| ID | 状态 | 依赖 | 内容 | 退出条件 |
|---|---|---|---|---|
| P2-00 范围冻结 | `completed` | 无 | 固定本文、现有 operation 复用表、退役页面和角色矩阵 | 文档评审通过；不写 UI |
| P2-01 新项目骨架 | `completed` | P2-00 | 创建 `console-web`、稳定版本 lock、Vite/TanStack/OpenAPI 生成 | typecheck/test/build；无旧前端依赖 |
| P2-02 设计系统与外壳 | `completed` | P2-01 | 从锁定 Beautiful UI commit 完整迁移组件与 Harness 到 Vite/TanStack，产品复用同源 SidebarNav，并以 Lucide 替换收费图标 | `/examples`、完整 Harness、产品壳桌面/移动/键盘/主题验收通过；无收费图标和遥测依赖 |
| P2-03 登录与静态路由 | `completed` | P2-01,P2-02 | bootstrap、PKCE、固定角色 route guards 和左侧导航 | 五角色矩阵和 direct URL E2E 通过；无 `/getRouters` |
| P2-04 模型与访问策略 | `completed` | P2-03 | Provider、模型、ALL_MEMBERS/MEMBER 授权、组织/成员限额与速率页，删除 DEPT 授权/配额语义 | 自动化与真实 Server UI 通过；协议、Schema、运行时均无 DEPT 授权分支，Harness 生效留到 P2-08 集成验收 |
| P2-05 插件 | `completed` | P2-03 | 插件版本、发布、分配和设备状态 | 自动化与真实 Server UI 通过；Desktop 安装/回滚留到 P2-08 集成验收 |
| P2-06 成员与身份 | `completed` | P2-03 | product member DTO、身份摘要、固定角色、link transaction、停用 | Server/协议门禁通过；真实 Harness/Desktop E2E 留在 P2-08 |
| P2-07 活动与设置 | `completed` | P2-03 | 用量、审计、Session、身份源和健康状态 | auditor 只读、身份源 secret 隔离通过 |
| P2-08 切换 | `in_progress` | P2-04..P2-07 | 集中执行真实 Harness/Desktop E2E、网关静态资源切换、升级/回滚演练和旧页面调用观测 | 第 13.2 节全链路人工验收通过；不换数据卷 |
| P2-09 旧前端退役 | `pending` | P2-08 稳定一个版本 | 删除旧构建链和确认无调用的页面/依赖 | 独立 PR、删除清单和回滚窗口关闭 |

P2-02 验收证据（2026-08-31）：锁定 Beautiful UI commit `3ea4c18114de3d4bc9b63b8e3ea6f533b1a562bd`，Vite `8.2.2`、TanStack Router `1.170.32`、Router Plugin `1.168.35` 与 Query `5.102.8` 均为当日 npm 最新稳定版；`pnpm check` 通过。`/examples` 运行 20 个同源组件 demo 并可查看真实源码，`/examples/harness` 的工作区菜单、建议场景和 60 行 Records Table 真实交互通过。1280×720 下产品侧栏可在 224/52px 间折叠且无横向溢出；390×844 下主画布为 390×844、桌面侧栏隐藏，224×824 抽屉可导航并自动关闭。正式 `62209` 冷启动后三个入口均无浏览器错误；依赖图不存在 Central Icons 或 PostHog。

P2-03 验收证据（2026-08-31）：`console-web` 的 OpenAPI 生成、typecheck、production build 和 `7/7` Vitest 通过；Harness contracts typecheck 与 `9/9` 测试通过；Docker Maven 25 模块构建成功，`ConsoleBootstrapControllerTest` 通过。真实 HTTPS 同源入口完成 LOCAL PKCE authorize、密码认证、Token 交换和 `/enterprise/admin/v1/bootstrap`，菜单导航与直接访问 `/plugins` 均正常；1280×720 与 390×844 无横向溢出，移动抽屉导航后关闭；工作区菜单最后一项为 `Sign out`，Server logout 后根路由回到 `/login`。Gateway 日志无 `/getRouters` 请求，浏览器无应用错误。验收使用临时同源 Gateway 构建，结束后恢复旧 `admin-web`，正式静态资源切换仍只属于 P2-08。

P2-04 增量验收证据（2026-09-01）：固定 `@tanstack/react-table 9.2.4`、`@tanstack/react-form 1.33.5` 与 `zod 4.5.4`，共享产品表格已覆盖搜索、状态筛选、排序、列显隐、行选择、本地分页和 Server cursor 续页；模型页通过生成的 OpenAPI operation 管理真实 Provider/受管模型，支持 DeepSeek 官方、自定义提供商三协议、连接测试、模型发现、启停、模型删除以及 Harness 原生 `reasoningEfforts`/`compat` 声明，并按十进制 `256K=256000`、`1M=1000000` 转换容量。访问策略页使用三个真实 Server 数据视图呈现并管理 `ALL_MEMBERS/MEMBER` 模型访问、`ORGANIZATION/MEMBER` Token 限额和速率限制；写入复用生成 operation、浏览器 UUID 幂等键和 Server CAS revision，不在浏览器计算有效规则。V18 显式删除历史部门授权/配额并迁移旧成员/组织作用域，真实 migration `3/3`、模型解析/集成 `4/4`、T08/T09 API 与配额集成 `11/11` 通过；Harness contracts typecheck 与 `9/9` 测试、platform-client typecheck 与 `22/22` 测试通过。新控制台 OpenAPI 生成、typecheck、production build、`14/14` Vitest 通过，其中写入门禁验证 ALL_MEMBERS 的 null 主体、模型 `256K` 容量和 UUID 幂等键；切换期旧管理端同步刷新生成协议并通过 Oxlint 与 TypeScript 编译。临时同源 Gateway 已在 `62207` 完成真实登录、主题切换和模型表格桌面布局验收，但本增量仍不宣称 Harness 限额 E2E 完成；不得为 `62209` 开发端口放宽 PKCE HTTPS 或 redirect allowlist，完整链路需要在真实 Harness 请求中验收无限/硬限额、速率与推理档位。

P2-05 验收证据（2026-09-01）：插件页通过生成 operation 和 TanStack Query/Table 交付版本、ALL/USER 分配与设备状态三个视图，支持 tgz 上传、锁定 Desktop rc.2 Harness commit、发布、退休和 package revision 原子分配；成员分配只能从产品成员目录选择，使用浏览器 UUID v4 幂等键和 Server `If-Match`，不允许手填成员 ID，也不向新界面扩散历史 DEPT 选项。V19 增加独立 `ent:member:read` 并授予企业、模型和插件管理员；成员聚合用三条有界批量 SQL 返回固定角色、LOCAL/OIDC/LDAP 登录方式和最后活动，未知 built-in 角色不会越过 OpenAPI enum。真实 PostgreSQL/Flyway migration 与成员目录 `4/4` 通过；新控制台 OpenAPI 生成、production build、typecheck 和 Vitest 通过，写入门禁覆盖成员 cursor、插件 assignment UUID/CAS 与访问策略成员选择。`62207` 已完成功能表格、空态、上传默认 commit 和无横向溢出的真实登录 UI 验收；Desktop 安装/回滚及集中真实链路 E2E 按决策留在 P2-08，不在本任务复制启动器或伪造结果。

P2-06 验收证据（2026-09-01）：产品成员 cursor/detail API 已成为成员页、插件分配和访问策略的共同成员真源，并聚合固定角色、脱敏登录方式、设备与 Session 摘要，不读取部门、岗位、外部 groups/claims。成员写入使用 revision CAS；角色替换和停用均保护最后有效 `enterprise_admin`，停用会同步撤销 ACTIVE 设备和全部平台 Session。外部身份解绑使用数据库行锁、revision CAS、最后可用登录方式保护和 `USER_UNLINKED` 审计；身份绑定复用现有 `LoginTransaction`，只接受 OIDC/LDAP 新鲜认证，不允许管理员手填 subject。普通登录不再消费外部组到部门映射或覆盖成员资料，停用成员不能借外部身份恢复登录。身份源增加 `JIT/LINK_ONLY`：未知 subject 只在 JIT 创建无特权成员，LINK_ONLY 仅允许显式绑定，LOCAL 固定 LINK_ONLY。真实 PostgreSQL/Redis、migration V1-V22、OpenAPI/成员治理/RBAC/审计门禁共 `38/38` 通过；Console production build、TypeScript 与 Vitest `20/20`、Harness contracts build/test `9/9` 和旧管理端 lint 通过。按统一决策，本任务不复制 Desktop 启动器；真实 Harness/Desktop E2E 集中到 P2-08。

P2-07 验收证据（2026-09-01）：活动记录按 bootstrap `ent:*` 权限动态提供用量、审计、Session 和插件关键运行异常分段；模型管理员只读用量、插件管理员只读插件异常、auditor 可读用量/审计/Session 正文但没有 Session 删除动作，Server 现有权限仍是最终裁决。Session 正文进入 React 前严格验证规范 Base64、fatal UTF-8、JSONL、连续 seq 和事件 envelope，删除继续调用服务端 tombstone operation。设置页管理 OIDC/LDAP/LOCAL、JIT/LINK_ONLY、连接测试与 CAS 启停；创建强制一次性 secret，更新留空时请求体不含 secret，列表只显示 `secretConfigured`，不恢复外部组到部门映射。系统区复用 deploy 已有同源 `/healthz`，失败局部展示并可重试，不新增健康状态机。Console OpenAPI 生成、production build、TypeScript 与 Vitest `24/24` 通过；真实 Server、Harness 与 Desktop 集中链路仍按计划留在 P2-08，不在本任务伪造。

P2-08 首轮验收证据（2026-09-01）：同一持久 PostgreSQL/Redis 数据卷上的 Web Harness 与 DSH Desktop 均完成平台登录、设备 enrollment、bootstrap、插件 inventory 和 Session 同步。Web Harness 使用 `gpt-5.6-sol / Xhigh` 经真实 `/enterprise/gateway/v1/responses` 返回预期结果与 `Think` 内容块，Server 对主调用结算 `10,332` Token，恢复无限额后的继续调用结算 `10,404` Token，usage ledger、上游 request ID 与 `MODEL_REQUEST_ACCEPTED/FINISHED` 审计闭合。组织每日 Token 临时设为 `1` 后请求在上游前以 `ENT_QUOTA_DAILY_EXCEEDED` 拒绝，恢复 `null` 后同一会话重新成功。该场景同时发现平台客户端的脱敏错误文案使官方 pi-ai 把终态 429 误判为 `RATE_LIMIT` 并重试 5 次；Host 私有代理现仅为 Server 声明不可重试的 429 增加 provider error `type: quota_exceeded`，不配置或执行重试。隔离 T11 真实组合门禁证明 Xhigh 三协议不变、瞬时 503 仍由官方 Harness 恢复、终态 quota 主请求仅 1 次且 `llm/retry` 为 0。P2-08 仍需完成新 bundle 部署后的真实复验、五角色新登录矩阵、Member/RPM/并发、插件安装回滚、身份源、静态资源切换及升级/回滚演练。

P2-08 新 bundle 复验证据（2026-09-02）：同一 bundle tgz 通过官方 `dsh plugin --profile web add` 安装到隔离 Web 与 Desktop 当前使用的持久 profile，进程重启后安装产物均包含终态 quota 分类。Web Harness 重新登录并继续使用 `gpt-5.6-sol / Xhigh`；组织每日 Token 设为 `1` 后，真实请求约 3.6 秒返回 `ENT_QUOTA_DAILY_EXCEEDED`、provider `type: quota_exceeded` 和 Harness `QUOTA`，页面未出现重试状态，Gateway 在该轮仅收到 1 个模型 POST。数据库只新增 1 条 `QUOTA_REJECTED/DAILY` 审计，无 reservation、ledger 或上游调用。恢复 `daily/monthly=null` 后，新会话返回指定文本；主调用结算 `10,338` Token，会话标题调用结算 `4,525` Token，两者均各自形成 `MODEL_REQUEST_ACCEPTED/FINISHED`、upstream request ID 和 ledger 闭环。新登录管理会话的成员目录正常返回，先前 403 确认为旧 Token 权限快照而非 RBAC 缺陷。P2-08 余项收敛为五角色矩阵、Member/RPM/并发、插件安装回滚、身份源、静态资源切换及升级/回滚演练。

P2-08 配额与速率复验证据（2026-09-02）：Member DAILY 拒绝请求 `req_01M1FR9BKKPK252APJT5JDN9X2` 形成唯一 `QUOTA_REJECTED / DAILY` 终态，reservation 与 ledger 均为 `0`；RPM 拒绝请求 `req_01M1FRD8EHJ303AW4598E73GW9` 后，允许请求 `req_01M1FRD8EF67D5R0DFWH302CQX` 成功结算 `10,330 Token`；并发拒绝请求 `req_01M1FRKC1VZJ88QNHRAMCQ5FQ7` 与允许请求 `req_01M1FRKC1S3398PHEY2GAAZN7A` 分别落入拒绝和成功路径，成功调用结算 `10,336 Token`，结束后 Redis concurrency lease `ZCARD=0`。组织策略已恢复 `daily_token_limit=null`、`monthly_token_limit=null`、`rpm=20`、`concurrency=2`，验证没有用极大数字模拟无限额，也没有遗留并发租约。

P2-08 五角色复验证据（2026-09-02）：真实 Server API 矩阵中，`enterprise_admin` 可访问全部代表 API；`model_admin` 仅模型、授权、限额、成员目录和用量返回 `200`；`plugin_admin` 仅插件和成员目录返回 `200`；`auditor` 仅用量、审计和 Session 返回 `200`；`employee` 的全部管理 API 返回 `403` 而 bootstrap 保持 `200`。真实 UI 同步验证企业管理员六个产品页面、模型管理员三个页面、插件管理员两个页面、审计员仅活动记录、员工明确 `/403`，无权直接路由均回到该角色首个合法页面。测试首次暴露 auditor 因用量页借用 `ent:model:read` 而可读取模型 API；V23 新增独立 `ent:usage:read`，同时收回 auditor 的 device/model/grant 历史读取权限，并由 RBAC/API 契约 `7/7`、活动分段测试 `1/1`、V1→V23 连续 migration 和真实五角色 API/UI 矩阵共同回归。四个临时角色账号、身份、登录态、审计和登录日志已在验收后精确清理。

P2-08 受管插件复验证据（2026-09-02）：控制面以 Desktop `2.0.3` 派生 Harness commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 验包，新控制台 multipart 保留 tgz `File` 并以 `application/json` part 发送 compatibility。真实 `62207` Server 与源码 `62208` Web Harness 完成 `2.0.0` 发布分配、CLI 安装、`RESTART_REQUIRED`、重启后 `ACTIVE`，再切换 `1.0.0` 完成同样的回滚确认，最后以显式 `ABSENT / ALL` 分配执行卸载；重启登录后本地记录、profile dependency 和 `node_modules` 条目均消失。各阶段 bootstrap revision 从 `41` 递增到 `44`，无插件错误码。首次失败的根因是源码 Web Harness 没有可供子进程调用的 `dsh` 可执行文件；本地人工验收入口现仅生成临时 CLI shim 指回同一锁定 Harness 工作区，未修改生产 bundle、Desktop command port 或插件状态机。自动门禁中 Console Vitest `25/25`、production build、部署测试 `10/10`、后端签名测试 `2/2` 及 shell 语法均通过。P2-08 余项为身份源、静态资源切换及升级/回滚演练。

## 15. 完成定义

第二阶段只有同时满足以下条件才算完成：

- 默认管理入口服务 `console-web`，第一视口是 Beautiful UI 风格的产品工作台。
- 新前端依赖中不存在 Umi、AntD、ProComponents 和旧动态菜单。
- 所有导航来自静态 TanStack route metadata，固定角色矩阵决定页面可见性。
- 菜单管理、部门、岗位、字典、参数等通用后台能力不出现在产品中。
- 成员列表显示登录方式，成员详情可显示多个稳定外部身份。
- 同名多身份不自动合并，显式绑定经过真实身份认证。
- 登录不再修改部门，成员授权只由固定角色和资源访问策略决定。
- 模型授权只使用 ALL_MEMBERS/MEMBER，默认模型与授权分离，协议、Schema 和运行时均不存在 DEPT grant/quota 分支。
- Token 限额默认无限，Organization/Member 硬上限与 RPM/并发在真实网关请求中分别生效。
- 模型、插件、成员、活动和设置关键链路通过真实 Server E2E。
- 升级与回滚不清库、不换数据卷、不丢失第一阶段业务事实。

## 16. 后续阶段候选

只有真实客户需求和验收数据支持时，才评估：

- SCIM 2.0 成员创建、更新和停用。
- 外部组映射固定角色或访问策略。
- 产品 Access Group、可信费用预算和模型族 TPM 限制。
- 企业目录中的团队投影，但不恢复通用部门后台。
- 用户自助身份绑定和受控账号合并。
- SIEM 导出、合规保留和更细粒度审计策略。

这些能力不进入第二阶段退出条件。
