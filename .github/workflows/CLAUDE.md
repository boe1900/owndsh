# workflows/

> L2 | 父级: ../CLAUDE.md

成员清单

release.yml: PR 验证 Linux amd64/arm64 前后端镜像并保留插件 tgz；push 使用 GITHUB_TOKEN 和 ALIYUN_REGISTRY_USERNAME/ALIYUN_REGISTRY_PASSWORD Secrets，将每个镜像的一次构建同时发布 GHCR/阿里云 ACR，以 oci-artifact=false 保留兼容格式的构建来源证明，main 更新 `next`，版本标签通过 npm Trusted Publishing 将同一 tgz 发布为 stable `latest` 或预发布 `next`，全程不持有 npm 长期 Token。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
