# Enterprise Harness Plugin Workspace

This directory is the independent pnpm workspace for enterprise Harness
plugins. It does not import source files from the sibling DeepSeek Harness
checkout. Product packages added by later implementation tasks must compile
against published, public `@deepseek-ai/dsh-*` extension points at the locked
Harness baseline.

T00 intentionally creates no plugin package. T01 owns the first technical
spike packages, so the baseline workspace contains only its toolchain and
invariant test.

Run the workspace gate with:

```sh
pnpm install --frozen-lockfile
pnpm check
```
