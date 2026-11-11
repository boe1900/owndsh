# [INPUT]: 依赖 NAS 已有的同提交 glibc 镜像；Node 与官方 Harness 由验收器只读或持久挂载。
# [OUTPUT]: 提供具有 passwd/group 记录和 bash 登录 shell 的非 root NAS DSH 运行账号。
# [POS]: NAS 双机验收的环境层；避免官方终端 os.userInfo() 因裸 UID 缺失而失败。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
FROM registry.cn-hangzhou.aliyuncs.com/cola1900/owndsh-server:sha-663c43e
USER root
RUN groupadd --gid 1001 dsh \
    && useradd --uid 1000 --gid 1001 --home-dir /data/home --shell /bin/bash dsh
ENV HOME=/data/home SHELL=/bin/bash
USER 1000:1001
