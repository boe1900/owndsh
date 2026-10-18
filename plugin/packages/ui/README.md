<!--
[INPUT]: 依赖官方 Client slots、平台本地 API 与 EnterpriseAccountStore 的实现边界。
[OUTPUT]: 提供只读账号设置、退出后 Server 编辑、访问门禁与跨会话响应隔离说明。
[POS]: @owndsh/ui 的公开语义入口，明确插件 UI 与官方 Web/Desktop 外壳的所有权边界。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# @owndsh/ui

Browser-side employee account and managed-plugin surface for the locked Harness Client runtime.
It registers the `OwnDsh 设置` page through the official `settings.section`
slot and the required access gate through `shell.overlay`. OwnDsh does not own or fork the
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

The OwnDsh Settings section contains Account, Skills and MCP tabs aligned with the
native DSH settings rhythm and keyboard navigation. Account information and
sign-out are available only in the Account tab; OwnDsh registers no sidebar footer
entry, leaving that space to Harness. Sign-out requires an in-page Harness
`Modal` and `Button` confirmation before clearing the session. Uninstall uses the same component;
Cancel and Escape leave the account unchanged. The dialog uses Host
theme and traps focus while open, without relying on a desktop
bridge for `window.confirm()`.
Account settings combine the user and login status in a compact summary above grouped,
left-aligned Server/device/version rows with small label icons. Host theme tokens and native
tabs/buttons keep this layout consistent with Harness. The Server address is read-only here;
sign out before editing it in the login gate. Authorization, enrollment and session restoration
hide the editor. Failed saves preserve the editor and its input. An explicitly labeled
configuration refresh shares a quiet footer with sign-out/uninstall. Manual refresh
shows a spinning icon and disables duplicate actions until the request settles,
then reports success or failure; Host error statuses also count as failures. Account values
stay on one line, truncate with an ellipsis, and expose the full
value on hover; the connection timestamp is omitted because authentication runs on demand.
Grouped surfaces pair Host background and border tokens to avoid transparent superellipse border artifacts.
When the account becomes blocked, the OwnDsh Settings section uses the official
slot's `close` callback so the login gate remains the active surface.
Plugin discovery and installation use the official DSH Plugins → Discover page.
OwnDsh supplies its standard market index URL after the account Server is configured.

The official Plugins page remains enabled and unchanged, including its free-form
“Add plugin” entry, details, configuration, switches and uninstall controls.
OwnDsh registers no replacement main/sidebar panel and maintains no fork.

The server exposes a DSH plugin market format 1 index behind the DSH Desktop
Bearer session; the local loopback proxy carries that in-memory credential. The local API has no
plugin install, remove or restart mutation routes.

Both official slot registrations share one `EnterpriseAccountStore`. Its browser API uses
only fixed same-origin `/enterprise/api/v1/local/*` paths, sends strict JSON for
Server, login, cancel, logout, uninstall, and explicit refresh actions. It reuses official
Host adapter/credential/settings events and connection reset notifications to read local
state; it creates no transport connection. A one-second status query runs only during
login/startup transitions, stops at a terminal state or unmount, and has a 330-second ceiling.
Opening Settings or pressing Refresh explicitly reloads bootstrap from the enterprise server.
Idle clients neither poll the enterprise server nor proactively renew credentials. It reloads account facts only on the first connected state or
a bootstrap revision change. Server/account changes and connected/disconnected transitions cancel
old account requests and discard their late results and errors. Runtime decoders project only account/device facts and reject unknown
status fields, including Token-shaped additions. Host Context and platform
credentials never enter React.
