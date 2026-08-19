// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 DELETE /enterprise/admin/v1/sessions/${param0} */
export async function deleteAdminSession(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.deleteAdminSessionParams,
  options?: { [key: string]: any }
) {
  const { replicaId: param0, ...queryParams } = params;
  return request<{
    data: {
      replicaId: string;
      sessionId: string;
      status: string;
      deletedAt: string;
    };
    requestId: string;
  }>(`/enterprise/admin/v1/sessions/${param0}`, {
    method: "DELETE",
    params: { ...queryParams },
    ...(options || {}),
  });
}
