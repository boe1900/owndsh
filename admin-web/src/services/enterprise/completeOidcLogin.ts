// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Consume OIDC state and complete the platform login transaction. GET /enterprise/auth/v1/oidc/${param0}/callback */
export async function completeOidcLogin(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.completeOidcLoginParams,
  options?: { [key: string]: any }
) {
  const { sourceId: param0, ...queryParams } = params;
  return request<any>(`/enterprise/auth/v1/oidc/${param0}/callback`, {
    method: "GET",
    params: {
      ...queryParams,
    },
    ...(options || {}),
  });
}
