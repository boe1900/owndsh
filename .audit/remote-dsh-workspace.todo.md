# DSH 远程工作区实施

- [x] Read the Principles section of the **poteto-mode** skill.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [x] Phase C: Run the loop
- [x] Phase D: Keep the audit trail
- [x] Phase E: Verify and hand back

Done: two isolated Harness instances use an authenticated OwnDsh link to list and open an existing DSH workspace, use the native Session UI through the remote Gateway, and reject remote operations after disconnect without executing locally. Existing login/model/plugin behavior passes regression checks. Only DSH is supported.

## Workflow

- [x] Ground: inspect employee authorization, Remote wire/crypto, rc5 Gateway and native UI integration.
- [x] Sketch: compare two distinct designs and independently judge the shared contract.
- [x] Agree: record chosen contracts and ownership; proceed under user authorization.
- [x] Implement: employee-owned discovery/ticket APIs and server identity/link prerequisites.
- [x] Implement: authenticated encrypted business RPC and Host DSH allowlist/scope.
- [x] Implement: plugin controller lifecycle, native Gateway switching, workspace selection UI.
- [x] Verify: real isolated Harness pair, workspace/session operations and disconnect isolation.
- [x] Verify: authorization boundaries, existing plugin/server regressions, independent change review.
- [x] Scrap: n/a, no repeated contract deviation required redesign.

## Throughput checkpoint

- Blocking first steps: freeze wire and rc5 Gateway behavior before code fan-out.
- Independent workstreams: Java employee control APIs and TypeScript endpoint implementation use separate worktrees after contract freeze.
- Shared mutable state: contracts and integration root have one owner; delegates commit disjoint units in isolated checkouts.
- Smallest safe decomposition: two implementation owners, then root integration and independent review.

## Arena

- [x] Frame
- [x] Fan out
- [x] Cross-judge
- [x] Pick
- [x] Graft
- [x] Verify

## Final gates

- [x] Two real isolated Harness instances, real employee PKCE, explicit opt-in and encrypted native page.
- [x] Native prompt/stream through a labelled local provider protocol fixture and the real Java gateway.
- [x] Remote file RPC/media, over-64-KiB responses and terminal input/output with remote-only filesystem effects.
- [x] Refresh/new view, old URL rejection, disconnected refresh, failed retry/manual recovery and draft isolation.
- [x] Chrome Storage six-scenario acceptance; 193 plugin tests, four workspace checks, 122 console tests and 40 Java Remote tests.
- [x] Final independent review, including the symlink/.. path semantics raised in the incremental review.
- [x] Final L3/L2/L1 loop, deslop and reviewable commit.

Final evidence: `.audit/remote-workspace-local-evidence.json` records 14 passing scenarios against the final packed plugin. The two symlink/.. variants are rejected, large media matches its source SHA-256, and valid disconnected mutations leave both Harness instances unchanged. Bundle typecheck and generated-contract checks pass after the path fix. Independent incremental review ran 11 focused tests and found no remaining medium/high defects.

Not claimed: standalone Android/Web controller product, external live model provider, P2P/TURN fallback, production TLS or multi-node fencing.

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
