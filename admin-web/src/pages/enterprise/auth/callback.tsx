/**
 * [INPUT]: 依赖 enterprise-admin PKCE 回调状态机、标签页 Token 存储与 Umi 路由
 * [OUTPUT]: 提供登录完成、失败重试和原目标路由恢复页面
 * [POS]: pages/enterprise/auth 的唯一公开回调，不渲染或持久化 code/verifier/Token
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { Button, Result, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { completeEnterpriseAdminLogin } from '@/api/enterprise/auth/pkce';
import { setToken } from '@/utils/auth';

export default function EnterpriseAuthCallbackPage() {
  const [errorCode, setErrorCode] = useState<string>();

  useEffect(() => {
    completeEnterpriseAdminLogin(window.location.search)
      .then(({ token, returnTo }) => {
        setToken(token);
        history.replace(returnTo);
      })
      .catch(error => setErrorCode((error as Error).message || 'ENT_AUTH_CODE_INVALID'));
  }, []);

  if (!errorCode) {
    return (
      <main className="enterprise-auth-result" aria-label="正在完成企业登录">
        <Spin indicator={<LoadingOutlined spin />} size="large" />
      </main>
    );
  }

  return (
    <main className="enterprise-auth-result">
      <Result
        status="error"
        title="企业登录失败"
        subTitle={errorCode}
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => history.replace('/login')}>
            重新登录
          </Button>
        }
      />
    </main>
  );
}
