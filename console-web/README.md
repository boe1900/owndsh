# Product Console

第二阶段产品控制台是独立 Vite SPA，不依赖 `admin-web/` 的 Umi、Ant Design 或动态菜单。

```sh
pnpm install
pnpm check
pnpm dev
```

OpenAPI 客户端由 `../contracts/enterprise-openapi.yaml` 生成；不要手改 `src/api/generated/`。
