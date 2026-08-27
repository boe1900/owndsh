// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/gateway/v1/messages */
export async function streamEnterpriseAnthropicMessages(
  body: {
    model: string | string;
    stream: boolean;
    max_tokens?: number;
    max_output_tokens?: number;
  },
  options?: { [key: string]: any }
) {
  return request<string>("/enterprise/gateway/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}
