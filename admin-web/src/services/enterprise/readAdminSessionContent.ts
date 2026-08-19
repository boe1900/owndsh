// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/sessions/${param0}/content */
export async function readAdminSessionContent(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.readAdminSessionContentParams,
  options?: { [key: string]: any }
) {
  const { replicaId: param0, ...queryParams } = params;
  return request<{
    data: {
      sessionId: string;
      header: {
        version: number;
        id: string;
        createdAt: number;
        cwd?: string;
        parentSession?: string;
        seedLength?: number;
        origin?: string;
        delegationDepth?: number;
        agentPreset?: string;
      };
      title: string | null;
      fromSeq: number;
      toSeq: number;
      eventCount: number;
      previousRollingHash: string;
      rollingHash: string;
      payloadSha256: string;
      payloadBase64: string;
      hasMore: boolean;
    };
    requestId: string;
  }>(`/enterprise/admin/v1/sessions/${param0}/content`, {
    method: "GET",
    params: {
      // limit has a default value: 200
      limit: "200",
      ...queryParams,
    },
    ...(options || {}),
  });
}
