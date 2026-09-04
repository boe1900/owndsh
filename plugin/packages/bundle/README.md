<!--
[INPUT]: 依赖 npm next 包、Harness 官方 plugin/profile/settings/credentials 扩展点与 OwnDsh Server。
[OUTPUT]: 提供员工安装、连接、登录、更新和卸载 owndsh-plugin 的 npm 用户说明。
[POS]: npm 包详情页与插件内置 README；面向员工，不承载 workspace 开发细节。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# owndsh-plugin

OwnDsh 的 DeepSeek Harness 官方扩展点插件。它把 DSH Desktop 或 Harness Web 连接到自托管 OwnDsh Server，让员工使用企业身份、受管模型和受管插件，而不在本机保存供应商 API Key。

> 当前只发布测试版。请显式安装 `next`，`latest` 暂不更新。

## 安装

先让 pnpm 在 PATH 中可用：

```sh
corepack enable
corepack install --global pnpm@11.7.0
```

选择实际使用的 Harness profile：

```sh
# Harness Web
dsh plugin --profile web add --ignore-scripts owndsh-plugin@next

# DSH Desktop
dsh plugin --profile desktop add --ignore-scripts owndsh-plugin@next
```

从 Harness 源码运行 CLI 时：

```sh
pnpm --dir /path/to/deepseek-harness dsh \
  plugin --profile web add --ignore-scripts owndsh-plugin@next
```

安装后重启对应 profile。填写管理员提供的 OwnDsh Server HTTP(S) 地址并完成企业登录。

## 登录保持

Server 地址由 Harness 官方 settings 服务保存；轮换 Refresh Token 由 Host 官方 credentials 服务保存；Access Token 只保留在 Host 内存。正常重启会静默恢复登录，浏览器 Client 不会读取或保存 Token。

主动退出、设备撤销、成员停用、改密或 30 天有效期结束后需要重新登录。

## 更新与卸载

```sh
dsh plugin --profile web remove owndsh-plugin
dsh plugin --profile web add --ignore-scripts owndsh-plugin@next
```

完全卸载只执行第一条命令。把 `web` 换成实际 profile。

## 兼容性与边界

当前验证基线是 DSH Desktop `2.0.3` / DeepSeek Harness `0.1.1-rc.2`。OwnDsh 不替换官方 Web/Desktop UI，不访问员工工作区，也不实现第二套模型协议。

登录和企业模型只需安装本包。平台下发第三方受管插件时，管理员还需通过 profile 配置部署专属 Ed25519 公钥；没有信任根时该能力会安全关闭。

项目与完整部署说明：[github.com/boe1900/owndsh](https://github.com/boe1900/owndsh)
