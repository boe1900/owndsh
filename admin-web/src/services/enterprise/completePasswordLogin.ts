// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Authenticate over HTTPS or complete a one-time LOCAL password-change challenge in the same transaction. POST /enterprise/auth/v1/password */
export async function completePasswordLogin(
  body:
    | {
        transactionId: string;
        sourceId: string;
        csrfToken: string;
        username: string;
        password: string;
        captchaId?: string;
        captchaCode?: string;
      }
    | {
        transactionId: string;
        sourceId: string;
        csrfToken: string;
        passwordChangeChallenge: string;
        newPassword: string;
      },
  options?: { [key: string]: any }
) {
  return request<{
    data: {
      next: "REDIRECT" | "CHANGE_PASSWORD";
      redirectUri: any;
      passwordChangeChallenge: string | null;
      rejected: boolean;
    };
    requestId: string;
  }>("/enterprise/auth/v1/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: body,
    ...(options || {}),
  });
}
