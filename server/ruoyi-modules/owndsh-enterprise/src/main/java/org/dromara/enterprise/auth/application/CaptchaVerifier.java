/**
 * [INPUT]: 接收 LOCAL 登录的一次性 captcha ID、用户答案与仅用于失败审计的账号名。
 * [OUTPUT]: 对外提供不泄漏失败原因的验证码原子消费结果。
 * [POS]: auth application 到宿主验证码设施的 DIP 端口，使身份状态机复用 Host 策略而不依赖其静态工具。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

/**
 * LOCAL 登录验证码验证端口。
 */
@FunctionalInterface
public interface CaptchaVerifier {
    boolean verify(String username, String captchaId, String answer);
}
