/**
 * [INPUT]: 受管模型支持的输入模态。
 * [OUTPUT]: 对外提供 text/image 封闭枚举。
 * [POS]: model/domain 的模型能力契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

public enum ModelInputModality { TEXT, IMAGE }
