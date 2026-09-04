# plugin/artifact/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginArtifactException.java: 把不可信归档失败封闭为 INVALID 与 TOO_LARGE 两个稳定 HTTP 类别。
PluginArtifactInspector.java: 用 Commons Compress 单遍读取 tgz，拒绝路径逃逸、链接、设备文件、原生模块和不安全 package 元数据。
PluginArtifactStore.java: 有界写入 `.part`、整包 SHA-256、进程内加操作系统 hash 锁、同文件系统原子 CAS 移动与受控读取定位。
PluginManifestSigner.java: 从环境文本解析 Ed25519 PKCS#8 私钥，对固定签名声明执行 RFC 8785 JCS 后签名。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
