# Remote NAS deployment

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

- [x] Backup the active NAS Compose and environment metadata without secrets.
- [x] Build current ARM64 Server and Console artifacts from this checkout.
- [x] Import artifacts and verify image architecture and digest on NAS.
- [x] Apply the remote override with Remote listener and coturn enabled.
- [x] Verify health, ports, logs, and data-store continuity.
- [x] Run authenticated cross-machine Relay, Lease, revoke, and TURN Allocate probes.
- [x] Restore the previous service if any deployment predicate fails.
  - skip: every health, protocol, authorization, cleanup, and TURN predicate passed; the saved rollback snapshot remains available.

## Phase D: Keep the audit trail

- [x] Append one decision row for each fork, checkpoint, pivot, or revert.
- [x] Audit the trail against this run before handing back.

## Phase E: Verify and hand back

- [x] Run the deployment predicate against the real NAS artifacts.
- [x] Encode any recurring correction as a check or script.
- [x] Report verified and open gates, including the rollback path.

## Designed phases

- [x] D0 snapshot and baseline.
- [x] D1 native ARM64 image build and import.
- [x] D2 reversible Compose replacement with coturn.
- [x] D3 cross-machine authenticated Remote and TURN evidence.
- [x] D4 rollback or final health proof.

## Scope boundary

skip: Session, File, Terminal, Android business client, and Typert provider integration remain outside this deployment run.
skip: Production TLS certificate-chain, cross-NAT, UDP-blocked, and multi-node owner fencing remain unverified on this two-node no-TLS topology.
