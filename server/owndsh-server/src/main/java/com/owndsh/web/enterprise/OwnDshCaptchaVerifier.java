/**
 * [INPUT]: 依赖 Host CaptchaProperties、Redisson 默认 codec 原子 GETDEL、全局 captcha key 与 SysLoginService 失败记录。
 * [OUTPUT]: 对外提供 CaptchaVerifier Bean，以生成端相同 codec 消费验证码并记录不区分凭据细节的失败。
 * [POS]: owndsh-server composition adapter，使 owndsh-enterprise 的 LOCAL 登录不反向依赖 Host 静态 Redis 工具。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.web.enterprise;

import lombok.RequiredArgsConstructor;
import com.owndsh.common.core.constant.Constants;
import com.owndsh.common.core.constant.GlobalConstants;
import com.owndsh.common.core.utils.StringUtils;
import com.owndsh.common.web.config.properties.CaptchaProperties;
import com.owndsh.enterprise.auth.application.CaptchaVerifier;
import com.owndsh.web.service.SysLoginService;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

/**
 * Host 图片验证码适配器。
 */
@Component
@RequiredArgsConstructor
public final class OwnDshCaptchaVerifier implements CaptchaVerifier {
    private final CaptchaProperties captchaProperties;
    private final RedissonClient redisson;
    private final SysLoginService loginService;

    @Override
    public boolean verify(String username, String captchaId, String answer) {
        if (!captchaProperties.getEnable()) return true;
        String key = GlobalConstants.CAPTCHA_CODE_KEY + StringUtils.blankToDefault(captchaId, "");
        String expected = redisson.<String>getBucket(key).getAndDelete();
        boolean matches = expected != null && StringUtils.equalsIgnoreCase(answer, expected);
        if (!matches) {
            String reason = expected == null ? "验证码已失效" : "验证码错误";
            loginService.recordLoginInfo(username, Constants.LOGIN_FAIL, reason);
        }
        return matches;
    }
}
