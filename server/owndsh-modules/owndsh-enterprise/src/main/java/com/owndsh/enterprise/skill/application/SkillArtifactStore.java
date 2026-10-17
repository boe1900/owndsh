/**
 * [INPUT]: 接收已通过 SkillArchiveValidator 的不可变 ZIP 和 SHA-256。
 * [OUTPUT]: 提供制品幂等保存与受控读取端口。
 * [POS]: skill/application 的存储 DIP；员工端永远通过 OwnDsh 授权接口读取。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.io.IOException;
import java.io.InputStream;

public interface SkillArtifactStore {
    void putIfAbsent(String sha256, byte[] artifact);

    default void putIfAbsent(String sha256, byte[] artifact, ArtifactCoordinate coordinate) {
        putIfAbsent(sha256, artifact);
    }

    default String provider() {
        return "FILESYSTEM";
    }

    default String artifactRef(ArtifactCoordinate coordinate, String sha256) {
        return sha256 + ".zip";
    }

    InputStream open(String sha256) throws IOException;

    default InputStream open(String sha256, String artifactRef) throws IOException {
        return open(sha256);
    }

    long size(String sha256) throws IOException;

    default long size(String sha256, String artifactRef) throws IOException {
        return size(sha256);
    }

    record ArtifactCoordinate(String skillName, String skillVersion, String resolvedCommit) {
        public ArtifactCoordinate {
            if (skillName == null || skillName.isBlank() || skillVersion == null || skillVersion.isBlank()
                || resolvedCommit == null || resolvedCommit.isBlank()) {
                throw new IllegalArgumentException("skill artifact 坐标不完整");
            }
        }

        public String packageName() {
            return "owndsh-skill-" + skillName;
        }

        public String packageVersion() {
            return skillVersion + "--" + resolvedCommit;
        }

        public String path() {
            return packageName() + "/" + packageVersion() + "/skill.zip";
        }
    }
}
