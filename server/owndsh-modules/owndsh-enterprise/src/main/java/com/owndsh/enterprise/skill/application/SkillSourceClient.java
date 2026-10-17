/**
 * [INPUT]: 接收公开 GitLab/GitHub 仓库地址、固定 ref 和 skill 子路径。
 * [OUTPUT]: 提供解析后的不可变 commit 与受限 ZIP 字节。
 * [POS]: skill/application 的源码导入端口；不向员工端暴露仓库访问能力或凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.util.Objects;

public interface SkillSourceClient {
    java.util.regex.Pattern COMMIT = java.util.regex.Pattern.compile("^[0-9a-f]{7,64}$");

    FetchedArchive fetch(Source source);

    record Source(String repositoryUrl, String revision, String subpath) {
        public Source {
            if (repositoryUrl == null || repositoryUrl.isBlank() || revision == null || revision.isBlank()) {
                throw new IllegalArgumentException("skill source 地址和 revision 不能为空");
            }
            subpath = subpath == null ? "" : subpath.trim();
        }
    }

    record FetchedArchive(String resolvedCommit, byte[] archive) {
        public FetchedArchive {
            Objects.requireNonNull(resolvedCommit, "resolvedCommit");
            if (!COMMIT.matcher(resolvedCommit).matches()) throw new IllegalArgumentException("resolvedCommit 非法");
            Objects.requireNonNull(archive, "archive");
            if (archive.length == 0) throw new IllegalArgumentException("archive 不能为空");
            archive = archive.clone();
        }

        @Override
        public byte[] archive() {
            return archive.clone();
        }
    }
}
