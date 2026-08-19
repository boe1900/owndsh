/**
 * [INPUT]: 依赖 enterprise-admin PKCE 状态机、标签页 Token 和 Umi redirect 参数
 * [OUTPUT]: 提供管理控制台唯一企业身份登录入口
 * [POS]: pages 的认证起点，不接受账号密码且不提供持久化登录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { LoginOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { history, useSearchParams } from '@umijs/max';
import { Button, ConfigProvider, Typography } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useState } from 'react';
import { startEnterpriseAdminLogin } from '@/api/enterprise/auth/pkce';
import LocaleSelect from '@/components/layout/LocaleSelect';
import { useAppStore } from '@/stores/appStore';
import { getToken } from '@/utils/auth';
import { appEnv } from '@/utils/env';

const DEFAULT_LOGIN_REDIRECT = '/index';

function normalizeLoginRedirect(redirect?: string | null) {
  if (!redirect?.startsWith('/') || redirect.startsWith('//')) return DEFAULT_LOGIN_REDIRECT;
  if (redirect === '/login' || redirect.startsWith('/login?')) return DEFAULT_LOGIN_REDIRECT;
  return redirect;
}

const authText = {
  zh_CN: {
    product: '企业 Agent 治理平台',
    title: '管理控制台',
    description: '通过组织已配置的身份源验证管理员身份。',
    action: '使用企业身份登录',
    working: '正在进入企业登录…',
    session: '登录状态仅在当前标签页有效'
  },
  en_US: {
    product: 'Enterprise Agent Governance',
    title: 'Management Console',
    description: 'Verify your administrator identity with an identity source configured by your organization.',
    action: 'Continue with enterprise identity',
    working: 'Opening enterprise sign-in…',
    session: 'Your session is limited to this browser tab'
  }
};

export default function Login() {
  const [params] = useSearchParams();
  const appLocale = useAppStore(state => state.appLocale);
  const setAppLocale = useAppStore(state => state.setAppLocale);
  const [submitting, setSubmitting] = useState(false);
  const text = authText[appLocale];
  const redirect = params.get('redirect');

  useEffect(() => {
    if (getToken()) history.replace(normalizeLoginRedirect(redirect));
  }, [redirect]);

  useEffect(() => {
    document.title = appEnv.title;
  }, []);

  const startLogin = async () => {
    setSubmitting(true);
    try {
      await startEnterpriseAdminLogin(normalizeLoginRedirect(redirect));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfigProvider locale={appLocale === 'zh_CN' ? zhCN : enUS}>
      <div className="login-page enterprise-login-page">
        <div className="auth-locale-select">
          <LocaleSelect value={appLocale} onChange={setAppLocale} />
        </div>
        <main className="enterprise-login-shell">
          <div className="enterprise-login-mark" aria-hidden="true">
            <SafetyCertificateOutlined />
          </div>
          <Typography.Text className="enterprise-login-product">{text.product}</Typography.Text>
          <Typography.Title level={1}>{text.title}</Typography.Title>
          <Typography.Paragraph>{text.description}</Typography.Paragraph>
          <Button
            type="primary"
            size="large"
            block
            icon={<LoginOutlined />}
            loading={submitting}
            onClick={startLogin}
          >
            {submitting ? text.working : text.action}
          </Button>
          <Typography.Text type="secondary" className="enterprise-login-session">
            {text.session}
          </Typography.Text>
        </main>
      </div>
    </ConfigProvider>
  );
}
