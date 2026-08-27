// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/gateway/v1/chat/completions */
export async function streamEnterpriseChatCompletions(
  body: {
    model: string | string;
    stream: boolean;
    max_tokens?: number;
    max_output_tokens?: number;
  },
  options?: { [key: string]: any }
) {
  return request<string>("/enterprise/gateway/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: body,
    ...(options || {}),
  });
}
