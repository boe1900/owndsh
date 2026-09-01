// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/admin/v1/members/${param0}/identity-links */
export async function startIdentityLink(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.startIdentityLinkParams,
  body: {
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
  },
  options?: { [key: string]: any }
) {
  const { userId: param0, ...queryParams } = params;
  return request<{
    data: { transactionId: string; authorizeUri: string };
    requestId: string;
  }>(`/enterprise/admin/v1/members/${param0}/identity-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
