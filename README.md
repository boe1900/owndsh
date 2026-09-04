<!--
[INPUT]: 依赖公开 GHCR next 镜像、根 Docker Compose、npm next 插件、Harness 官方 profile 与 OwnDsh 当前产品边界。
[OUTPUT]: 提供开源项目定位、Compose 自托管、管理员初始化、员工插件安装、更新与排障入口。
[POS]: 项目公开用户入口；优先让管理员启动 OwnDsh，让员工连接既有 DeepSeek Harness。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

<div align="center">

<h1>OwnDsh</h1>
<h2>OwnDsh · Truly Own Your DeepSeek-Harness.</h2>
<p><em>The Self-Hosted Control Plane for DeepSeek-Harness.</em></p>
<p>真正拥有属于你的 DeepSeek-Harness。<br>DeepSeek-Harness 的私有化控制面。</p>

</div>

OwnDsh 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的自托管团队控制面。管理员统一管理身份、模型、API Key、访问权限、配额、插件、设备和审计；员工继续在自己的 DSH Desktop 或 Harness Web 中工作。

OwnDsh 不 fork 官方 Web/Desktop UI，不接管员工工作区，也不远程执行员工工具。员工侧只安装标准 Harness 插件 `owndsh-plugin`。

> 当前处于预发布阶段。Docker 镜像只发布 `next`，npm 插件只发布 `next`，不会更新 `latest`。

## 能力

| 使用者 | 能力 |
|---|---|
| 平台管理员 | 自托管控制台、LOCAL/LDAP/OIDC 身份、成员与设备治理 |
| 模型管理员 | 集中保管供应商 API Key，管理模型、模型集、授权、Token、RPM 与并发 |
| 插件管理员 | 上传、签名、发布和分配 Harness 插件，查看客户端状态 |
| 审计员 | 查询管理操作、模型调用、用量与 request ID 关联记录 |
| 员工 | 用企业账号登录 Harness，直接使用获准模型和插件，无需持有上游 API Key |

## Docker Compose 部署

当前镜像目标为 Linux `amd64`。准备 Docker Engine、Docker Compose `2.20.3+` 和 Git。

### 1. 启动

```sh
git clone https://github.com/boe1900/owndsh.git
cd owndsh
docker compose up -d --wait
```

默认访问 [http://localhost:8080](http://localhost:8080)，初始账号 `admin`，密码 `owndsh`。第一次登录会强制设置符合安全策略的正式密码。

需要让其他设备访问或覆盖默认凭据时，再创建 `.env`：

```sh
cp .env.example .env
```

至少把下面两个地址中的 `localhost` 改成员工设备能够访问的域名或 IP：

```dotenv
ENT_PUBLIC_BASE_URL=http://owndsh.example.com:8080
ENT_ADMIN_REDIRECT_URI=http://owndsh.example.com:8080/enterprise/auth/callback
```

生产环境应由现有 Nginx、Ingress 或负载均衡提供可信 HTTPS，并把这两个值一起改成外部 HTTPS 地址。OwnDsh Compose 只开放 Console 的 HTTP 端口，不直接管理证书。`.env.example` 中的数据库、Redis、JWT、master key 和签名私钥是开箱测试默认值；公网部署必须通过同名环境变量覆盖。

### 2. 可选：设置初始密码

Compose 默认使用下面的一次性管理员账号和密码；创建 `.env` 后可以自由修改：

```dotenv
ENT_BOOTSTRAP_ADMIN_USERNAME=admin
ENT_BOOTSTRAP_ADMIN_PASSWORD=owndsh
```

第一次登录会强制设置符合安全策略的正式密码。

### 3. 管理服务

```sh
docker compose up -d --wait
docker compose ps
```

打开 `ENT_PUBLIC_BASE_URL` 配置的地址，以配置的初始账号和密码登录。数据库 marker 保证初始化只执行一次；首次改密后，默认初始密码立即失效。

### 4. 配置企业

1. 在“成员”中配置 LOCAL、LDAP 或 OIDC 身份来源。
2. 在“模型”中添加供应商、API Key 和受管模型。
3. 创建模型集，并向全部成员、用户组或指定成员授权。
4. 按需配置 Token 配额、RPM 和并发限制。
5. 邀请员工安装插件并登录。

员工设备不会得到供应商 API Key；每次模型请求都由 OwnDsh 网关重新校验身份、授权和额度。

## 安装员工插件

先确保 `pnpm` 是 PATH 中可直接执行的命令。Harness 当前基线使用 pnpm `11.7.0`：

```sh
corepack enable
corepack install --global pnpm@11.7.0
pnpm --version
```

安装 npm 测试版到需要使用的 profile：

```sh
# Harness Web
dsh plugin --profile web add --ignore-scripts owndsh-plugin@next
dsh --profile web

# DSH Desktop
dsh plugin --profile desktop add --ignore-scripts owndsh-plugin@next
```

从 DeepSeek Harness 源码运行 CLI 时：

```sh
pnpm --dir /path/to/deepseek-harness dsh \
  plugin --profile web add --ignore-scripts owndsh-plugin@next
```

安装完成后重启对应 profile。OwnDsh 全屏页面会要求填写管理员提供的 OwnDsh Server HTTP(S) 地址；保存后完成企业登录即可使用管理员授权的模型。

Server 地址和 Refresh Token 由 Harness Host 的官方 settings/credentials 服务持久化。Access Token 只存在 Host 内存，浏览器页面不会读取或保存 Token；正常重启会静默恢复登录。主动退出、设备撤销、成员停用、改密或 30 天有效期结束后需要重新登录。

## 更新

更新服务端测试镜像：

```sh
docker compose pull
docker compose up -d --wait
```

更新员工插件：

```sh
dsh plugin --profile web remove owndsh-plugin
dsh plugin --profile web add --ignore-scripts owndsh-plugin@next
```

把 `web` 换成实际使用的 profile。移除后重新安装可以避免 pnpm 复用同版本缓存。

## 常见问题

### `pnpm not found on PATH`

执行上面的 `corepack enable` 和 `corepack install --global pnpm@11.7.0`，直到直接运行 `pnpm --version` 成功。只写 `corepack pnpm ...` 不够，因为 `dsh plugin` 的子进程仍需要从 PATH 找到 pnpm。

### 保存 Server 后显示平台不可用

从员工设备访问 `<Server地址>/healthz`，再检查 DNS、防火墙、反向代理和 TLS 证书。Server 地址必须是完整 HTTP(S) origin，不能附带 API 路径。

### 登录后看不到模型

确认供应商和模型都已启用，并且该员工、员工所在用户组或全部成员拥有对应模型访问授权。配额策略不会代替访问授权。

### 重启后要求重新登录

确认启动的是原 profile，且它的官方 credentials provider 可写。主动退出、Server 地址切换、设备/成员撤销和 30 天有效期结束都会使长期会话失效。

### GHCR 镜像无法拉取

仓库维护者首次发布后需要把 `owndsh-server` 和 `owndsh-console` 两个 GHCR package 设为 Public。部署机无需 GitHub Token。

## 运维与开发

- [离线发布包、备份、恢复、升级与回滚](deploy/README.md)
- [插件 workspace 与真实 Harness 验收](plugin/README.md)
- [V1 产品功能清单](docs/v1-product-feature-catalog.md)
- [技术架构与安全边界](docs/owndsh-governance-mvp-design.md)

本地开发体验可运行 `./scripts/local-demo.sh`。该脚本要求同级存在锁定的 `deepseek-harness` checkout，并使用隔离状态启动正式 Server 和 Harness。

## 上游与声明

OwnDsh 是独立项目，不隶属于 DeepSeek AI 或 Anywhere Labs。DeepSeek Harness 与 DSH Desktop 的名称、代码和商标归各自所有；OwnDsh 只通过公开插件扩展点集成。
