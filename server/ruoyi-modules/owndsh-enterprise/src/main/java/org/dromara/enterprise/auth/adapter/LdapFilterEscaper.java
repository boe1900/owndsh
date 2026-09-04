/**
 * [INPUT]: 接收未经信任的 LDAP 用户名字符序列。
 * [OUTPUT]: 对外提供 RFC 4515 filter assertion value 转义。
 * [POS]: LDAP adapter 的注入防线，禁止用字符串拼接直接替换 userFilter 占位符。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import java.nio.charset.StandardCharsets;
import java.util.Objects;

/**
 * RFC 4515 LDAP filter 值转义器。
 */
public final class LdapFilterEscaper {
    private LdapFilterEscaper() {
    }

    public static String escape(String value) {
        Objects.requireNonNull(value, "value");
        StringBuilder escaped = new StringBuilder(value.length());
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        for (byte current : bytes) {
            int unsigned = current & 0xff;
            if (unsigned == 0 || unsigned == '(' || unsigned == ')' || unsigned == '*' || unsigned == '\\'
                || unsigned < 0x20 || unsigned >= 0x7f) {
                escaped.append('\\');
                escaped.append(Character.forDigit((unsigned >>> 4) & 0xf, 16));
                escaped.append(Character.forDigit(unsigned & 0xf, 16));
            } else {
                escaped.append((char) unsigned);
            }
        }
        return escaped.toString();
    }
}
