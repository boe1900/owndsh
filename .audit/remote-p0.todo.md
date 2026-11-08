# Remote P0

- [x] Ground existing contracts, device context, Redis and Netty boundaries.
- [x] Freeze ticket request and response shapes in OpenAPI.
- [x] Implement remote device snapshot persistence and control service.
- [x] Implement authenticated Java controller endpoints.
- [x] Wire Redis ticket, lease and revoke operations.
- [x] Update console request path and generated clients.
- [x] Verify TypeScript contracts, tests, generated drift and Java source shape.

Evidence:

- Java remote tests pass with JDK 21: 13 carrier/domain tests, 0 failures. The live-store acceptance test compiles but is blocked by the local Docker runtime.
- `@owndsh/contracts` tests and generated check pass: 13 tests, 0 failures.
- `owndsh-plugin` tests and typecheck pass: 36 tests, 0 failures.
- Console TypeScript check, 110 tests and production build pass.

Remaining implementation phases are deliberately outside this P0 artifact pass:

- R1-R5: deployed live Relay/Peer/Link, cross-node fencing, real Host WSS, browser-to-Host Noise/WebRTC, production coturn and cross-network fallback remain acceptance work; deterministic carrier/core/adapters are now in the repository.
- R6-R8: Session, File, Terminal and Android business clients.

skip: PostgreSQL/Redis Testcontainers and cross-network WebRTC evidence require the runtime integration environment and belong to R1-R5 acceptance.
