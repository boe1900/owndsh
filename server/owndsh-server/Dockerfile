# [INPUT]: 依赖已构建的 owndsh-server.jar 与 BellSoft Java 21 运行时镜像。
# [OUTPUT]: 提供通用 OwnDsh Server 容器入口；正式离线交付使用 deploy/compose/Dockerfile.server。
# [POS]: owndsh-server 模块级便捷镜像定义，不拥有生产 Compose 拓扑。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

# 贝尔实验室 Spring 官方推荐镜像 JDK下载地址 https://bell-sw.com/pages/downloads/
FROM bellsoft/liberica-openjdk-rocky:21.0.12-cds
# FROM bellsoft/liberica-openjdk-rocky:25.0.4-cds
# FROM findepi/graalvm:java21-native

LABEL org.opencontainers.image.title="OwnDsh Server"

RUN mkdir -p /owndsh/server/logs \
    /owndsh/server/temp

WORKDIR /owndsh/server

ENV SERVER_PORT=8080 LANG=C.UTF-8 LC_ALL=C.UTF-8 JAVA_OPTS=""

EXPOSE ${SERVER_PORT}

ADD ./target/owndsh-server.jar ./app.jar

SHELL ["/bin/bash", "-c"]

ENTRYPOINT java -Djava.security.egd=file:/dev/./urandom -Dserver.port=${SERVER_PORT} \
           -XX:+HeapDumpOnOutOfMemoryError -XX:+UseZGC ${JAVA_OPTS} -jar app.jar
