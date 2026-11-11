# Remote workspace investigation

- [x] Route through the **how** skill. For motivation questions, also route through the **why** skill.
- [x] Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
- [x] Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
- [x] Apply the **unslop** skill to the reply.

Scope: compare upstream plugin remote workspace discovery and operations with OwnDsh; no product code or deployment changes.
Why: skip: this is a capability and implementation question, not a motivation investigation.

Evidence: fixed research checkout 90cd1889f85196ae71b1a3fa1ff789a106f4fdcd; fetched and checked GitHub HEAD 4ec80b1b1827d465a7bbc880d0be38db636580cc without changing the checkout.
Verified: plugin manual workspace UI uses directoryPicker/list, workspace catalog/create, remote Gateway switching and official UI workspace navigation; remote_* Agent tools are separate and do not switch UI.
OwnDsh gaps: employee controller authorization APIs, plugin controller/UI, encrypted runtime business channel, scoped Host business bridge, and native UI Gateway adapter.
Validation boundary: source inspection only; no cross-device business execution.
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
