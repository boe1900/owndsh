<!--
[INPUT]: 依赖 bundle manifest/profile patch、Host 组合根、官方模型适配与 Client 门禁实现。
[OUTPUT]: 提供 owndsh-plugin 安装、可选部署默认值、信任根和 Web/Desktop 运行边界说明。
[POS]: 可发布员工插件的使用入口，定义安装后只填 Server 与官方宿主零分叉契约。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# owndsh-plugin

Prebuilt enterprise composition package for compatible Harness releases. It
ships one Cordis Host plugin, one `dsh.client` lazy-CJS browser bundle, and the
`cordis.patch.yml` layer that inserts the row by bare package name.

The profile layer sets provider `enterprise` and model `enterprise/default` on
`agent-default-model`, disables the built-in DeepSeek and pi-ai provider rows,
and disables the personal Models settings page. The Host plugin configures the
official `dsh-llm-pi-ai` adapter through `ctx.llm`, and mounts distribution
through ordinary `ctx.subprocess`/`ctx.pluginInventory` or Desktop's public
`desktopProfiles`/`desktopPnpm` services. Harness peers use the official caret-compatible release line and resolve from the Host dependency fallback instead of
installing second Service Definitions into the profile. V1 does not inject the
official Session Services or construct `EnterpriseSessionSyncService`; the
independent Session implementation remains in the repository for a later release.

The tarball is self-contained at runtime: workspace packages are build inputs,
not installed dependencies. Install it with:

```sh
dsh plugin --profile <profile> add ./owndsh-plugin-0.1.0.tgz
```

After installation, the employee only enters the OwnDsh Server origin in the
full-screen access gate. The value is saved by the official Harness settings
service; `config.baseUrl` is only an optional deployment default. An installer
may embed the deployment-owned Ed25519 `config.trustedPluginPublicKey`; when it
is absent, login and model access still work but managed-plugin installation
fails closed. The platform bootstrap cannot replace that trust root.
`bootstrapIntervalMs`, `requestTimeoutMs`,
`disposeTimeoutMs`, managed profile and `dshCommand` use the detailed-design
defaults unless the installation layer overrides them. The authenticated
bootstrap explicitly publishes `sessionPolicy.enabled=false`. The Host half requires the official credentials service, publishes `ctx.enterprisePlatform`
and mounts only same-origin `/enterprise/api/v1/local/*` JSON/SSE routes. Model
streams do not traverse that browser control plane: the official adapter uses a
random-port, random-bearer Host-only loopback proxy, which calls the configured
HTTP(S) enterprise center through the in-memory Access Token. The rotating Refresh Token remains in the
official Host credential provider, so Desktop, CLI and Web profiles can recover after a Host restart without exposing it to Client UI.
The Client half uses only official Client modules, then contributes Enterprise
settings, footer status, and a global `shell.overlay` access gate. OwnDsh does
not ship or maintain a replacement Harness Web/Desktop UI.
`enableTechnicalProbe` only enables the acceptance-only Session-copy route; it
does not alter Server URL validation. Both HTTP and HTTPS origins are accepted,
while production deployments should prefer HTTPS.

DSH Desktop `2.0.3` / Harness `0.1.1-rc.2` is the verified baseline, not an exact Desktop runtime lock. The bundle reads the actual Harness version from `@deepseek-ai/dsh-llm` and its own version from this package manifest. On a compatible but not yet commit-verified Harness, login and model access remain available; center-managed third-party artifacts fail closed until their exact Harness commit is approved.
