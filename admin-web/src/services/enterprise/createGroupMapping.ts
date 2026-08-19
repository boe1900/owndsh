// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Create one explicit external group to department mapping. POST /enterprise/admin/v1/group-mappings */
export async function createGroupMapping(
  body: {
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    externalGroup: string;
    /** RuoYi department snowflake ID serialized as a string. */
    departmentId: string;
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      id: string;
      sourceId: string;
      externalGroup: string;
      departmentId: string;
      revision: number;
    };
    requestId: string;
  }>("/enterprise/admin/v1/group-mappings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}
