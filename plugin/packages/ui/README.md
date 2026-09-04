# @owndsh/ui

Browser-side employee account and managed-plugin surface for the locked Harness Client runtime.
It registers the `enterprise` page through the official `settings.section`
slot, a compact connection indicator through `sidebar.footer.action`, and the
required sign-in step through `settings.onboarding`.

The Enterprise Settings section contains Account and Plugins tabs aligned with
the native DSH Plugins tab rhythm and keyboard navigation. The sidebar footer
keeps a fixed enterprise glyph and shows connection state as trailing text.
The Plugins tab reads only the fixed same-origin `/enterprise/api/v1/local/plugins`
projection and shows package, local version, desired revision/state, lifecycle,
restart requirement, and stable failure codes. SHA-256, restart markers, tgz
paths, trust keys, CLI output, and platform credentials are validated or removed
before the snapshot reaches React.

V1 does not expose or automatically call Session synchronization. Its strict
browser decoders and presentation source remain dormant for a later release.

All three official slot surfaces share one `EnterpriseAccountStore`. Its browser API uses
only fixed same-origin `/enterprise/api/v1/local/*` paths, sends `{}` for login,
cancel, and logout actions, and follows status changes through the Host's SSE
route. It reloads account and plugin facts only on the first connected state or
a bootstrap revision change. Runtime decoders project only account/device facts and reject unknown
status fields, including Token-shaped additions. Host Context and platform
credentials never enter React.

Harness deliberately does not expose a public API for a footer action to open
an arbitrary settings section. The footer therefore refreshes status; the
normal Settings navigation owns the Enterprise page, while onboarding uses its
official `openSection('enterprise')` owner callback.
