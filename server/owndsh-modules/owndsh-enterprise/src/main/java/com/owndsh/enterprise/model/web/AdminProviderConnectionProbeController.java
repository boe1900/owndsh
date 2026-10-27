/**
 * [INPUT]: 接收未保存连接的 endpoint、协议、超时和一次性 credential。
 * [OUTPUT]: 提供脱敏模型发现结果，不创建连接事实。
 * [POS]: model/web 的草稿探测边界，正式连接由 AdminProviderConnectionController 保存。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;
import cn.dev33.satoken.annotation.SaCheckPermission;import jakarta.servlet.http.HttpServletRequest;import com.owndsh.enterprise.auth.web.*;import com.owndsh.enterprise.common.api.*;import com.owndsh.enterprise.model.application.*;import java.util.*;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/enterprise/admin/v1/provider-connections/actions") public final class AdminProviderConnectionProbeController{
 private final ProviderConnectionService service;private final IdentityAdminRequestContextResolver contexts;public AdminProviderConnectionProbeController(ProviderConnectionService s,IdentityAdminRequestContextResolver c){service=s;contexts=c;}
 @PostMapping("/probe") @SaCheckPermission("ent:model:write") public EnterpriseResponse<ProviderProbe.ProviderProbeResult> probe(@RequestBody ProviderConnectionWriteRequest body,HttpServletRequest req){var c=contexts.resolve(req);try(body;var secret=body.createSecret()){return new EnterpriseResponse<>(service.probe(body.spec(),secret),c.requestId());}}
}
