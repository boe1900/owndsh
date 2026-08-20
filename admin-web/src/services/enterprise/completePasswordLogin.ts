// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** Authenticate LOCAL or LDAP over HTTPS; bootstrap LOCAL accounts change the initial password in the same transaction. POST /enterprise/auth/v1/password */
export async function completePasswordLogin(
  body: {
    transactionId: string;
    /** Identity source snowflake ID serialized as a string. */
    sourceId: string;
    csrfToken: string;
    username: string;
    password: string;
    /** Required only after a LOCAL bootstrap account is redirected to the first-login password change form. */
    newPassword?: string;
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
