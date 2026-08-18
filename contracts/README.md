# Enterprise HTTP Contracts

`enterprise-openapi.yaml` is the only hand-written HTTP protocol source for
the enterprise Server, admin client, and Harness packages. T02 intentionally
contains reusable OpenAPI components only; each later vertical task adds its
operations together with the corresponding Controller and authorization.

The Harness contracts package generates TypeScript DTOs, Fetch bindings, strict
Zod schemas, standalone JSON Schemas, and the protocol hash. Generated files
are committed but never edited directly. The Zod generator resolver preserves
OpenAPI `additionalProperties: false` as `.strict()` instead of silently
stripping undeclared wire fields.

```sh
cd harness-plugin
pnpm --filter @enterprise-agent/dsh-contracts generate
pnpm --filter @enterprise-agent/dsh-contracts check:generated
```

Both TypeScript and Java tests load the same five-fixture list declared by the
OpenAPI `x-enterprise-fixtures` extension. A fixture is accepted only when its
declared schema and expected validity agree in both runtimes.
