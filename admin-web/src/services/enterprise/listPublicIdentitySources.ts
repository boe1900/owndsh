// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** List active public identity sources for one login transaction. GET /enterprise/auth/v1/sources */
export async function listPublicIdentitySources(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listPublicIdentitySourcesParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      transactionId: string;
      csrfToken: string;
      sources: { id: string; name: string; type: "OIDC" | "LDAP" | "LOCAL" }[];
    };
    requestId: string;
  }>("/enterprise/auth/v1/sources", {
    method: "GET",
    params: {
      ...params,
    },
    ...(options || {}),
  });
}
