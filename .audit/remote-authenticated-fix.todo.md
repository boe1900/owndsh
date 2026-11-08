# Authenticated Remote logout fix

- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives.
- [x] Plan the fix. If it crosses a function boundary, `architect` first.
- [x] Verify on the same surface. The original repro now passes.
- [ ] Stage the commits so the failing repro lands before the fix in git history.
- [ ] Run **Opening a PR**.

Task units:

- [x] Reproduce authenticated logout after device revoke.
- [x] Sketch and choose the smallest stable exception boundary.
- [x] Add a focused regression assertion.
- [x] Rebuild and rerun the real account lifecycle.
- [x] Update the audit trail and GEB maps.
- [x] Run diff and quality checks.

skip: The shared worktree already contains the Remote implementation, so the failing repro cannot be isolated into a new history sequence without rewriting unrelated work.
skip: Opening a PR is not requested; leave the shared worktree changes reviewable and uncommitted.
