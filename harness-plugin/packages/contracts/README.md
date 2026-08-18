# @enterprise-agent/dsh-contracts

Generated and runtime contracts for the enterprise Harness packages. The only
hand-written wire source is `../../../contracts/enterprise-openapi.yaml`.
`src/generated/` and `../../../contracts/generated/` are replaced together by
the generator and must not be edited manually.

The public package exposes strict Zod schemas, stable HTTP error decoding, and
validated branded IDs. The generator maps `additionalProperties: false` to
Zod `.strict()` so unknown wire fields fail instead of being stripped. Raw
generated ID aliases are deliberately not exported: business packages must
construct IDs through the matching `parse*Id()` helper.

The package inherits the workspace strict TypeScript baseline but disables
`exactOptionalPropertyTypes` locally because Hey API 0.99.0's generated Fetch
runtime passes explicit `undefined` for optional Web API fields. This exception
does not weaken the OpenAPI/Zod runtime boundary or any sibling package.

```sh
pnpm generate
pnpm check:generated
pnpm test
```
