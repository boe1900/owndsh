# @enterprise-agent/dsh-bundle

Prebuilt enterprise composition package for the locked Harness release. It
ships one Cordis Host plugin, one `dsh.client` lazy-CJS browser bundle, and the
`cordis.patch.yml` layer that inserts the row by bare package name.

The tarball is self-contained at runtime: workspace packages are build inputs,
not installed dependencies. Install it with:

```sh
dsh plugin --profile web add ./enterprise-agent-dsh-bundle-0.1.0.tgz
```

The profile overlay must set `config.baseUrl` to the enterprise platform HTTPS
origin; the bundle intentionally has no default platform address. Optional
`bootstrapIntervalMs`, `requestTimeoutMs`, and `disposeTimeoutMs` values override
the documented T06 defaults. The Host half publishes `ctx.enterprisePlatform`
and mounts only same-origin `/enterprise/api/v1/local/*` JSON/SSE routes.
