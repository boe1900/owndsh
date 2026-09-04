/**
 * [INPUT]: 接收 tenant 与客户端期望的 BOOTSTRAP revision。
 * [OUTPUT]: 对外提供 current 查询、无条件原子 increment 和单步 compare-and-increment 端口。
 * [POS]: revision Application Service 依赖的 DIP 抽象，隐藏 PostgreSQL SQL 细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.revision;

/**
 * BOOTSTRAP revision 存储端口。
 */
public interface BootstrapRevisionStore {
    /**
     * 读取当前 revision。
     *
     * @param tenantId tenant 标识
     * @return 当前 revision
     */
    long current(String tenantId);

    /**
     * 原子递增并返回新的全局 revision，不把无关资源并发暴露为客户端冲突。
     *
     * @param tenantId tenant 标识
     * @return 递增后的 revision
     */
    long increment(String tenantId);

    /**
     * 仅当 current 等于 expected 时原子递增 1。
     *
     * @param tenantId tenant 标识
     * @param expectedRevision 调用方期望值
     * @return 递增后的 revision
     * @throws RevisionConflictException 期望值已经过期
     */
    long compareAndIncrement(String tenantId, long expectedRevision);
}
