/**
 * [INPUT]: 投影 ModelProvider 的供应商元信息。
 * [OUTPUT]: 对外提供不含连接 endpoint 和 credential 的 provider 响应 DTO。
 * [POS]: model/web 的 provider 输出边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;
import com.owndsh.enterprise.model.domain.*;
public record ProviderView(String id,String providerKey,String name,String description,ModelStatus status,long revision){
 public static ProviderView from(ModelProvider p){return new ProviderView(Long.toString(p.id()),p.providerKey(),p.name(),p.description(),p.status(),p.revision());}
}
