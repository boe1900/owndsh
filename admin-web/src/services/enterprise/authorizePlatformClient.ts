// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Validate one fixed public client request and create a five-minute login transaction. GET /enterprise/auth/v1/authorize */
export async function authorizePlatformClient(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.authorizePlatformClientParams,
  options?: { [key: string]: any }
) {
  return request<any>("/enterprise/auth/v1/authorize", {
    method: "GET",
    params: {
      ...params,
    },
    ...(options || {}),
  });
}
