/**
 * [INPUT]: 依赖历史 URL 兼容 Controller 和 MockMvc。
 * [OUTPUT]: 验证历史身份绑定/登录链接只跳统一 React 页面，查询值不能注入外部跳转。
 * [POS]: auth 的退役入口回归，不再维护第二套静态表单契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.web.LegacyLoginController;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Tag("dev")
class LegacyLoginControllerTest {
    @Test
    void redirectsLegacyTransactionsToTheOnlyLoginForm() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new LegacyLoginController()).build();
        mvc.perform(get("/enterprise/auth/login.html").param("transaction_id", "tx_legacy")
                .param("source_id", "7").param("login_error", "1"))
            .andExpect(status().isSeeOther())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(redirectedUrl("/login?transaction_id=tx_legacy&source_id=7&login_error=1"));
        mvc.perform(get("/enterprise/auth/login.html").param("transaction_id", "https://attacker.example/?a=1&b=2"))
            .andExpect(status().isSeeOther())
            .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("/login?transaction_id=")));
    }
}
