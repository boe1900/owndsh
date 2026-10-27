/**
 * [INPUT]: 接收连接名称、协议、HTTP endpoint、超时与一次性 credential。
 * [OUTPUT]: 对外提供连接写 command，并复用统一 endpoint/timeout 校验。
 * [POS]: model/application 的连接配置边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import java.net.URI;
import java.util.Locale;
import java.util.Objects;

public record ProviderConnectionSpec(String name, ProviderApiProtocol apiProtocol, URI baseUrl, String modelDiscoveryPath, int connectTimeoutMs, int readTimeoutMs) {
    public ProviderConnectionSpec(String name, ProviderApiProtocol apiProtocol, URI baseUrl, int connectTimeoutMs, int readTimeoutMs) {
        this(name, apiProtocol, baseUrl, "/models", connectTimeoutMs, readTimeoutMs);
    }
    public ProviderConnectionSpec { if(name==null||name.isBlank()||name.length()>120)throw new IllegalArgumentException("name 非法");Objects.requireNonNull(apiProtocol,"apiProtocol");baseUrl=requireEndpoint(baseUrl);modelDiscoveryPath=requireDiscoveryPath(modelDiscoveryPath);if(connectTimeoutMs<1||connectTimeoutMs>600000||readTimeoutMs<1||readTimeoutMs>600000)throw new IllegalArgumentException("connection timeout 非法"); }
    public static URI requireEndpoint(URI value){Objects.requireNonNull(value,"baseUrl");String scheme=value.getScheme()==null?"":value.getScheme().toLowerCase(Locale.ROOT);if(!(scheme.equals("http")||scheme.equals("https"))||value.getHost()==null||value.getUserInfo()!=null||value.getRawQuery()!=null||value.getRawFragment()!=null||value.toString().length()>500)throw new IllegalArgumentException("baseUrl 必须是固定 HTTP(S) endpoint");return value.normalize();}
    public static String requireDiscoveryPath(String value) { if(value == null || value.isBlank() || value.length() > 255 || !value.startsWith("/") || value.startsWith("//") || value.indexOf('?') >= 0 || value.indexOf('#') >= 0) throw new IllegalArgumentException("modelDiscoveryPath 必须是绝对路径"); return value; }
}
