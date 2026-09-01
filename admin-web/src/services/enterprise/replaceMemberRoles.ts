// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 PUT /enterprise/admin/v1/members/${param0}/roles */
export async function replaceMemberRoles(
  // 叠加生成的Param类型 (非body参数swagger默认没有生成对象)
  params: API.replaceMemberRolesParams,
  body: {
    roles: (
      | "enterprise_admin"
      | "model_admin"
      | "plugin_admin"
      | "auditor"
      | "employee"
    )[];
  },
  options?: { [key: string]: any }
) {
  const { userId: param0, ...queryParams } = params;
  return request<{
    data: {
      member: {
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
      };
      identities: {
        identityId: string | null;
        sourceId: string | null;
        sourceName: string;
        sourceType: "OIDC" | "LDAP" | "LOCAL";
        subject: string;
        lastLoginAt: string | null;
      }[];
      devices: {
        id: string;
        name: string;
        platform: string;
        status: "ACTIVE" | "REVOKED";
        lastSeenAt: string | null;
      }[];
      sessions: {
        active: number;
        deleted: number;
        expired: number;
        latestUpdatedAt: string | null;
      };
    };
    requestId: string;
  }>(`/enterprise/admin/v1/members/${param0}/roles`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    params: { ...queryParams },
    data: body,
    ...(options || {}),
  });
}
