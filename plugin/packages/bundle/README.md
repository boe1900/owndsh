<!--
[INPUT]: 依赖 npm next 包、Harness 官方 plugin/profile/settings/credentials 扩展点与 OwnDsh Server。
[OUTPUT]: 提供员工安装、连接、登录、默认免公钥的插件安装、更新和卸载说明。
[POS]: npm 包详情页与插件内置 README；面向员工，不承载 workspace 开发细节。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# owndsh-plugin

OwnDsh 的 DeepSeek Harness 官方扩展点插件。它把 DSH Desktop 或 Harness Web 连接到自托管 OwnDsh Server，让员工使用企业身份、受管模型和受管插件，而不在本机保存供应商 API Key。

> 当前稳定包为 `0.1.0`，Harness `0.1.5-rc.2` 为验证基线。

## 安装

先让 pnpm 在 PATH 中可用：

```sh
corepack enable
corepack install --global pnpm@11.7.0
```

选择实际使用的 Harness profile：

```sh
# Harness Web
dsh plugin --profile web add --ignore-scripts owndsh-plugin@latest

# DSH Desktop
dsh plugin --profile desktop add --ignore-scripts owndsh-plugin@latest
```

从 Harness 源码运行 CLI 时：

```sh
pnpm --dir /path/to/deepseek-harness dsh \
  plugin --profile web add --ignore-scripts owndsh-plugin@latest
```

安装后重启对应 profile。填写管理员提供的 OwnDsh Server HTTP(S) 地址并完成企业登录。

## 登录保持

Server 地址由 Harness 官方 settings 服务保存；轮换 Refresh Token 由 Host 官方 credentials 服务保存；Access Token 只保留在 Host 内存。正常重启会静默恢复登录，浏览器 Client 不会读取或保存 Token。

主动退出、设备撤销、成员停用、改密或 30 天有效期结束后需要重新登录。

闲置时没有企业 SSE、定时配置请求或提前续期。请求遇到 Access Token 到期才续期，并合并并发续期；服务端认证 401 最多续期重试一次。Refresh Token 失效时显示登录门禁，网络故障保留凭据供下次请求重试。打开 OwnDsh 设置或点击刷新时更新目录；页面复用 Harness 已有通知读取本机状态，登录中仅作有截止时间的临时查询。

## 更新与卸载

```sh
dsh plugin --profile web remove owndsh-plugin
dsh plugin --profile web add --ignore-scripts owndsh-plugin@latest
```

完全卸载只执行第一条命令。把 `web` 换成实际 profile。

## 兼容性与边界

当前验证基线是 DeepSeek Harness `0.1.5-rc.2`。OwnDsh 不替换官方 Web/Desktop UI，不访问员工工作区，也不实现第二套模型协议。

登录和企业模型只需安装本包。管理员上传、发布并配置可见范围后，员工在「OwnDsh 设置 → 插件」内自主安装、更新或卸载。不会自动安装，其他设备独立选择。安装或卸载后需完全退出并重新打开客户端。

插件签名校验 `verifyPluginSignatures` 默认关闭，员工无需配置公钥；文件大小、SHA-256、目标系统和 Harness 兼容性仍会校验。需要验签的部署可在 profile 的 `owndsh.config` 中设置 `verifyPluginSignatures: true` 和部署专属 `trustedPluginPublicKey`，开启后缺公钥或签名错误会阻止安装。

管理员上传时仍需选择目标系统和对应 Harness commit。已识别 Harness `0.1.1-rc.2`、`0.1.2-rc.1` 和 `0.1.5-rc.2`。旧版 OwnDsh 可能仍强制要求公钥或自动调和插件，需要先升级员工插件才能使用当前行为。

项目与完整部署说明：[github.com/boe1900/owndsh](https://github.com/boe1900/owndsh)
