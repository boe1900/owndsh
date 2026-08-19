// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/api/v1/sessions/${param0}/batches */
export async function appendSessionBatch(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.appendSessionBatchParams,
  body: {
    idempotencyKey: string;
    fromSeq: number;
    toSeq: number;
    previousRollingHash: string;
    payloadSha256: string;
    payloadBase64: string;
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
    } | null;
    title: string | null;
  },
  options?: { [key: string]: any }
) {
  const { sessionId: param0, ...queryParams } = params;
  return request<{
    data: { acceptedThroughSeq: number; rollingHash: string };
    requestId: string;
  }>(`/enterprise/api/v1/sessions/${param0}/batches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
