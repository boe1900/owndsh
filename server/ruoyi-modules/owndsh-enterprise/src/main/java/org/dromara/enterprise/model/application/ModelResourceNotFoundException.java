/**
 * [INPUT]: 由模型纵向 service 在 tenant 内资源查询失败时创建。
 * [OUTPUT]: 对外提供无敏感字段的模型资源不存在异常类型。
 * [POS]: model/application 到统一 HTTP 404 映射的稳定信号。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

public final class ModelResourceNotFoundException extends RuntimeException {
    public ModelResourceNotFoundException() {
        super("model resource not found");
    }
}
