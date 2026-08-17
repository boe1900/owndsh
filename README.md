# Enterprise Agent Platform

Enterprise Agent Platform 是基于 DeepSeek Harness 构建的企业 Agent 管理平台。员工在本机运行 Harness，中心平台负责企业身份、受管模型、配额、插件分发、会话副本和审计，不远程执行员工工具，也不挂载员工工作区。

本仓库只保存企业产品自行开发的后台、管理端、Harness 企业插件、部署配置和文档，不复制或 fork DeepSeek Harness 源码。DeepSeek Harness 是独立上游依赖，仓库地址和精确 commit 记录在 [`upstream/deepseek-harness.lock.json`](upstream/deepseek-harness.lock.json)。

## 当前阶段

T00 基线已经完成：仓库包含锁定的 RuoYi-Vue-Plus 后端源码、plus-ui React 管理端源码和独立 Harness 企业插件 workspace；同级 DeepSeek Harness 仍是锁定提交上的只读开发依赖。T01 技术刺探尚未开始，后续编码必须继续以可执行详细设计为基线，先验证“员工使用企业账号登录后，无需持有模型 API Key 即可调用管理员分配的模型”。

## 文档

- [企业 Agent 工作平台预研](docs/enterprise-agent-work-platform.md)：产品形态、可行性、边界和长期方向。
- [企业 Agent 治理平台 MVP 可执行详细设计](docs/enterprise-agent-governance-mvp-design.md)：冻结的技术决策、模块、接口、数据表、状态机、测试、T00-T23 实施顺序和验收标准。

实现者先阅读 MVP 详细设计的第 1 至 21 节，再严格按照第 22 节任务依赖推进。发现设计矛盾时先修订设计并记录决定，不在代码中引入未经确认的替代方案。

## 计划目录

```text
enterprise-agent-platform/
  backend/                     # RuoYi-Vue-Plus 后台与 ruoyi-enterprise 模块
  admin-web/                   # plus-ui 6.X-React 管理端
  harness-plugin/              # 独立构建的 Harness 企业插件与 bundle
  contracts/                   # OpenAPI 协议真源
  deploy/                      # Compose、Nginx、安装和运维脚本
  docs/                        # 产品预研、详细设计和交付文档
  upstream/                    # 第三方仓库地址、版本和许可证记录，不存第三方源码
```

Harness 企业插件位于本仓库的 `harness-plugin/`，构建为预编译 `.tgz` bundle，通过 `dsh plugin --profile enterprise add <bundle.tgz>` 安装和验证。插件只能依赖 Harness 已公开的插件扩展点；发现缺少扩展点时优先向官方提交通用修改，不把修改后的第三方源码复制进本仓库。

## 上游关系

DeepSeek Harness 官方仓库：<https://github.com/deepseek-ai/deepseek-harness>

开发工作区把官方 Harness clone 为本仓库的同级目录，不放入本仓库：

```text
agent-platform-workspace/
  deepseek-harness/             # 官方仓库的锁定 commit
  enterprise-agent-platform/    # 本仓库
```

首次准备环境时运行对应平台脚本。脚本读取版本锁，在本仓库同级目录 clone Harness，并检出精确 commit；已有 checkout 只在来源正确且工作区干净时切换版本。Windows 使用 PowerShell 7：

```powershell
pwsh -File scripts/bootstrap-harness.ps1
```

macOS/Linux 使用 POSIX shell：

```sh
./scripts/bootstrap-harness.sh
```

首次导入产品上游基线时运行：

```sh
node scripts/upstream-baseline.mjs verify-locks
node scripts/upstream-baseline.mjs import
```

`import` 只允许目标目录不存在时执行，绝不覆盖已进入产品开发的 `backend/` 或 `admin-web/`。日常校验使用 `node scripts/upstream-baseline.mjs verify`；T00 的实际环境、命令和退出证据记录在 [`docs/t00-baseline-acceptance.md`](docs/t00-baseline-acceptance.md)。

本项目不自动跟随官方 `master`。升级时先修改版本锁中的 commit，在干净的 Harness checkout 中检出新 commit，再运行企业登录、模型网关、插件安装、Session 同步和 UI 组合测试；全部通过后，版本锁变更与必要的企业插件适配在同一个 PR 提交。

日常开发不得修改同级 `deepseek-harness/`。确需验证官方尚未提供的扩展点时只能使用临时分支，最终结果必须形成官方可合并的通用 PR；产品任务等待包含该扩展点的新锁定 commit，不在本仓库长期维护 Harness patch。

## 安全

仓库不得提交 `.env`、模型 API Key、OIDC client secret、LDAP manager 密码、平台 Token、master key、插件签名私钥、生产证书或真实 Session 数据。开发和测试只使用显式假数据及可撤销凭据。
