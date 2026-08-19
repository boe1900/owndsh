/**
 * [INPUT]: 接收协议冻结的 Harness commit 集合、企业 bundle SemVer range 与 OS 集合。
 * [OUTPUT]: 对外提供排序去重、不可变且可直接进入 JCS 声明的 compatibility 值对象。
 * [POS]: plugin/domain 的兼容性真源，明确拒绝把 Git commit 当作可排序版本范围。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.domain;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public record PluginCompatibility(
    List<String> harnessCommits,
    String enterpriseBundleRange,
    List<String> operatingSystems
) {
    public static final String LOCKED_HARNESS_COMMIT = "99f6f02fecdb7dff40c3fbc9470f5907c29f74ca";
    private static final Pattern COMMIT = Pattern.compile("^[0-9a-f]{40}$");
    private static final Set<String> OPERATING_SYSTEMS = Set.of("darwin", "linux", "win32");

    public PluginCompatibility {
        Objects.requireNonNull(harnessCommits, "harnessCommits");
        Objects.requireNonNull(operatingSystems, "operatingSystems");
        if (harnessCommits.isEmpty() || harnessCommits.size() > 20
            || harnessCommits.stream().anyMatch(value -> value == null || !COMMIT.matcher(value).matches())) {
            throw new IllegalArgumentException("harnessCommits 非法");
        }
        harnessCommits = harnessCommits.stream().distinct().sorted().toList();
        if (!harnessCommits.contains(LOCKED_HARNESS_COMMIT)) {
            throw new IllegalArgumentException("compatibility 必须包含锁定 Harness commit");
        }
        enterpriseBundleRange = requireText(enterpriseBundleRange, "enterpriseBundleRange", 120);
        if (operatingSystems.isEmpty() || operatingSystems.size() > OPERATING_SYSTEMS.size()
            || operatingSystems.stream().anyMatch(value -> !OPERATING_SYSTEMS.contains(value))) {
            throw new IllegalArgumentException("operatingSystems 非法");
        }
        operatingSystems = operatingSystems.stream().distinct().sorted().toList();
    }

    private static String requireText(String value, String name, int maxLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maxLength || value.indexOf('\0') >= 0) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return value;
    }
}
