<!--
[INPUT]: 依赖官方 Client slots、平台本地 API 与 EnterpriseAccountStore 的实现边界。
[OUTPUT]: 提供 Server 配置、访问门禁、账号/插件界面和浏览器安全约束说明。
[POS]: @owndsh/ui 的公开语义入口，明确插件 UI 与官方 Web/Desktop 外壳的所有权边界。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# @owndsh/ui

Browser-side employee account and managed-plugin surface for the locked Harness Client runtime.
It registers the `OwnDsh 设置` page through the official `settings.section`
slot, an account entry through `sidebar.footer.action`, and the
required access gate through `shell.overlay`. OwnDsh does not own or fork the
surrounding Web/Desktop UI.

The access gate is shown during startup and whenever the connection is not
`READY`/`REFRESHING`. A fresh install asks only for the OwnDsh Server origin,
persists it through the Host's official settings service, and then starts the
existing browser PKCE flow. Sign-out, session expiry, device revocation, and a
Server change restore the gate. Explicit uninstall removes OwnDsh and its
managed plugins; Desktop requests an official restart and Web asks the user to
restart Harness. The gate owns the keyboard focus cycle while visible, so Tab
navigation cannot reach the official shell underneath. Its brand, single-line
Server editor, connection strip, and version use Host theme tokens; Desktop
chrome and theme controls remain owned by the surrounding official shell.

The OwnDsh Settings section contains Account and Plugins tabs aligned with the
native DSH Plugins tab rhythm and keyboard navigation. The sidebar footer uses
the embedded OwnDsh whale at the native Settings icon size, matches its row
height and hover, shows the employee display name, and provides a muted direct
sign-out control. Both this control and the Account tab require the same native
confirmation before clearing the session.
The Plugins tab reads only the fixed same-origin `/enterprise/api/v1/local/plugins`
projection and shows package, local version, desired revision/state, lifecycle,
restart requirement, and stable failure codes. SHA-256, restart markers, tgz
paths, trust keys, CLI output, and platform credentials are validated or removed
before the snapshot reaches React.

V1 does not expose or automatically call Session synchronization. Its strict
browser decoders and presentation source remain dormant for a later release.

All three official slot surfaces share one `EnterpriseAccountStore`. Its browser API uses
only fixed same-origin `/enterprise/api/v1/local/*` paths, sends strict JSON for
Server, login, cancel, logout, and uninstall actions, and follows status changes
through the Host's SSE route. It reloads account and plugin facts only on the first connected state or
a bootstrap revision change. Runtime decoders project only account/device facts and reject unknown
status fields, including Token-shaped additions. Host Context and platform
credentials never enter React.

Harness deliberately does not expose a public API for a footer action to open
an arbitrary settings section. The account row therefore does not imitate a
Settings shortcut through DOM access; the normal Settings navigation owns the
OwnDsh page.
