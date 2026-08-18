/**
 * [INPUT]: 依赖秘密所属 tenant、表、记录、字段与 key version 的稳定标识。
 * [OUTPUT]: 对外提供不可歧义的 AES-GCM AAD 编码。
 * [POS]: crypto 模块的数据绑定契约，阻止密文跨 tenant、表、记录或字段搬用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.crypto;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * AES-GCM 附加认证数据。
 *
 * @param tenantId tenant 标识
 * @param table    数据库表名
 * @param id       记录标识
 * @param field    密文字段名
 * @param keyVersion 密钥版本
 */
public record SecretAad(String tenantId, String table, String id, String field, int keyVersion) {
    private static final Pattern SQL_IDENTIFIER = Pattern.compile("[a-z][a-z0-9_]*");

    public SecretAad {
        requireSegment(tenantId, "tenantId");
        requireSegment(id, "id");
        if (!SQL_IDENTIFIER.matcher(Objects.requireNonNull(table, "table")).matches()) {
            throw new IllegalArgumentException("table 必须是小写 SQL 标识符");
        }
        if (!SQL_IDENTIFIER.matcher(Objects.requireNonNull(field, "field")).matches()) {
            throw new IllegalArgumentException("field 必须是小写 SQL 标识符");
        }
        if (keyVersion != SecretCipher.KEY_VERSION) {
            throw new IllegalArgumentException("MVP 只支持 key version 1");
        }
    }

    /**
     * 按冻结格式编码 AAD。
     *
     * @return UTF-8 编码的 tenant_id:table:id:field:key_version
     */
    public byte[] encoded() {
        return String.join(":", tenantId, table, id, field, Integer.toString(keyVersion))
            .getBytes(StandardCharsets.UTF_8);
    }

    private static void requireSegment(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.indexOf(':') >= 0) {
            throw new IllegalArgumentException(name + " 不能为空或包含冒号");
        }
    }
}
