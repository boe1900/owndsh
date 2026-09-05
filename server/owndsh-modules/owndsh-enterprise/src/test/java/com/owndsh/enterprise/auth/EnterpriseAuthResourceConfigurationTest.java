/**
 * [INPUT]: 依赖 EnterpriseAuthResourceConfiguration、Spring MVC 测试上下文与模块内真实静态资源
 * [OUTPUT]: 验证公开登录 HTML/CSS/JS/鲸鱼图标、身份源 Tab、输入提示、两阶段改密与凭据清理逻辑从 classpath 映射且类型正确
 * [POS]: auth 的浏览器入口回归门禁，防止授权跳转落入 Host 404 envelope
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.web.EnterpriseAuthResourceConfiguration;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(SpringExtension.class)
@WebAppConfiguration
@ContextConfiguration(classes = EnterpriseAuthResourceConfigurationTest.TestWebConfiguration.class)
@Tag("dev")
class EnterpriseAuthResourceConfigurationTest {
    private final MockMvc mvc;

    EnterpriseAuthResourceConfigurationTest(WebApplicationContext context) {
        this.mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @Test
    void servesOnlyThePublicLoginAssets() throws Exception {
        mvc.perform(get("/enterprise/auth/login.html"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("name=\"newPassword\"")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("id=\"username\" name=\"username\" autocomplete=\"username\" maxlength=\"100\" placeholder=")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("id=\"password\" name=\"password\" type=\"password\" autocomplete=\"current-password\" maxlength=\"256\" placeholder=")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("id=\"captcha-code\" name=\"captchaCode\" inputmode=\"text\" autocomplete=\"off\" maxlength=\"16\" placeholder=")));
        mvc.perform(get("/enterprise/auth/login.css"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/css"));
        mvc.perform(get("/enterprise/auth/login.js"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/javascript"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("passwordChangeChallenge")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("new FormData(passwordForm)")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("loginFailed")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("aria-pressed")));
        mvc.perform(get("/enterprise/auth/owndsh-whale-mono-m2-animated.png"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_PNG));
        mvc.perform(get("/enterprise/auth/CLAUDE.md"))
            .andExpect(status().isNotFound());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    @Import(EnterpriseAuthResourceConfiguration.class)
    static class TestWebConfiguration {
    }
}
