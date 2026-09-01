// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Return the current member, fixed roles, permissions and deployment identity without a menu tree. GET /enterprise/admin/v1/bootstrap */
export async function getConsoleBootstrap(options?: { [key: string]: any }) {
  return request<{
    data: {
      member: { id: string; displayName: string; avatarUrl: any };
      roles: (
        | "enterprise_admin"
        | "model_admin"
        | "plugin_admin"
        | "auditor"
        | "employee"
      )[];
      permissions: string[];
      deployment: { name: string };
    };
    requestId: string;
  }>("/enterprise/admin/v1/bootstrap", {
    method: "GET",
    ...(options || {}),
  });
}
