/**
 * [INPUT]: 投影 ProviderConnection 的 endpoint、协议、超时和脱敏状态。
 * [OUTPUT]: 对外提供连接管理响应 DTO。
 * [POS]: model/web 的连接输出边界，credential 永不序列化。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;
import com.owndsh.enterprise.model.domain.*;import java.net.URI;
public record ProviderConnectionView(String id,String providerId,String providerName,String name,String apiProtocol,URI baseUrl,String modelDiscoveryPath,boolean credentialConfigured,ModelStatus status,int connectTimeoutMs,int readTimeoutMs,long revision){public static ProviderConnectionView from(ProviderConnection c){return new ProviderConnectionView(Long.toString(c.id()),Long.toString(c.providerId()),c.providerName(),c.name(),c.apiProtocol().value(),c.baseUrl(),c.modelDiscoveryPath(),c.credentialConfigured(),c.status(),c.connectTimeoutMs(),c.readTimeoutMs(),c.revision());}}
