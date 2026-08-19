// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** List explicit external group mappings for one identity source. GET /enterprise/admin/v1/group-mappings */
export async function listGroupMappings(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listGroupMappingsParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        sourceId: string;
        externalGroup: string;
        departmentId: string;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/group-mappings", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}
