// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 DELETE /enterprise/admin/v1/quotas/${param0} */
export async function deleteQuotaPolicy(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteQuotaPolicyParams,
  options?: { [key: string]: any }
) {
  const { quotaId: param0, ...queryParams } = params;
  return request<{ data: { id: string; deleted: boolean }; requestId: string }>(
    `/enterprise/admin/v1/quotas/${param0}`,
    {
      method: "DELETE",
      params: { ...queryParams },
      ...(options || {}),
    }
  );
}
