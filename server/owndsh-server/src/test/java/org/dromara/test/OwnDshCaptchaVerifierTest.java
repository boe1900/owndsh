/**
 * [INPUT]: 依赖 OwnDshCaptchaVerifier、mock Redisson bucket/CaptchaProperties/SysLoginService 与全局 captcha key。
 * [OUTPUT]: 验证验证码开关、生成端默认 codec 的 GETDEL 一次性消费、大小写匹配和统一失败登录记录。
 * [POS]: owndsh-server 的 LOCAL 验证码 composition adapter 门禁，证明 T05 复用真实 Host key 语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.test;

import org.dromara.common.core.constant.Constants;
import org.dromara.common.core.constant.GlobalConstants;
import org.dromara.common.web.config.properties.CaptchaProperties;
import org.dromara.web.enterprise.OwnDshCaptchaVerifier;
import org.dromara.web.service.SysLoginService;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Tag("dev")
class OwnDshCaptchaVerifierTest {
    @Test
    void acceptsDisabledCaptchaWithoutReadingRedis() {
        CaptchaProperties properties = new CaptchaProperties();
        properties.setEnable(false);
        RedissonClient redis = mock(RedissonClient.class);
        SysLoginService loginService = mock(SysLoginService.class);

        assertThat(new OwnDshCaptchaVerifier(properties, redis, loginService)
            .verify("alice", null, null)).isTrue();

        verify(redis, never()).getBucket(anyString());
    }

    @Test
    void atomicallyConsumesEnabledCaptchaAndRecordsOnlyFailures() {
        CaptchaProperties properties = new CaptchaProperties();
        properties.setEnable(true);
        RedissonClient redis = mock(RedissonClient.class);
        SysLoginService loginService = mock(SysLoginService.class);
        @SuppressWarnings("unchecked")
        RBucket<String> bucket = mock(RBucket.class);
        when(redis.<String>getBucket(eq(GlobalConstants.CAPTCHA_CODE_KEY + "captcha-id")))
            .thenReturn(bucket);
        when(bucket.getAndDelete()).thenReturn("Ab12").thenReturn((String) null);
        OwnDshCaptchaVerifier verifier = new OwnDshCaptchaVerifier(properties, redis, loginService);

        assertThat(verifier.verify("alice", "captcha-id", "aB12")).isTrue();
        assertThat(verifier.verify("alice", "captcha-id", "aB12")).isFalse();

        verify(bucket, times(2)).getAndDelete();
        verify(loginService).recordLoginInfo(eq("alice"), eq(Constants.LOGIN_FAIL), anyString());
    }
}
