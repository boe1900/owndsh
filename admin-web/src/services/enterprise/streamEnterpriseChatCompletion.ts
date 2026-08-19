// @ts-ignore
/* eslint-disable */
import request from "@/api/enterprise/generated-request";

/** 此处后端没有提供注释 POST /enterprise/gateway/v1/chat/completions */
export async function streamEnterpriseChatCompletion(
  body: {
    model: string | string;
    messages: (
      | { role: "system" | "user"; content: string; name?: string }
      | {
          role: string;
          content?: string | null;
          name?: string;
          tool_calls?: {
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }[];
          reasoning_content?: string;
          prefix?: boolean;
        }
      | { role: string; content: string; name?: string; tool_call_id: string }
    )[];
    tools?: {
      type: string;
      function: {
        name: string;
        description?: string;
        parameters?: Record<string, any>;
      };
    }[];
    tool_choice?:
      | "none"
      | "auto"
      | "required"
      | { type: string; function: { name: string } };
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stop?: string | string[] | null;
    stream: boolean;
    stream_options?: { include_usage?: boolean };
    thinking?: { type: "enabled" | "disabled" };
    reasoning_effort?: "high" | "max";
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
