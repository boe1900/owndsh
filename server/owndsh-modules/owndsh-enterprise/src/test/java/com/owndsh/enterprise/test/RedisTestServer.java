/**
 * [INPUT]: 依赖 Docker、redis:8-alpine、Testcontainers GenericContainer 与 Redisson 4.6.1。
 * [OUTPUT]: 为测试提供共享真实 Redis 容器和隔离 RedissonClient。
 * [POS]: T05 Redis 集成测试基础设施，禁止用 Map/fake 模拟 TTL、GETDEL 或并发原子性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.test;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

public final class RedisTestServer {
    private static final GenericContainer<?> REDIS = new GenericContainer<>(
        DockerImageName.parse("redis:8-alpine")
    ).withExposedPorts(6379);

    static {
        REDIS.start();
    }

    private RedisTestServer() {
    }

    public static RedissonClient client() {
        Config config = new Config();
        config.useSingleServer().setAddress(
            "redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379)
        );
        return Redisson.create(config);
    }
}
