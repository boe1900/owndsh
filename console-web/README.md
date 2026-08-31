# Product Console

第二阶段产品控制台是独立 Vite SPA，不依赖 `admin-web/` 的 Umi、Ant Design 或动态菜单。

产品壳与 `/examples` 直接迁移自 Beautiful UI Harness commit `3ea4c18114de3d4bc9b63b8e3ea6f533b1a562bd`。上游 Next.js 运行时改为 Vite/TanStack，Central Icons 改为 Lucide，并移除 PostHog；其余组件源码与完整 Harness 保留为可执行参考。版本锁见 `../upstream/beautiful-ui.lock.json`，许可证见 `BEAUTIFUL_UI_LICENSE`。

```sh
pnpm install
pnpm check
pnpm dev
```

产品入口为 `/`，组件参考为 `/examples`，完整 Harness 为 `/examples/harness`。

OpenAPI 客户端由 `../contracts/enterprise-openapi.yaml` 生成；不要手改 `src/api/generated/`。
