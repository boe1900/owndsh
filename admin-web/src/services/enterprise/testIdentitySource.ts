// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Test a stored identity source without returning upstream data. POST /enterprise/admin/v1/identity-sources/${param0}/actions/test */
export async function testIdentitySource(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.testIdentitySourceParams,
  options?: { [key: string]: any }
) {
  const { sourceId: param0, ...queryParams } = params;
  return request<{
    data: { type: "OIDC" | "LDAP" | "LOCAL"; ok: boolean; diagnostic: string };
    requestId: string;
  }>(`/enterprise/admin/v1/identity-sources/${param0}/actions/test`, {
    method: "POST",
    params: { ...queryParams },
    ...(options || {}),
  });
}
