/**
 * [INPUT]: 依赖 RuoYi CaptchaProperties、Redisson 原子 GETDEL、全局 captcha key 与 SysLoginService 失败记录。
 * [OUTPUT]: 对外提供 CaptchaVerifier Bean，复用既有验证码开关、缓存和不区分失败原因的消费语义。
 * [POS]: ruoyi-admin composition adapter，使 ruoyi-enterprise 的 LOCAL 登录不反向依赖 RuoYi 静态 Redis 工具。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.web.enterprise;

import lombok.RequiredArgsConstructor;
import org.dromara.common.core.constant.Constants;
import org.dromara.common.core.constant.GlobalConstants;
import org.dromara.common.core.utils.StringUtils;
import org.dromara.common.web.config.properties.CaptchaProperties;
import org.dromara.enterprise.auth.application.CaptchaVerifier;
import org.dromara.web.service.SysLoginService;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.stereotype.Component;

/**
 * RuoYi 图片验证码适配器。
 */
@Component
@RequiredArgsConstructor
public final class RuoYiCaptchaVerifier implements CaptchaVerifier {
    private final CaptchaProperties captchaProperties;
    private final RedissonClient redisson;
    private final SysLoginService loginService;

    @Override
    public boolean verify(String username, String captchaId, String answer) {
        if (!captchaProperties.getEnable()) return true;
        String key = GlobalConstants.CAPTCHA_CODE_KEY + StringUtils.blankToDefault(captchaId, "");
        String expected = redisson.<String>getBucket(key, StringCodec.INSTANCE).getAndDelete();
        boolean matches = expected != null && StringUtils.equalsIgnoreCase(answer, expected);
        if (!matches) {
            String reason = expected == null ? "验证码已失效" : "验证码错误";
            loginService.recordLoginInfo(username, Constants.LOGIN_FAIL, reason);
        }
        return matches;
    }
}
