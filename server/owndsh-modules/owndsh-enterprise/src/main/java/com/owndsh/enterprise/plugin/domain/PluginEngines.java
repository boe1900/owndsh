/**
 * [INPUT]: 接收 DSH 版本兼容范围。
 * [OUTPUT]: 提供版本级 engines.dsh 值。
 * [POS]: plugin/domain 的运行时兼容性事实，缺省表示兼容任意 DSH。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Objects;
import java.util.regex.Pattern;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record PluginEngines(String dsh) {
    private static final String NUM = "(?:0|[1-9][0-9]*)";
    private static final String IDENT = "(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)";
    private static final String VERSION = NUM + "\\." + NUM + "\\." + NUM
        + "(?:-" + IDENT + "(?:\\." + IDENT + ")*)?"
        + "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";
    private static final Pattern RANGE_PART = Pattern.compile(
        "(?:<=|>=|<|>|=|~>|~|\\^)?(?:" + VERSION + "|(?:" + NUM + "|[xX*])"
            + "(?:\\.(?:" + NUM + "|[xX*])){0,2}|[xX*])"
    );
    private static final Pattern RANGE_VERSION = Pattern.compile(VERSION);
    private static final Pattern PARTIAL_VERSION = Pattern.compile(
        "(?:" + NUM + "|[xX*])(?:\\.(?:" + NUM + "|[xX*])){0,2}"
    );

    public PluginEngines {
        dsh = Objects.requireNonNullElse(dsh, "").trim();
        if (dsh.length() > 128 || dsh.chars().anyMatch(Character::isISOControl)
            || (!dsh.isEmpty() && !isSemverRange(dsh))) {
            throw new IllegalArgumentException("engines.dsh 非法");
        }
    }

    private static boolean isSemverRange(String value) {
        if (value.startsWith("workspace:")) return false;
        for (String alternative : value.split("\\|\\|", -1)) {
            String[] tokens = alternative.trim().split("\\s+");
            if (tokens.length == 1 && tokens[0].isEmpty()) return false;
            if (tokens.length == 3 && tokens[1].equals("-")
                && isPartialOrVersion(tokens[0]) && isPartialOrVersion(tokens[2])) continue;
            for (String token : tokens) {
                if (!RANGE_PART.matcher(token).matches()) return false;
            }
        }
        return true;
    }

    private static boolean isPartialOrVersion(String value) {
        return RANGE_VERSION.matcher(value).matches() || PARTIAL_VERSION.matcher(value).matches();
    }
}
