<!--
[INPUT]: 依赖官方 Client slots、平台本地 API 与 EnterpriseAccountStore 的实现边界。
[OUTPUT]: 提供只读账号设置、退出后 Server 编辑、访问门禁与跨会话响应隔离说明。
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
sign-out control. Both this control and the Account tab require the same in-page
Harness `Modal` and `Button` confirmation before clearing the session. Uninstall uses the same component;
Cancel and Escape leave the account and plugins unchanged. The dialog uses Host
theme and traps focus while open, without relying on a desktop
bridge for `window.confirm()`.
Account settings combine the user and login status in a compact summary above grouped,
left-aligned Server/device/version rows with small label icons. Host theme tokens and native
tabs/buttons keep this layout consistent with Harness. The Server address is read-only here;
sign out before editing it in the login gate. Authorization, enrollment and session restoration
hide the editor. Failed saves preserve the editor and its input. An explicitly labeled
configuration refresh shares a quiet footer with sign-out/uninstall. Account values
stay on one line, truncate with an ellipsis, and expose the full
value on hover; the connection timestamp is omitted because authentication runs on demand.
Grouped surfaces pair Host background and border tokens to avoid transparent superellipse border artifacts.
When the account becomes blocked, the OwnDsh Settings section uses the official
slot's `close` callback so the login gate remains the active surface.
The Settings Plugins tab directly contains search, package cards, an installed filter,
version details, explicit install/update actions, and confirmed uninstall. There is no
separate sidebar launcher or market overlay. On narrow screens, styles scoped to the
active OwnDsh section place the Host settings navigation in a horizontal row so content
remains usable. Detail and confirmation dialogs keep keyboard focus inside and restore
focus when closed; Escape leaves the surrounding Settings page open. Data and execution
belong to OwnDsh.
The fixed same-origin `/enterprise/api/v1/local/plugins` projection separates the catalog
from local installation facts. `/plugins/install` binds a package and version ID;
`/plugins/remove` removes a locally managed package. Opening or refreshing never installs
anything. New versions require a click, and uninstall survives refresh and restart.
Missing trust configuration and incompatible runtimes disable installation.
SHA-256, restart markers, tgz
paths, trust keys, CLI output, and platform credentials are validated or removed
before the snapshot reaches React.

V1 does not expose or automatically call Session synchronization. Its strict
browser decoders and presentation source remain dormant for a later release.

All three official slot registrations share one `EnterpriseAccountStore`. Its browser API uses
only fixed same-origin `/enterprise/api/v1/local/*` paths, sends strict JSON for
Server, login, cancel, logout, uninstall, and explicit refresh actions. It reuses official
Host adapter/credential/settings events and connection reset notifications to read local
state; it creates no transport connection. A one-second status query runs only during
login/startup transitions, stops at a terminal state or unmount, and has a 330-second ceiling.
Opening Settings or pressing Refresh explicitly reloads bootstrap from the enterprise server.
Idle clients neither poll the enterprise server nor proactively renew credentials. It reloads account and plugin facts only on the first connected state or
a bootstrap revision change. Server/account changes and connected/disconnected transitions cancel
old account, plugin and Session requests and discard their late results and errors. Runtime decoders project only account/device facts and reject unknown
status fields, including Token-shaped additions. Host Context and platform
credentials never enter React.

Harness deliberately does not expose a public API for a footer action to open
an arbitrary settings section. The account row therefore does not imitate a
Settings shortcut through DOM access; the normal Settings navigation owns the
OwnDsh page.
