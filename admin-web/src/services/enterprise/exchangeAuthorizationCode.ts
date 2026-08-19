// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Atomically consume one platform authorization code after exact PKCE/client binding checks. POST /enterprise/auth/v1/token */
export async function exchangeAuthorizationCode(
  body: {
    grantType: string;
    code: string;
    clientId: "dsh-desktop" | "enterprise-admin";
    redirectUri: string;
    codeVerifier: string;
    installationId?: string | null;
  },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      accessToken: string;
      tokenType: string;
      expiresIn: number;
      clientId: "dsh-desktop" | "enterprise-admin";
    };
    requestId: string;
  }>("/enterprise/auth/v1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}
