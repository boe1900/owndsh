// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** List configured identity sources. GET /enterprise/admin/v1/identity-sources */
export async function listIdentitySources(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listIdentitySourcesParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        type: "OIDC" | "LDAP" | "LOCAL";
        name: string;
        issuer?: string;
        clientId?: string;
        oidc: {
          scopes: string[];
          claims: {
            username: string;
            displayName: string;
            email?: string;
            groups?: string;
          };
        };
        ldap: {
          url: string;
          baseDn: string;
          managerDn: string;
          userFilter: string;
          stableIdAttribute: string;
          usernameAttribute: string;
          displayNameAttribute: string;
          emailAttribute?: string;
          groupAttribute?: string;
          startTls: boolean;
        };
        secretConfigured: boolean;
        status: "ACTIVE" | "DISABLED";
        revision: number;
        createdAt: string;
        updatedAt: string;
        lastTestedAt?: string;
        lastTestOk?: boolean;
        lastTestDiagnostic?: string;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/identity-sources", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}
