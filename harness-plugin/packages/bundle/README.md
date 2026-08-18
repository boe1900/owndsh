# @enterprise-agent/dsh-bundle

Prebuilt enterprise composition package for the locked Harness release. It
ships one Cordis Host plugin, one `dsh.client` lazy-CJS browser bundle, and the
`cordis.patch.yml` layer that inserts the row by bare package name.

The profile layer sets provider `enterprise` and model `enterprise/default` on
`agent-default-model`, disables the built-in DeepSeek and pi-ai provider rows,
and disables the personal Models settings page. The Host plugin registers the
enterprise adapter through the official rc.7 `ctx.llm` service. The package
declares an exact `@deepseek-ai/dsh-llm@0.1.0-rc.7` peer; rc.7 resolves that
Service Definition from the Harness app dependency fallback instead of
installing a second runtime into the profile.

The tarball is self-contained at runtime: workspace packages are build inputs,
not installed dependencies. Install it with:

```sh
dsh plugin --profile web add ./enterprise-agent-dsh-bundle-0.1.0.tgz
```

The profile overlay must set `config.baseUrl` to the enterprise platform HTTPS
origin; the bundle intentionally has no default platform address. Optional
`bootstrapIntervalMs`, `requestTimeoutMs`, and `disposeTimeoutMs` values override
the documented T06 defaults. The Host half publishes `ctx.enterprisePlatform`
and mounts only same-origin `/enterprise/api/v1/local/*` JSON/SSE routes. Model
streams do not traverse that browser control plane: the Host adapter calls the
enterprise HTTPS center directly through the in-memory authenticated Service.
The Client half adds only the official settings shell to its T07 module graph,
then contributes Enterprise settings, footer status, and onboarding slots.
`enableTechnicalProbe` may allow an HTTP loopback fake platform for acceptance;
released profiles keep it disabled and require the HTTPS origin.
