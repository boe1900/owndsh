# @enterprise-agent/dsh-bundle

Prebuilt enterprise composition package for the locked Harness release. It
ships one Cordis Host plugin, one `dsh.client` lazy-CJS browser bundle, and the
`cordis.patch.yml` layer that inserts the row by bare package name.

The profile layer sets provider `enterprise` and model `enterprise/default` on
`agent-default-model`, disables the built-in DeepSeek and pi-ai provider rows,
and disables the personal Models settings page. The Host plugin configures the
official rc.2 `dsh-llm-pi-ai` adapter through `ctx.llm`, and mounts distribution
through ordinary `ctx.subprocess`/`ctx.pluginInventory` or Desktop's public
`desktopProfiles`/`desktopPnpm` services. Exact rc.2 peers resolve from the Host dependency fallback instead of
installing second Service Definitions into the profile. It also injects the
official `sessions` and `sessionPersistence` Services and mounts
`EnterpriseSessionSyncService`; the build keeps those official runtime
singletons external while inlining product workspace modules.

The tarball is self-contained at runtime: workspace packages are build inputs,
not installed dependencies. Install it with:

```sh
dsh plugin --profile <profile> add ./enterprise-agent-dsh-bundle-0.1.0.tgz
```

The profile overlay must set `config.baseUrl` to the enterprise platform HTTPS
origin and `config.trustedPluginPublicKey` to the installation-owned Ed25519
SPKI public key; neither has a runtime default. The platform bootstrap cannot
replace that trust root. `bootstrapIntervalMs`, `requestTimeoutMs`,
`disposeTimeoutMs`, managed profile and `dshCommand` use the detailed-design
defaults unless the installation layer overrides them. Session replication adds
`sessionDebounceMs=2000`, `sessionRetryInitialMs=1000`,
`sessionRetryMaxMs=60000`, and `sessionMaxBatchEvents=200`; the authenticated
bootstrap remains the source of the byte limit and enablement policy. The Host half publishes `ctx.enterprisePlatform`
and mounts only same-origin `/enterprise/api/v1/local/*` JSON/SSE routes. Model
streams do not traverse that browser control plane: the official adapter uses a
random-port, random-bearer Host-only loopback proxy, which calls the enterprise
HTTPS center through the in-memory authenticated Service.
The Client half adds only the official settings shell to its T07 module graph,
then contributes Enterprise settings, footer status, and onboarding slots.
`enableTechnicalProbe` may allow an HTTP loopback fake platform for acceptance;
released profiles keep it disabled and require the HTTPS origin.
