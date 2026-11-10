/**
 * [INPUT]: 接收历史静态登录 URL 中的事务、身份源和失败提示。
 * [OUTPUT]: 仅重定向到唯一 React 登录页，不再提供第二套表单或静态认证资源。
 * [POS]: auth/web 的旧链接兼容入口，身份绑定继续要求原事务的新鲜认证。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
public final class LegacyLoginController {
    @GetMapping("/enterprise/auth/login.html")
    public ResponseEntity<Void> login(@RequestParam("transaction_id") String transactionId,
        @RequestParam(value = "source_id", required = false) String sourceId,
        @RequestParam(value = "login_error", required = false) String loginError) {
        return ResponseEntity.status(303).header("Cache-Control", "no-store").location(
            UriComponentsBuilder.fromPath("/login").queryParam("transaction_id", transactionId)
                .queryParamIfPresent("source_id", java.util.Optional.ofNullable(sourceId))
                .queryParamIfPresent("login_error", java.util.Optional.ofNullable(loginError))
                .build().encode().toUri()
        ).build();
    }
}
