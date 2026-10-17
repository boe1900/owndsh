/**
 * [INPUT]: 不接收服务端制品字节；runtime 通过固定公开源码坐标回源。
 * [OUTPUT]: 声明 SOURCE_ARCHIVE provider，使导入流程跳过服务端持久化。
 * [POS]: skill/application 的无存储 adapter；实际下载与校验由 runtime controller 完成。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.io.IOException;
import java.io.InputStream;

public final class SourceArchiveSkillArtifactStore implements SkillArtifactStore {
    @Override
    public void putIfAbsent(String sha256, byte[] artifact) {
        throw new UnsupportedOperationException("SOURCE_ARCHIVE 不保存服务端制品");
    }

    @Override
    public String provider() {
        return "SOURCE_ARCHIVE";
    }

    @Override
    public InputStream open(String sha256) throws IOException {
        throw new IOException("SOURCE_ARCHIVE 不支持直接打开制品");
    }

    @Override
    public long size(String sha256) throws IOException {
        throw new IOException("SOURCE_ARCHIVE 不支持直接查询制品长度");
    }
}
