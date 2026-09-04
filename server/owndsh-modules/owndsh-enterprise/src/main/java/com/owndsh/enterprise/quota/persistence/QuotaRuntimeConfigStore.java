/**
 * [INPUT]: 接收 tenant 与部署要求的 IANA Zone ID。
 * [OUTPUT]: 对外提供首次写入或验证一致的 resolveZone，不暴露 update/delete。
 * [POS]: quota/application 的部署时区真源端口，阻止重启改变日/月计费边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import java.time.ZoneId;

public interface QuotaRuntimeConfigStore {
    ZoneId resolveZone(String tenantId, ZoneId configuredZone);
}
