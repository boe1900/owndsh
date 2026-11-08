# Remote live integration

- [x] Verify local Colima, PostgreSQL and Redis health.
- [x] Build the current Java Server artifact from source.
- [x] Start the current Server with Remote enabled.
- [x] Obtain a real Sa-Token through the existing auth flow.
- [x] Probe authenticated Remote device and ticket endpoints.
- [x] Start a real Host carrier against the Server.
- [x] Connect a controller client and verify lease and relay frames.
- [x] Verify lease revoke fences the live remote link and closes it on the next renew.
- [x] Record every gate in `.audit/remote-r1-r5.tsv`.
- [x] Audit this run against the Codex transcript before handoff.
- [x] Re-run the final Relay evidence with Host and Controller close assertions.
- [x] Rotate the local test administrator password through the API and revoke test sessions.
- [x] Remove temporary access-token files and re-audit the final transcript.
- [x] Scope historical credential material retained in the Codex transcript as an explicit attention item.
- [x] Verify the Vite development server forwards `/remote/ws/v1` to the Java Remote listener.
- [x] Re-run the authenticated no-TLS loopback path with an isolated account and evidence file.
- [x] Re-run the authenticated no-TLS LAN path through the LAN HTTP origin, direct Remote listener and Vite WebSocket proxy.
- [x] Leave the local runtime in the LAN binding configuration after the verification run.
- [x] Verify the LAN shell is reachable while unauthenticated HTTP and WebSocket control paths remain closed.

Throughput checkpoint:

- Complete one phase only after its direct predicate passes.
- Keep production TLS, WebRTC and cross-network gates explicitly `NOT VERIFIED` when the local topology cannot prove them.
- The no-TLS loopback and LAN Relay runs passed. Each fresh account completed PKCE, device enrollment, Host presence, ticket issuance, Vite-proxied controller handshake, lease acquire/renew, bidirectional Relay, lease revoke and device revoke.
- A separate coturn container accepted a Java-issued short-lived TURN credential and UDP Allocate on the loopback topology. A same-host Allocate against the LAN address timed out because Docker hairpin traffic to the host LAN address is unavailable in this topology. A second LAN device is required before marking LAN TURN Allocate verified.

Latest loopback replay: `2026-11-08T07:20Z`, link `rln_FSS7VTGCW2STGQ2C5XN8N87KMG`; see `.audit/remote-local-no-tls-evidence.json`. Latest LAN replay: `2026-11-08T07:18Z`, link `rln_16DN4V5PZVJQCYSY0P9JSCPJFC`; see `.audit/remote-lan-no-tls-evidence.json`. Both peers closed with code `4008`; admin logout returned `200`, and the revoked Host logout returned `403 ENT_DEVICE_REVOKED` with `retryable=false`. These fixtures exercise the deployed Java listener and Vite proxy with the Remote wire protocol. A separately launched `RemoteRuntime`, a browser authenticated from a LAN origin, WebRTC LAN/P2P, cross-NAT, UDP-blocked fallback and production WSS remain outside this gate.
LAN auth boundary evidence is in `.audit/remote-lan-auth-boundary.json`. The Vite shell returned `200`, unauthenticated admin bootstrap returned `403`, and both direct and proxied unauthenticated WebSocket upgrades stayed closed.

Latest Console proxy probe: `2026-11-07T23:37:18Z`. Direct and Vite-proxied unauthenticated WebSocket upgrades both failed, and Vite logged `ws proxy error: socket hang up` while forwarding to the configured Java listener. See `.audit/remote-vite-proxy-evidence.json`. This proves the development route, not an authenticated browser session.

Credential scope: repository `.audit` evidence contains no access token or password. The Codex rollout retains historical credential material from earlier commands and must be treated as sensitive; the active local test administrator password was rotated through the API after the live run.

Latest local coturn validation: `.audit/remote-turn-evidence.json`. The Java ticket returned one ICE/TURN server and the returned credential was accepted by coturn 4.6.3; no credential values were persisted. The LAN ticket returned `turn://192.168.5.83:3478` in `.audit/remote-lan-no-tls-evidence.json`, but Allocate over the same host's LAN hairpin is not claimed.
Latest Server container validation: `.audit/remote-container-evidence.json`. The current source built with `deploy/compose/Dockerfile.server`, ran as uid 10001 with a read-only root filesystem, reached PostgreSQL/Redis through `host.docker.internal`, and passed the authenticated Relay/Lease/revoke fixture on mapped ports 18080/18090.
