/**
 * [INPUT]: 依赖 Sa-Token Servlet 上下文、OwnDsh 安全白名单/client 规则与当前 HTTP 请求路径。
 * [OUTPUT]: 提供异步分发可用的 Sa-Token filter，以及把企业 API 鉴权完整下沉到领域 context 的统一拦截器。
 * [POS]: owndsh-common-security 的全局入口；非企业路由保留登录/clientid 交叉校验，企业路由避免在领域撤销语义前截断请求。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.common.security.config;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import cn.dev33.satoken.filter.SaTokenContextFilterForJakartaServlet;
import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.router.SaRouter;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.util.SaTokenConsts;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.owndsh.common.core.utils.NetUtils;
import com.owndsh.common.core.utils.ServletUtils;
import com.owndsh.common.core.utils.SpringUtils;
import com.owndsh.common.core.utils.StringUtils;
import com.owndsh.common.satoken.utils.LoginHelper;
import com.owndsh.common.security.config.properties.SecurityProperties;
import com.owndsh.common.security.handler.AllUrlHandler;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.EnumSet;
import java.util.List;

/**
 * 权限安全配置
 *
 * @author Lion Li
 */

@Slf4j
@AutoConfiguration
@EnableConfigurationProperties(SecurityProperties.class)
@RequiredArgsConstructor
public class SecurityConfig implements WebMvcConfigurer {

    private static final String CLIENT_RULE_SEPARATOR_REGEX = "[,;\\r\\n]+";

    private final SecurityProperties securityProperties;

    /**
     * 重新注册 Sa-Token 上下文过滤器，使其覆盖 Servlet 异步分发。
     * <p>
     * SSE、WebSocket 握手等场景可能触发 ASYNC/ERROR dispatcher，如果上下文过滤器只处理普通 REQUEST，
     * 后续统一鉴权或业务代码读取 SaHolder/StpUtil 时会出现 SaTokenContext 未初始化。
     *
     * @param filter Sa-Token 官方上下文过滤器
     * @return 过滤器注册配置
     */
    @Bean
    public FilterRegistrationBean<SaTokenContextFilterForJakartaServlet> saTokenContextFilterRegistration(
        SaTokenContextFilterForJakartaServlet filter) {
        FilterRegistrationBean<SaTokenContextFilterForJakartaServlet> registration = new FilterRegistrationBean<>();
        registration.setFilter(filter);
        registration.setName("saTokenContextFilterForServlet");
        registration.addUrlPatterns("/*");
        registration.setDispatcherTypes(EnumSet.of(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR));
        registration.setAsyncSupported(true);
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    /**
     * 注册 Sa-Token 路由拦截器并配置鉴权规则。
     *
     * @param registry 拦截器注册器
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 注册路由拦截器，自定义验证规则
        registry.addInterceptor(new SaInterceptor(handler -> {
                AllUrlHandler allUrlHandler = SpringUtils.getBean(AllUrlHandler.class);
                // 登录验证 -- 排除多个路径
                SaRouter
                    // 获取所有的
                    .match(allUrlHandler.getUrls())
                    // 对未排除的路径进行检查
                    .check(() -> {
                        HttpServletRequest request = ServletUtils.getRequest();
                        HttpServletResponse response = ServletUtils.getResponse();
                        response.setContentType(SaTokenConsts.CONTENT_TYPE_APPLICATION_JSON);
                        String requestPath = StringUtils.blankToDefault(
                            request.getServletPath(), request.getRequestURI()
                        );
                        // 企业 Controller 的 context resolver 负责区分未登录、设备撤销与 client 类型。
                        if (!requiresGlobalLoginCheck(requestPath)) {
                            return;
                        }
                        // 检查是否登录 是否有token
                        StpUtil.checkLogin();

                        String headerCid = request.getHeader(LoginHelper.CLIENT_KEY);
                        String paramCid = ServletUtils.getParameter(LoginHelper.CLIENT_KEY);
                        String clientId = StpUtil.getExtra(LoginHelper.CLIENT_KEY).toString();
                        if (!StringUtils.equalsAny(clientId, headerCid, paramCid)) {
                            throw NotLoginException.newInstance(StpUtil.getLoginType(),
                                "-100", "客户端ID与Token不匹配",
                                StpUtil.getTokenValue());
                        }
                        validateClientAccessRules(request);

                        // 有效率影响 用于临时测试
                        // if (log.isDebugEnabled()) {
                        //     log.info("剩余有效时间: {}", StpUtil.getTokenTimeout());
                        //     log.info("临时有效时间: {}", StpUtil.getTokenActivityTimeout());
                        // }

                    });
            })).addPathPatterns("/**")
            // 排除不需要拦截的路径
            .excludePathPatterns(securityProperties.getExcludes());
    }

    static boolean requiresGlobalLoginCheck(String requestPath) {
        return !requestPath.startsWith("/enterprise/");
    }

    /**
     * 按客户端配置校验接口访问路径与来源 IP。
     *
     * @param request 当前请求
     */
    private void validateClientAccessRules(HttpServletRequest request) {
        String requestPath = StringUtils.blankToDefault(request.getServletPath(), request.getRequestURI());
        String accessPath = getTokenExtra(LoginHelper.CLIENT_ACCESS_PATH_KEY);
        if (StringUtils.isNotBlank(accessPath)) {
            List<String> accessPathList = StringUtils.str2List(accessPath, CLIENT_RULE_SEPARATOR_REGEX, true, true);
            if (!StringUtils.matches(requestPath, accessPathList)) {
                throw new NotPermissionException("当前客户端未授权访问该接口路径");
            }
        }

        String ipWhitelist = getTokenExtra(LoginHelper.CLIENT_IP_WHITELIST_KEY);
        if (StringUtils.isNotBlank(ipWhitelist)) {
            String clientIp = ServletUtils.getClientIP(request);
            List<String> ipWhitelistList = StringUtils.str2List(ipWhitelist, CLIENT_RULE_SEPARATOR_REGEX, true, true);
            boolean matched = ipWhitelistList.stream().anyMatch(rule -> NetUtils.isMatchIpRule(rule, clientIp));
            if (!matched) {
                throw new NotPermissionException("当前客户端IP不在白名单内");
            }
        }
    }

    /**
     * 读取 token 扩展信息，兼容空值场景。
     *
     * @param key 扩展字段
     * @return 扩展值
     */
    private String getTokenExtra(String key) {
        Object extra = StpUtil.getExtra(key);
        return extra == null ? null : extra.toString();
    }

}
