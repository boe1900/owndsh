# lib/

> L2 | 父级: ../CLAUDE.md

成员清单

crypto.ts: 以 HTTP/HTTPS 均可用的 getRandomValues 生成 UUID v4，供产品写操作统一生成幂等键。
crypto.test.ts: 固定随机字节验证 UUID v4 版本、变体位及编码，锁定无 randomUUID 的 HTTP 兼容性。
meta.ts: Beautiful UI 组件目录、变体、内部依赖和 npm 依赖元数据。
registry.tsx: 把组件元数据绑定到真实 React demo 的画廊注册表。
utils.ts: 基于 clsx 与 tailwind-merge 的 className 合并函数。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
