/**
 * [INPUT]: 投影 ManagedModel 的连接、供应商、模型能力与状态事实。
 * [OUTPUT]: 对外提供模型管理响应 DTO。
 * [POS]: model/web 的模型输出边界，不暴露 endpoint 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;
import com.fasterxml.jackson.annotation.JsonInclude;import com.owndsh.enterprise.model.domain.*;import java.util.List;
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ManagedModelView(String id,String providerId,String connectionId,String providerName,String alias,String modelId,String name,Integer contextWindow,Integer maxTokens,List<String> input,Object reasoningEfforts,Object compat,int sortOrder,ModelStatus status,long revision){
 public static ManagedModelView from(ManagedModel m){return new ManagedModelView(Long.toString(m.id()),Long.toString(m.providerId()),Long.toString(m.connectionId()),m.providerName(),m.alias(),m.modelId(),m.name(),m.contextWindow(),m.maxTokens(),m.input().stream().map(v->v.name().toLowerCase()).toList(),m.reasoningEfforts()==null?null:m.reasoningEfforts().jsonValue(),m.reasoningCompat()==null?null:m.reasoningCompat().jsonValue(),m.sortOrder(),m.status(),m.revision());}
}
