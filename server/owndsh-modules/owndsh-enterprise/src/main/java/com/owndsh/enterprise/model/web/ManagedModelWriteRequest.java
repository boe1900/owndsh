/**
 * [INPUT]: 接收连接、上游模型标识、显示名、容量、输入模态、reasoning/compat 与排序。
 * [OUTPUT]: 对外提供 ManagedModelSpec 转换，alias 由后台生成。
 * [POS]: model/web 的模型写协议 DTO，状态只通过专用 action 修改。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;
import com.owndsh.enterprise.model.application.ManagedModelSpec;import com.owndsh.enterprise.model.domain.*;import tools.jackson.databind.JsonNode;import java.util.List;
public record ManagedModelWriteRequest(long connectionId,String modelId,String name,Integer contextWindow,Integer maxTokens,List<String> input,JsonNode reasoningEfforts,JsonNode compat,int sortOrder){
 public ManagedModelSpec spec(){return new ManagedModelSpec(connectionId,modelId,name,contextWindow,maxTokens,input==null?null:input.stream().map(v->ModelInputModality.valueOf(v.toUpperCase())).toList(),ModelReasoningEfforts.fromJson(reasoningEfforts),ModelReasoningCompat.fromJson(compat),sortOrder);}
}
