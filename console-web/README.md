# Product Console

第二阶段产品控制台是独立 Vite SPA，不依赖 `admin-web/` 的 Umi、Ant Design 或动态菜单。

产品壳直接派生自 Beautiful UI Harness commit `3ea4c18114de3d4bc9b63b8e3ea6f533b1a562bd`，只删除聊天演示能力并替换为企业产品路由。许可证见 `BEAUTIFUL_UI_LICENSE`。

```sh
pnpm install
pnpm check
pnpm dev
```

OpenAPI 客户端由 `../contracts/enterprise-openapi.yaml` 生成；不要手改 `src/api/generated/`。
