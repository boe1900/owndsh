// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Create isolated OIDC state, nonce and S256 verifier, then redirect to the IdP. GET /enterprise/auth/v1/oidc/${param0}/start */
export async function startOidcLogin(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.startOidcLoginParams,
  options?: { [key: string]: any }
) {
  const { sourceId: param0, ...queryParams } = params;
  return request<any>(`/enterprise/auth/v1/oidc/${param0}/start`, {
    method: "GET",
    params: {
      ...queryParams,
    },
    ...(options || {}),
  });
}
