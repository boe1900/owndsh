/**
 * [INPUT]: 依赖 PostgreSQL JDBC/事务、ID supplier、LOCAL 密码策略与一次性用户名/密码文件。
 * [OUTPUT]: 提供带 transaction advisory lock 的幂等管理员初始化；完成后只保留无 secret marker。
 * [POS]: deployment 的安全启动核心，角色绑定、用户创建和完成标记全成全败，重启不再读取 bootstrap secret。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.deployment;

import cn.hutool.crypto.digest.BCrypt;
import org.dromara.enterprise.auth.domain.LocalPasswordPolicy;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Objects;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

public final class DeploymentBootstrapService {
    static final String COMPLETED_MARKER = "BOOTSTRAP_ADMIN_COMPLETED";
    private static final long ADVISORY_LOCK_ID = 730_210_001L;
    private static final int MAX_PASSWORD_FILE_BYTES = 1024;
    private static final Pattern USERNAME = Pattern.compile("[A-Za-z][A-Za-z0-9._-]{2,29}");

    private final JdbcOperations jdbc;
    private final TransactionOperations transactions;
    private final LongSupplier ids;
    private final String username;
    private final Path passwordFile;

    public DeploymentBootstrapService(
        JdbcOperations jdbc,
        TransactionOperations transactions,
        LongSupplier ids,
        String username,
        Path passwordFile
    ) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.username = username;
        this.passwordFile = passwordFile;
    }

    public void initialize() {
        transactions.executeWithoutResult(status -> {
            jdbc.queryForObject("select pg_advisory_xact_lock(?)", Object.class, ADVISORY_LOCK_ID);
            if (markerExists()) return;

            String normalizedUsername = requireUsername(username);
            char[] password = readPassword(passwordFile);
            try {
                LocalPasswordPolicy.validate(normalizedUsername, password);
                createAdministrator(normalizedUsername, password);
            } finally {
                Arrays.fill(password, '\0');
            }
        });
    }

    private boolean markerExists() {
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from ent_deployment_state where state_key = ?)",
            Boolean.class,
            COMPLETED_MARKER
        );
        return Boolean.TRUE.equals(exists);
    }

    private void createAdministrator(String normalizedUsername, char[] password) {
        Boolean usernameExists = jdbc.queryForObject(
            "select exists(select 1 from sys_user where user_name = ? and del_flag = '0')",
            Boolean.class,
            normalizedUsername
        );
        if (Boolean.TRUE.equals(usernameExists)) {
            throw new IllegalStateException("bootstrap 管理员用户名已存在但部署尚未初始化");
        }
        Long departmentId = jdbc.queryForObject(
            "select dept_id from sys_dept where status = '0' and del_flag = '0' order by parent_id, order_num, dept_id limit 1",
            Long.class
        );
        Long roleId = jdbc.queryForObject(
            "select role_id from sys_role where role_key = 'enterprise_admin' and status = '0' and del_flag = '0'",
            Long.class
        );
        if (departmentId == null || roleId == null) {
            throw new IllegalStateException("bootstrap 所需部门或 enterprise_admin 角色不存在");
        }

        long userId = positiveId();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        String passwordHash = BCrypt.hashpw(new String(password));
        jdbc.update("""
            insert into sys_user(
                user_id, dept_id, user_name, nick_name, user_type, email, phone_number, gender,
                avatar, password, status, del_flag, login_ip, login_date, create_dept, create_by,
                create_time, update_by, update_time, remark, password_change_required
            ) values (?, ?, ?, ?, 'sys_user', '', '', '0', null, ?, '0', '0', '', null, ?, null,
                ?, null, null, 'Deployment bootstrap administrator', true)
            """, userId, departmentId, normalizedUsername, normalizedUsername, passwordHash, departmentId, now);
        jdbc.update("insert into sys_user_role(user_id, role_id) values (?, ?)", userId, roleId);
        jdbc.update("""
            insert into ent_deployment_state(state_key, state_value)
            values (?, jsonb_build_object('userId', ?, 'username', ?))
            """, COMPLETED_MARKER, userId, normalizedUsername);
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("bootstrap ID 必须为正数");
        return id;
    }

    private static String requireUsername(String value) {
        String normalized = value == null ? "" : value.trim();
        if (!USERNAME.matcher(normalized).matches()) {
            throw new IllegalStateException("ENT_BOOTSTRAP_ADMIN_USERNAME 必须为 3-30 位安全账号名");
        }
        return normalized;
    }

    private static char[] readPassword(Path path) {
        if (path == null) {
            throw new IllegalStateException("ENT_BOOTSTRAP_ADMIN_PASSWORD_FILE 必须配置");
        }
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new IllegalStateException("bootstrap 管理员密码文件不可读", exception);
        }
        try {
            if (bytes.length == 0 || bytes.length > MAX_PASSWORD_FILE_BYTES) {
                throw new IllegalStateException("bootstrap 管理员密码文件长度不合法");
            }
            CharBuffer decoded = decodeUtf8(bytes);
            char[] password = new char[decoded.remaining()];
            decoded.get(password);
            int length = password.length;
            while (length > 0 && (password[length - 1] == '\n' || password[length - 1] == '\r')) length--;
            if (length != password.length) {
                char[] trimmed = Arrays.copyOf(password, length);
                Arrays.fill(password, '\0');
                password = trimmed;
            }
            return password;
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    private static CharBuffer decodeUtf8(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes));
        } catch (CharacterCodingException exception) {
            throw new IllegalStateException("bootstrap 管理员密码文件必须是 UTF-8", exception);
        }
    }
}
