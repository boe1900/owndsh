# @enterprise-agent/dsh-platform-client

Enterprise Host control-plane primitives. T01 provides the PKCE S256 loopback
transaction and the same-origin local HTTP route registry used by the Client
bundle. Platform tokens remain a future T06 concern and never cross this API.

The package consumes only Cordis' public `Context` shape. Its Web route port is
structural because the locked Harness does not publish the Host Web server
types as a standalone npm package; runtime registration still uses the official
`ctx.webServer.register()` service.
