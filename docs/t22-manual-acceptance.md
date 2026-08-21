# T22 人工功能验收

状态：`in_progress`

## 决策

T22 不再维护三设备控制面、假浏览器 opener、候选 OIDC/LDAP/DeepSeek fixture、14 步 Playwright 总编排、自动截图/GIF 或人工等待超时。它们把发布证明、破坏性业务场景和本地体验混在同一环境，既消耗大量执行时间，也会把已经撤销或删除过的数据留给人工检查。

产品模块已有的单元测试、协议漂移检查和真实 package consumer 保留；这些检查聚焦、可重复，并能在修改对应模块时单独运行。T22 的产品体验结论只由人工逐项确认，发现问题后先优化当前功能，再进入下一项。

## 启动

```sh
./scripts/local-demo.sh
```

脚本顺序启动一套正式 release 后端，再把 release 内的企业 bundle 安装到一个隔离 `web` profile 并启动 Harness。它不会运行 Playwright 或自动操作业务数据，也没有时间限制；保持终端运行即可持续测试，按 `Ctrl+C` 后删除本次临时容器、卷和状态。

已有 release 时可跳过重新构建：

```sh
EAP_LOCAL_RELEASE_TARBALL=/absolute/path/enterprise-agent-platform-0.1.0-linux-amd64.tgz \
  ./scripts/local-demo.sh
```

启动完成后终端会输出管理端、Harness、LOCAL 初始账号和首次改密密码。平台使用临时自签 CA，浏览器首次访问需要手工接受；Harness 登录按钮使用真实系统 `open`，不会截获授权地址。

## 验收顺序

- [ ] 启动：管理端健康，Harness 页面可打开，只有一个本地 Harness 实例。
- [ ] 登录：点击“登录企业账号”后系统浏览器自动打开；错误账号、密码或验证码应留在登录页提示并刷新验证码；使用 LOCAL 账号完成首次改密后 Harness 回到 `READY`。
- [ ] 身份与设备：管理端能看到当前用户和 ACTIVE 设备；身份源配置、测试和组映射符合预期。
- [ ] 模型与配额：手工配置 provider、模型、授权和配额；Harness 能发现并调用已授权模型，未授权与超额提示准确。
- [ ] 插件：手工上传实际待验证插件，完成发布、分配、安装、重启确认和回滚，员工页状态与真实 Loader 一致。
- [ ] Session：创建会话，确认同步状态；第二个独立人工环境需要时再启动，用于恢复、继续和删除验证。
- [ ] 审计与撤销：按 requestId 查询调用链；撤销设备后该设备失效，其他设备继续可用；删除 Session 后不自动重传。

每次只验证一项并记录实际问题。T22 在全部人工项确认前保持 `in_progress`，不启动 T23。

## 当前记录

- 2026-08-21：错误验证码已改为留在登录页提示并刷新验证码；JSON 客户端仍返回稳定的 `401 ENT_AUTH_REQUIRED`。
- 2026-08-21：人工重试验证码暴露出 Alpine/musl Temurin 的图片生成在 `libawt.so` 触发 `SIGILL`，Gateway 随后返回 502。仅增加可写 Fontconfig 缓存后第 6 次请求仍崩溃；同版 Java 21.0.8 切换到官方 Jammy/glibc JRE 后连续 100 次验证码请求全部返回 200，Server 无重启且无原生错误。Compose 同时将缓存指向已有 `/tmp` tmpfs；保留验证码，不改变认证协议。

## 品味自检

- 本地入口只做后端安装、bundle 安装和 Harness 启动，不拥有业务验收逻辑。
- 自动测试仍留在各自模块，不再由一个总脚本重复串行调用。
- 人工环境与同级 Harness checkout 隔离；退出后再次校验锁定 commit 和工作区清洁。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
