# @enterprise-agent/dsh-ui

Browser-side employee account surface for the locked Harness Client runtime.
It registers the `enterprise` page through the official `settings.section`
slot, a compact connection indicator through `sidebar.footer.action`, and the
required sign-in step through `settings.onboarding`.

All three surfaces share one `EnterpriseAccountStore`. Its browser API uses
only fixed same-origin `/enterprise/api/v1/local/*` paths, sends `{}` for login,
cancel, and logout actions, and follows status changes through the Host's SSE
route. Runtime decoders project only account/device facts and reject unknown
status fields, including Token-shaped additions. Host Context and platform
credentials never enter React.

Harness deliberately does not expose a public API for a footer action to open
an arbitrary settings section. The footer therefore refreshes status; the
normal Settings navigation owns the Enterprise page, while onboarding uses its
official `openSection('enterprise')` owner callback.
