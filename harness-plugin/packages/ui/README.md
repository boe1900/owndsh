# @enterprise-agent/dsh-ui

Browser-side employee account and managed-plugin surface for the locked Harness Client runtime.
It registers the `enterprise` page through the official `settings.section`
slot, a compact connection indicator through `sidebar.footer.action`, and the
required sign-in step through `settings.onboarding`.

The Enterprise Settings section contains compact Account, Plugins, and Session
Sync tabs. The Plugins tab reads only the fixed same-origin `/enterprise/api/v1/local/plugins`
projection and shows package, local version, desired revision/state, lifecycle,
restart requirement, and stable failure codes. SHA-256, restart markers, tgz
paths, trust keys, CLI output, and platform credentials are validated or removed
before the snapshot reaches React.

The Session Sync tab projects eleven stable cursor states, pending/last-success
summary, remote cursor pages, and source-device metadata. Restore requires an
explicit existing target directory and reports the new local Session ID; delete
uses an inline second confirmation and changes the local state to `DELETED` with
the explicit promise that it will not be uploaded again. Browser decoders reject
unknown fields and canonical Base64/JSONL violations, and never retain headers,
titles from export payloads, events, rolling hashes, or credentials.

All three official slot surfaces share one `EnterpriseAccountStore`. Its browser API uses
only fixed same-origin `/enterprise/api/v1/local/*` paths, sends `{}` for login,
cancel, and logout actions, and follows status changes through the Host's SSE
route. Runtime decoders project only account/device facts and reject unknown
status fields, including Token-shaped additions. Host Context and platform
credentials never enter React.

Harness deliberately does not expose a public API for a footer action to open
an arbitrary settings section. The footer therefore refreshes status; the
normal Settings navigation owns the Enterprise page, while onboarding uses its
official `openSection('enterprise')` owner callback.
