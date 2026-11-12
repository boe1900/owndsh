# native-runtime/

> L2 | 父级: ../CLAUDE.md

成员清单

package.json: 构建期官方 CLI 的精确版本入口，独立于 Console React 19 依赖树，生产只发布采集后的浏览器静态资源。
pnpm-lock.yaml: 固定官方 CLI 及全部传递依赖，供原生工作区资源构建复现。
pnpm-workspace.yaml: 隔离官方 CLI 的依赖安装，显式拒绝本功能不使用的原生生命周期脚本。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
