// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Delete one group mapping using revision CAS. DELETE /enterprise/admin/v1/group-mappings/${param0} */
export async function deleteGroupMapping(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteGroupMappingParams,
  options?: { [key: string]: any }
) {
  const { mappingId: param0, ...queryParams } = params;
  return request<{ data: { id: string; deleted: boolean }; requestId: string }>(
    `/enterprise/admin/v1/group-mappings/${param0}`,
    {
      method: "DELETE",
      params: { ...queryParams },
      ...(options || {}),
    }
  );
}
