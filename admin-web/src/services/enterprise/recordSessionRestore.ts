// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/api/v1/sessions/${param0}/restore-record */
export async function recordSessionRestore(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.recordSessionRestoreParams,
  body: {
    restoredSessionId: string;
  },
  options?: { [key: string]: any }
) {
  const { sessionId: param0, ...queryParams } = params;
  return request<{
    data: {
      sourceSessionId: string;
      restoredSessionId: string;
      recordedAt: string;
    };
    requestId: string;
  }>(`/enterprise/api/v1/sessions/${param0}/restore-record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
