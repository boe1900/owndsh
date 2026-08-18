# Enterprise HTTP Contracts

`enterprise-openapi.yaml` is the logical HTTP protocol root for the enterprise
Server, admin client, and Harness packages. Vertical schema groups live below
`components/` and are referenced by name from the root; together they form one
OpenAPI document. Each task adds operations only with its matching Controller
and authorization.

The Harness contracts package generates TypeScript DTOs, Fetch bindings, strict
Zod schemas, standalone JSON Schemas, and a hash of the fully bundled logical
protocol. Generated files
are committed but never edited directly. The Zod generator resolver preserves
OpenAPI `additionalProperties: false` as `.strict()` instead of silently
stripping undeclared wire fields.

```sh
cd harness-plugin
pnpm --filter @enterprise-agent/dsh-contracts generate
pnpm --filter @enterprise-agent/dsh-contracts check:generated
```

Both TypeScript and Java tests load the same fixture list declared by the
OpenAPI `x-enterprise-fixtures` extension. A fixture is accepted only when its
declared schema and expected validity agree in both runtimes.
