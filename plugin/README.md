<!--
[INPUT]: 依赖已验证 Harness/Desktop 基线、兼容公开扩展点、插件 workspace 脚本与 V1 员工侧发行边界。
[OUTPUT]: 提供 owndsh-plugin 的架构、构建、树外验收与官方宿主零分叉说明。
[POS]: plugin workspace 的使用入口，连接发布包、自动门禁和真实 Harness 验收路径。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh Harness Plugin Workspace

This directory is the independent pnpm workspace for enterprise Harness
plugins. It does not import source files from the sibling DeepSeek Harness
checkout. T01 establishes formal packages for PKCE, local Host APIs,
OpenAI-compatible SSE, Session seed restoration, Client slots, and a
self-contained bundle. OwnDsh does not fork or maintain the official Harness
Web/Desktop UI: `owndsh-plugin` is the only employee-side deliverable, and the
locked upstream checkouts remain read-only verification fixtures. Published peers follow the same caret ranges as Harness packages, while the Host reports its actual Harness version through the official LLM runtime identity. T06 promotes the PKCE probe into `ctx.enterprisePlatform`
with in-memory Access Token ownership, official Host `GrantRecord` persistence for the rotating Refresh Token,
installation persistence, enroll/bootstrap, restart recovery, and request-time Token renewal and same-origin local JSON (no resident enterprise SSE). The workspace uses the locked Harness
release's public plugin surface and does not generate or mount a custom Typert
Remote. T07 adds the employee account experience through the official
`settings.section` and `shell.overlay` slots. Account information and sign-out live only in OwnDsh Settings. The
overlay blocks the official UI until a Server address is configured and the
enterprise session is ready; both surfaces share one browser store over
the T06 local control plane. The Server address is persisted by the official
Harness settings service, so a normal installation requires no profile edit.
T11 directly mounts the official `@deepseek-ai/dsh-llm-pi-ai` adapter with
enterprise-managed profiles and an ephemeral Host-only loopback authentication proxy. The enterprise
plugin stores no upstream API key and implements no model wire protocol.
The RC1 employee Client carries a synchronized copy of the official
`ui-plugin-manager` page. OwnDsh changes one official header button to
“Plugin market”; that button opens the controlled enterprise catalog while
the official page and `pluginManager`/inventory services continue to own cards,
details, install progress, enable/disable, update, uninstall, restart, and
configuration.

Run the workspace gate with:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm run pack:platform-client
pnpm run smoke:platform-client
pnpm run pack:bundle
pnpm run accept:t11-model
```

The packed bundle is accepted by `scripts/t01-harness-smoke.mjs` as both a
standalone package consumer and an installed plugin in a temporary Harness
`web` profile. It proves the zero-configuration `UNCONFIGURED` state, saves the
Server origin through the plugin's local API, and verifies the official
`settings.yaml`; it never writes to the sibling Harness checkout.
`pnpm run accept:t07-browser` starts a controlled loopback platform and a
temporary real Harness profile for the full-screen setup/login/expiry/revocation
acceptance; stop it with SIGINT so it can verify upstream cleanliness and remove
its temporary `DSH_HOME`.
`pnpm run accept:t11-model` is fully automatic: it installs the tgz into a
temporary Harness `web` profile, logs in through PKCE, drives the real `ctx.llm`
runtime, verifies dynamic models and stable failures, scans local files for the
platform Token/provider keys, and confirms the sibling checkout remains clean.
The enterprise catalog is refreshed when the Plugins page opens or the user
presses Refresh. A catalog item is converted to the official install spec;
semver only exposes an Update action for a higher version, so rollback is never
offered by the enterprise page.
