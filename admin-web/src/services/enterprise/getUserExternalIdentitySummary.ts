// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** List sanitized external identity bindings for one RuoYi user. GET /enterprise/admin/v1/users/${param0}/identity-summary */
export async function getUserExternalIdentitySummary(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.getUserExternalIdentitySummaryParams,
  options?: { [key: string]: any }
) {
  const { userId: param0, ...queryParams } = params;
  return request<{
    data: {
      sourceId: string;
      sourceName: string;
      sourceType: "OIDC" | "LDAP" | "LOCAL";
      externalSubject: string;
      lastLoginAt: string | null;
    }[];
    requestId: string;
  }>(`/enterprise/admin/v1/users/${param0}/identity-summary`, {
    method: "GET",
    params: { ...queryParams },
    ...(options || {}),
  });
}
