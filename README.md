<!--
[INPUT]: 依赖 OwnDsh 当前产品边界、Linux amd64 交付包、Harness 插件安装模型、官方凭据平面与已验证上游基线。
[OUTPUT]: 提供开源项目定位、服务端部署、员工端接入、登录保持、升级卸载和故障排查入口。
[POS]: 项目公开用户入口，优先帮助管理员完成自托管、帮助员工连接 OwnDsh，并将开发细节下沉到专项文档。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

<div align="center">

<h1>OwnDsh</h1>
<h2>OwnDsh · Truly Own Your DeepSeek-Harness.</h2>
<p><em>The Self-Hosted Control Plane for DeepSeek-Harness.</em></p>
<p>真正拥有属于你的 DeepSeek-Harness。<br>DeepSeek-Harness 的私有化控制面。</p>

</div>

OwnDsh 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) 提供可自托管的团队控制面。企业统一管理身份、模型、权限、配额、插件、设备与审计；员工仍在自己的电脑上使用官方 Harness，工作区、工具和本地会话不会交给 OwnDsh 远程执行。

OwnDsh 不 fork、不替换官方 Web 或 Desktop UI。员工端只有一个标准 Harness 插件：安装后填写 OwnDsh Server 地址并完成企业登录，之后继续使用熟悉的官方界面。

## 你会得到什么

| 使用者 | 能力 |
|---|---|
| 企业管理员 | 自托管管理控制台、LOCAL/LDAP/OIDC 身份、成员与设备治理 |
| 模型管理员 | 集中保管供应商密钥，管理模型、模型集、访问授权、Token 配额、RPM 与并发 |
| 插件管理员 | 上传、签名、发布和分配 Harness 插件，查看客户端安装状态 |
| 审计员 | 查询管理操作、模型调用、用量与 request ID 关联记录 |
| 员工 | 用企业账号登录 DSH Desktop/Harness，直接使用获准模型和插件，无需持有上游 API Key |

核心原则：控制归平台，执行留在本地。OwnDsh Server 不挂载员工工作区，也不远程运行员工工具。

## 快速开始

完整接入分为两部分：管理员部署 OwnDsh Server，员工安装 `owndsh-plugin`。

### 1. 准备环境

服务端当前交付目标为单机 Linux `amd64`，需要：

- Docker Engine 与 Docker Compose v2
- Node.js、pnpm、OpenSSL、curl、tar、gzip、`sha256sum`
- 一个员工设备可以访问的域名或 IP
- 生产环境推荐由现有反向代理、Ingress 或负载均衡提供可信 HTTPS

客户端需要兼容版本的 DSH Desktop 或 DeepSeek Harness。当前已验证基线为 DSH Desktop `2.0.3`、DeepSeek Harness `0.1.1-rc.2`；它是测试基线，不是精确版本锁。

### 2. 获取发布包

可以从 [GitHub Releases](https://github.com/boe1900/owndsh/releases) 下载 `owndsh-<version>-linux-amd64.tgz`。需要从源码构建时：

```sh
git clone https://github.com/boe1900/owndsh.git
cd owndsh
corepack enable
pnpm --dir plugin install --frozen-lockfile
./deploy/scripts/build-release.sh --version 0.1.0 --output ./dist
```

构建完成后会生成 `dist/owndsh-0.1.0-linux-amd64.tgz`。构建机的 Docker runtime 必须是 `linux/amd64`。

### 3. 安装 OwnDsh Server

解压发布包，并为初始管理员准备一个权限为 `0600` 的密码文件。密码必须为 14-128 位，包含大小写字母、数字和符号。

```sh
tar -xzf owndsh-0.1.0-linux-amd64.tgz
cd owndsh-0.1.0-linux-amd64

./scripts/install.sh \
  --state-dir /opt/owndsh \
  --public-base-url http://owndsh.example.com:8080 \
  --admin-redirect-uri http://owndsh.example.com:8080/enterprise/auth/callback \
  --bootstrap-admin platform.admin \
  --bootstrap-password-file /secure-input/bootstrap-password \
  --http-port 8080 \
  --time-zone Asia/Shanghai
```

确认服务可用：

```sh
curl --fail http://owndsh.example.com:8080/healthz
```

然后打开 `http://owndsh.example.com:8080`，使用初始管理员账号登录。首次登录会要求修改密码。

安装器会自动生成数据库、Redis、Sa-Token、数据加密和插件签名所需的密钥。不要删除 `/opt/owndsh/secrets`；备份、恢复、升级和 HTTPS 接入请阅读[部署与运维指南](deploy/README.md)。

### 4. 配置企业

首次进入控制台后，建议按以下顺序配置：

1. 在“成员”中配置 LOCAL、LDAP 或 OIDC 身份来源。
2. 在“模型”中添加供应商、API Key 和受管模型。
3. 创建模型集，并向全部成员、用户组或指定成员授权。
4. 按需配置 Token 配额、RPM 和并发限制。
5. 邀请员工安装插件并登录。

员工设备不会获得供应商 API Key；每次模型请求都由 OwnDsh 网关重新校验身份、授权和额度。

### 5. 安装员工插件

管理员从安装目录的 `/opt/owndsh/harness/` 分发 `owndsh-plugin-0.1.0.tgz`。员工设备必须先确保 `pnpm` 在 `PATH` 中，然后安装到正在使用的 profile。

DSH Desktop：

```sh
dsh plugin --profile desktop add --ignore-scripts /absolute/path/owndsh-plugin-0.1.0.tgz
```

Harness Web：

```sh
dsh plugin --profile web add --ignore-scripts /absolute/path/owndsh-plugin-0.1.0.tgz
dsh --profile web
```

如果从 DeepSeek Harness 源码运行 CLI：

```sh
corepack pnpm@11.7.0 --dir /path/to/deepseek-harness dsh \
  plugin --profile desktop add --ignore-scripts \
  /absolute/path/owndsh-plugin-0.1.0.tgz
```

安装完成后重启 DSH Desktop 或对应 Harness profile。

仅安装 tgz 即可填写 Server、登录并使用企业模型。若要接收平台下发的受管插件，IT 管理员还需要把 `/opt/owndsh/harness/cordis.patch.yml` 中的 `owndsh` 配置合并到目标 profile；它包含部署专属 Server 默认值和插件签名公钥。不要覆盖已有 profile 的其他配置，也不要把服务端签名私钥复制到员工设备。全新独立 profile 的安装方式见[部署与运维指南](deploy/README.md#harness-企业-profile)。

### 6. 连接并登录

1. 打开 DSH Desktop 或 Harness Web。
2. 在 OwnDsh 页面填写 Server 地址，例如 `https://owndsh.example.com`。
3. 点击“保存”，再点击企业登录。
4. 在浏览器中完成 LOCAL、LDAP 或 OIDC 登录。
5. 返回 Harness；状态变为“已连接”后即可选择企业授权的模型。

Server 地址必须是完整的 HTTP(S) origin，不要附加 API 路径。生产部署应使用系统信任的 HTTPS 证书。

登录成功后最长保持 30 天，从本次登录开始计算且不会无限滑动续期。12 小时 Access Token 只存在于
Harness Host 内存；30 天 Refresh Token 由官方 `ctx.credentials` 服务保存并单次轮换。DSH Desktop、
命令行和 Harness Web profile 使用同一套 Host 侧机制，浏览器页面不会读取或保存 Token。Host 重启后
会自动恢复；若 Server 暂时不可达，会退避重试而不是要求重新登录。主动退出、设备撤销、成员停用或
改密会使对应长期会话失效。

## 更新与卸载

升级同版本的本地 tgz 时，pnpm 可能复用缓存。最稳妥的方式是先移除旧包，再安装新包并重启：

```sh
dsh plugin --profile desktop remove owndsh-plugin
dsh plugin --profile desktop add --ignore-scripts /absolute/path/owndsh-plugin-0.1.0.tgz
```

也可以在 OwnDsh 页面点击“卸载 OwnDsh”，同时移除 OwnDsh 和它管理的插件。服务端升级、回滚和员工 bundle 重新分发见[部署与运维指南](deploy/README.md)。

## 常见问题

### `pnpm not found on PATH`

`dsh plugin` 会在 profile 中调用 pnpm。先启用 Corepack 并确认 `pnpm --version` 能直接运行：

```sh
corepack enable
corepack install --global pnpm@11.7.0
pnpm --version
```

### 安装成功，但界面仍是旧版本

先执行 `remove`，再从绝对路径重新 `add`，最后彻底重启 DSH Desktop。仅覆盖同名、同版本 tgz 不保证刷新 pnpm store。

### 保存 Server 后显示平台不可用

先从员工设备访问 `<Server地址>/healthz`，再检查 DNS、防火墙和 TLS 证书。DSH Desktop 不应依赖自签名且未被系统信任的生产证书。

### 登录成功，但看不到模型

管理员需要同时启用供应商和模型，并为该员工、员工所在用户组或全部成员授予模型访问权限。配额或速率策略不会代替访问授权。

### 重启后仍然要求登录

正常重启会使用 Host 凭据存储中的 Refresh Token 静默恢复。若仍要求登录，通常是 30 天有效期已到、
用户主动退出、设备或成员已被撤销，或者 Server 地址已切换。检查 `$DSH_HOME` 是否指向原 profile，
并确认该 profile 的官方 credentials provider 可写。

## 安全边界

- 员工端不保存上游模型 API Key。
- Access Token 只保存在 Harness Host 进程内存中；Refresh Token 仅由官方 Host credentials provider 持久化。
- 浏览器 Client UI 不接收、读取或保存 Access/Refresh Token。
- Server 不挂载员工工作区，不远程执行终端或工具。
- Server secret、master key、插件签名私钥和生产备份不得提交到 Git。
- OwnDsh 自带入口只提供 HTTP；公网部署应由可信基础设施终止 TLS。
- V1 不启用 Session 同步，不会把本地会话正文上传到平台。

## 文档

- [部署、备份、恢复、升级与回滚](deploy/README.md)
- [V1 产品功能清单](docs/v1-product-feature-catalog.md)
- [管理控制台与身份设计](docs/phase-2-product-console-design.md)
- [技术架构与安全边界](docs/owndsh-governance-mvp-design.md)
- [V1 端到端验收](docs/v1-e2e-acceptance.md)

本地体验与开发验证可运行：

```sh
./scripts/local-demo.sh
```

该脚本要求同级存在已锁定的 `deepseek-harness` checkout，并使用隔离状态启动正式 Server 和 Harness；按 `Ctrl+C` 后清理本次环境。

## 上游与声明

OwnDsh 是独立开源项目，不隶属于 DeepSeek AI 或 Anywhere Labs。DeepSeek Harness 与 DSH Desktop 的名称、代码和商标归各自所有；OwnDsh 只通过它们公开的插件扩展点集成。
