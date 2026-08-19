// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Authenticate one LOCAL or LDAP source within an HTTPS login transaction; LOCAL reuses RuoYi captcha. POST /enterprise/auth/v1/password */
export async function completePasswordLogin(
  body: {
    transactionId: string;
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    csrfToken: string;
    username: string;
    password: string;
    /** Required for LOCAL only when the existing RuoYi captcha switch is enabled. */
    captchaId?: string;
    /** Required for LOCAL only when the existing RuoYi captcha switch is enabled. */
    captchaCode?: string;
  },
  options?: { [key: string]: any }
) {
  return request<any>("/enterprise/auth/v1/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: body,
    ...(options || {}),
  });
}
