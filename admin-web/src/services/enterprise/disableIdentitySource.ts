// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Disable one identity source using revision CAS. POST /enterprise/admin/v1/identity-sources/${param0}/actions/disable */
export async function disableIdentitySource(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.disableIdentitySourceParams,
  options?: { [key: string]: any }
) {
  const { sourceId: param0, ...queryParams } = params;
  return request<{
    data: {
      id: string;
      type: "OIDC" | "LDAP" | "LOCAL";
      provisioningMode: "JIT" | "LINK_ONLY";
      name: string;
      issuer: string;
      clientId: string;
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
      lastTestedAt: string;
      lastTestOk: boolean;
      lastTestDiagnostic: string;
    };
    requestId: string;
  }>(`/enterprise/admin/v1/identity-sources/${param0}/actions/disable`, {
    method: "POST",
    params: { ...queryParams },
    ...(options || {}),
  });
}
