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

Run the workspace gate with:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm run pack:platform-client
pnpm run smoke:platform-client
pnpm run pack:bundle
```

The packed bundle is accepted by `scripts/t01-harness-smoke.mjs` as both a
standalone package consumer and an installed plugin in a temporary Harness
`web` profile. The script never writes to the sibling Harness checkout.
`pnpm run accept:t07-browser` starts a controlled loopback platform and a
temporary real Harness profile for desktop snapshot/GIF acceptance; stop it
with SIGINT so it can verify upstream cleanliness and remove its temporary
`DSH_HOME`.
