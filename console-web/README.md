# Product Console

第二阶段产品控制台是独立 Vite SPA，不依赖 `admin-web/` 的 Umi、Ant Design 或动态菜单。

产品壳与 `/examples` 直接迁移自 Beautiful UI Harness commit `3ea4c18114de3d4bc9b63b8e3ea6f533b1a562bd`。上游 Next.js 运行时改为 Vite/TanStack，Central Icons 改为 Lucide，并移除 PostHog；其余组件源码与完整 Harness 保留为可执行参考。版本锁见 `../upstream/beautiful-ui.lock.json`，许可证见 `BEAUTIFUL_UI_LICENSE`。

```sh
pnpm install
pnpm check
pnpm dev
```

产品入口为 `/`，登录入口为 `/login`，组件参考为 `/examples`，完整 Harness 为 `/examples/harness`。本地开发将 `/enterprise` 与 `/healthz` 代理到 `CONSOLE_API_ORIGIN`，缺省为本机 EAP TLS 入口 `https://127.0.0.1:62207`；自定义目标仍通过该环境变量覆盖。`62209` 只承担 UI/HMR，完整 PKCE 必须通过注册的 `https://127.0.0.1:62207/enterprise/auth/callback` 同源 Gateway 构建验收；不要为开发端口放宽 HTTPS 或 redirect allowlist。

OpenAPI 客户端由 `../contracts/enterprise-openapi.yaml` 生成；不要手改 `src/api/generated/`。
