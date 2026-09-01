// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 GET /enterprise/admin/v1/members */
export async function listMembers(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.listMembersParams,
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      items: {
        id: string;
        username: string;
        displayName: string;
        status: "ACTIVE" | "DISABLED";
        roles: (
          | "enterprise_admin"
          | "model_admin"
          | "plugin_admin"
          | "auditor"
          | "employee"
        )[];
        loginMethods: {
          sourceId: string | null;
          sourceName: string;
          sourceType: "OIDC" | "LDAP" | "LOCAL";
          lastLoginAt: string | null;
        }[];
        lastActiveAt: string | null;
        revision: number;
      }[];
      page: { hasMore: boolean; limit: number; nextCursor: string | null };
    };
    requestId: string;
  }>("/enterprise/admin/v1/members", {
    method: "GET",
    params: {
      // limit has a default value: 50
      limit: "50",
      ...params,
    },
    ...(options || {}),
  });
}
