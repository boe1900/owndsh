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
with in-memory Token ownership, installation persistence, enroll/bootstrap,
refresh, and same-origin local JSON/SSE. The workspace uses the locked Harness
release's public plugin surface and does not generate or mount a custom Typert
Remote. T07 adds the employee account experience through the official
`settings.section`, `sidebar.footer.action`, and `shell.overlay` slots. The
overlay blocks the official UI until a Server address is configured and the
enterprise session is ready; all three surfaces share one browser store over
the T06 local control plane. The Server address is persisted by the official
Harness settings service, so a normal installation requires no profile edit.
T11 directly mounts the official rc.2 `@deepseek-ai/dsh-llm-pi-ai` adapter with
enterprise-managed profiles and an ephemeral Host-only loopback authentication proxy. The enterprise
plugin stores no upstream API key and implements no model wire protocol.
T14 adds `ctx.enterprisePluginDistribution` through the official rc.2
`ctx.subprocess`/`ctx.pluginInventory` services and Desktop's public plugin command service. It downloads and verifies
center-managed tgz artifacts, invokes the environment-native official command with fixed argv, keeps
atomic local state, and waits for a new process to confirm the Loader row.
T17 adds `ctx.enterpriseSessionSync` through official rc.2 `sessions` and
`sessionPersistence`: local append remains network-independent, acknowledged
cursors are atomic and content-free, and a fully verified remote log is
restored under a new durable Session ID.
T18 exposes that service through the third Enterprise Settings tab: strict
same-origin DTOs show cursor states and remote metadata, restore a cross-device
copy into an existing local directory, and delete a remote copy only after an
explicit confirmation. A persisted `DELETED` cursor prevents that local copy
from being uploaded again after a Harness restart.

Run the workspace gate with:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm run pack:platform-client
pnpm run smoke:platform-client
pnpm run pack:plugin-distribution
pnpm run smoke:plugin-distribution
pnpm run pack:session-sync
pnpm run smoke:session-sync
pnpm run pack:bundle
pnpm run accept:t11-model
pnpm run accept:t14-dsh-plugin
pnpm run accept:t17-session
pnpm run accept:t18-browser
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
temporary rc.2 `web` profile, logs in through PKCE, drives the real `ctx.llm`
runtime, verifies dynamic models and stable failures, scans local files for the
platform Token/provider keys, and confirms the sibling checkout remains clean.
`pnpm run smoke:plugin-distribution` installs the three release tarballs into a
fresh package consumer without ambient declarations. `pnpm run
accept:t14-dsh-plugin` uses a temporary `DSH_HOME` and paths containing spaces
to prove exact add, downgrade rollback, profile reconciliation, and remove
against the locked unmodified CLI.
`pnpm run smoke:session-sync` installs the published product tarballs and npm
rc.2 Session peers into a fresh consumer without ambient declarations, then
executes a real JSONL persistence sync/restore chain. `pnpm run
accept:t17-session` installs the enterprise bundle into a temporary locked
Harness `web` profile and proves append network isolation, real
flush/readFrom, remote list, new-ID restoration, content-free cursor state, and
upstream cleanliness.
`pnpm run accept:t18-browser` starts a controlled cross-device platform and a
temporary locked Harness `web` profile for the real Settings workflow. After
the operator restores and deletes the new copy, its completion endpoint
restarts the same profile and proves the persisted tombstone causes zero
retransmissions before removing the temporary `DSH_HOME`.
