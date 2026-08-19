// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Audit and revoke only the current platform token. POST /enterprise/auth/v1/logout */
export async function logoutPlatformSession(options?: { [key: string]: any }) {
  return request<{ data: { loggedOut: boolean }; requestId: string }>(
    "/enterprise/auth/v1/logout",
    {
      method: "POST",
      ...(options || {}),
    }
  );
}
