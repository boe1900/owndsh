/**
 * [INPUT]: 依赖 EnterpriseSessionProperties 的无配置构造路径。
 * [OUTPUT]: 验证 Server 单批与 Harness bundle 共享 1 MiB 冻结默认值。
 * [POS]: session 的配置漂移门禁，字节内容验证继续由 SessionBatchParserTest 承担。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class EnterpriseSessionPropertiesTest {
    @Test
    void defaultsBatchLimitToOneMebibyte() {
        assertThat(new EnterpriseSessionProperties().getMaxBatchBytes()).isEqualTo(1_048_576);
    }
}
