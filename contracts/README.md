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

T08 adds the provider, managed-model, grant, and bootstrap vertical contract.
Provider credentials are write-only inputs; provider outputs expose only
`credentialConfigured`, and runtime bootstrap exposes model capabilities without
provider routes, upstream model names, or credentials.

T09 adds quota policy/window management, active-device usage, prompt-free ledger
queries, bootstrap quota facts, and stable quota/idempotency error details. Window
responses expose counters and reset times without internal row IDs or revisions;
ledger responses cannot carry prompts, messages, provider routes, or credentials.

T10 adds the strict OpenAI-compatible streaming request accepted by the managed
model gateway. T11 extends that request with the validated
`thinking.type=enabled|disabled` and `reasoning_effort=high|max` pair used by the
official Harness adapter. The schema permits only managed aliases or
`enterprise/default`, text messages and function tools; it deliberately has no
provider, base URL, upstream model, credential, or arbitrary top-level extension
point. Successful stream events remain SSE rather than the enterprise JSON
success envelope.

```sh
cd harness-plugin
pnpm --filter @enterprise-agent/dsh-contracts generate
pnpm --filter @enterprise-agent/dsh-contracts check:generated
```

Both TypeScript and Java tests load the same fixture list declared by the
OpenAPI `x-enterprise-fixtures` extension. A fixture is accepted only when its
declared schema and expected validity agree in both runtimes.
