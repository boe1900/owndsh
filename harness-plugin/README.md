# Enterprise Harness Plugin Workspace

This directory is the independent pnpm workspace for enterprise Harness
plugins. It does not import source files from the sibling DeepSeek Harness
checkout. T01 establishes formal packages for PKCE, local Host APIs,
OpenAI-compatible SSE, Session seed restoration, Client slots, and a
self-contained bundle. T06 promotes the PKCE probe into `ctx.enterprisePlatform`
with in-memory Token ownership, installation persistence, enroll/bootstrap,
refresh, and same-origin local JSON/SSE. The workspace uses the locked Harness
release's public plugin surface and does not generate or mount a custom Typert
Remote. T07 adds the desktop employee account experience through the official
`settings.section`, `sidebar.footer.action`, and `settings.onboarding` slots;
all three surfaces share one browser store over the T06 local control plane.
T11 promotes the SSE probe into `EnterpriseGatewayAdapter`, using the official
rc.7 `ctx.llm` registration, dynamic bootstrap catalog, default sentinel,
single-attempt policy, cancellation, and direct Host-to-center model stream.
T14 adds `ctx.enterprisePluginDistribution` through the official rc.7
`ctx.subprocess` and `ctx.pluginInventory` services. It downloads and verifies
center-managed tgz artifacts, invokes the official CLI with fixed argv, keeps
atomic local state, and waits for a new process to confirm the Loader row.
T17 adds `ctx.enterpriseSessionSync` through official rc.7 `sessions` and
`sessionPersistence`: local append remains network-independent, acknowledged
cursors are atomic and content-free, and a fully verified remote log is
restored under a new durable Session ID.

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
```

The packed bundle is accepted by `scripts/t01-harness-smoke.mjs` as both a
standalone package consumer and an installed plugin in a temporary Harness
`web` profile. The script never writes to the sibling Harness checkout.
`pnpm run accept:t07-browser` starts a controlled loopback platform and a
temporary real Harness profile for desktop snapshot/GIF acceptance; stop it
with SIGINT so it can verify upstream cleanliness and remove its temporary
`DSH_HOME`.
`pnpm run accept:t11-model` is fully automatic: it installs the tgz into a
temporary rc.7 `web` profile, logs in through PKCE, drives the real `ctx.llm`
runtime, verifies dynamic models and stable failures, scans local files for the
platform Token/provider keys, and confirms the sibling checkout remains clean.
`pnpm run smoke:plugin-distribution` installs the three release tarballs into a
fresh package consumer without ambient declarations. `pnpm run
accept:t14-dsh-plugin` uses a temporary `DSH_HOME` and paths containing spaces
to prove exact add, downgrade rollback, profile reconciliation, and remove
against the locked unmodified CLI.
`pnpm run smoke:session-sync` installs the published product tarballs and npm
rc.7 Session peers into a fresh consumer without ambient declarations, then
executes a real JSONL persistence sync/restore chain. `pnpm run
accept:t17-session` installs the enterprise bundle into a temporary locked
Harness `web` profile and proves append network isolation, real
flush/readFrom, remote list, new-ID restoration, content-free cursor state, and
upstream cleanliness.
