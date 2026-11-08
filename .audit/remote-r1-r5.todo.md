# Remote R1-R5

## Phase A: Frame

- [x] State a falsifiable definition of done.
- [x] Quantify scope and record blockers.
- [x] Set rigor from blast radius and one-way doors.

## Phase B: Design the workflow

- [x] Decompose the work into atomic, independently verifiable units.
- [x] Build the verification harness before the implementation.
- [x] Sequence the riskiest unknowns first.
- [x] Record the designed phase list for review.

## Phase C: Run the loop

- [x] Verify each unit against the real artifact before starting the next unit.
- [x] Record VERIFIED, NOT VERIFIED, or INCONCLUSIVE for each gate.

## Phase D: Keep the audit trail

- [x] Append one decision row for each fork, checkpoint, pivot, or revert.
- [x] Audit the trail against this run before handing back.

## Phase E: Verify and hand back

- [x] Run the available R1-R5 predicate against real artifacts. R1 same-JVM and independent-JVM `ws://` and self-signed `wss://` loopback network-level WebSocket is VERIFIED and R2 real Redis/PostgreSQL is VERIFIED; local coturn ticket credential and Allocate are now VERIFIED; local Server container deployment is VERIFIED; production certificate-chain, Host/Web deployment WSS, WebRTC P2P, cross-NAT, UDP-blocked and multi-node paths remain NOT VERIFIED.
- [x] Encode recurring corrections in tests or checks. `RemoteGatewayTest` is included in the active `dev` tag and the integration fixture uses a live clock baseline.
- [x] Report what is verified and what remains open.

## Designed phases

- [x] R1 carrier domain and Netty relay. 17 Java carrier tests and 1 Redis/PostgreSQL integration test pass, including same-JVM and independent-JVM JDK WebSocket `ws://` and self-signed `wss://` loopback network-level Upgrade, Peer/Link replacement, strict dispatch, relay sequencing, counter rejection, public-key bounds, lease and close semantics.
- [x] R2 authorization and lease enforcement. Real Redis/PostgreSQL acceptance passes with two tenants, ticket binding and one-time consume, lease fencing, revoke and presence TTL.
- [x] R3 Host carrier. Host WSS factory, hello/presence lifecycle and sign-out/revoke shutdown are implemented; unit/build checks and the Java listener loopback network-level WebSocket gate pass, while real Host deployment WSS remains NOT VERIFIED.
- [x] R4 controller carrier. Relay controller state, Noise core and lease/diagnostic boundaries are implemented; deterministic tests pass, and the Vite `/remote/ws/v1` development proxy forwards toward the Java listener; authenticated cross-browser handshake remains NOT VERIFIED.
- [x] R5 transport selection. WebRTC DataChannel, TURN credential wiring and Relay fallback are implemented; adapter/core tests pass, local coturn deployment and ticket credential Allocate are VERIFIED; cross-NAT, UDP-blocked and production coturn evidence remain NOT VERIFIED.
- [x] Final gates. Java, contract, plugin and console checks pass; R1/R2 loopback and storage gates are VERIFIED, while production WSS/WebRTC P2P, cross-NAT, UDP-blocked, production coturn and multi-node gates remain NOT VERIFIED; local Server container and coturn Allocate are VERIFIED.

## Scope boundary

skip: Session, File, Terminal, Android business client, and Typert provider integration remain R6-R8.
skip: Production coturn hardening, cross-NAT and UDP-blocked evidence remain blocked until an external network integration environment is available; local coturn configuration and credential Allocate are verified.

## Client revocation semantic follow-up

- [x] Ground the existing platform credential owner and Remote carrier lifecycle.
- [x] Compare two candidate ownership designs before implementation. Candidates A/B converged on a typed connection event and platform-owned cleanup; the cross-judge selected the smaller A-compatible interface with B's sticky-state invariants.
- [x] Implement the chosen revocation event and sticky terminal state. `ENT_DEVICE_REVOKED` now clears credentials through `EnterprisePlatformService.markDeviceRevoked()`, closes the carrier with `REVOKED`, and blocks ordinary `SIGNED_OUT`.
- [x] Verify the focused regression tests and the package type/build gates. Platform-client 42 tests, bundle 37 tests, and both package typechecks pass.
- [x] Reconcile the GEB L2/L3 maps and append the audit evidence.
