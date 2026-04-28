import { NextResponse } from "next/server";
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  sanitizeAssistantPayload,
  type NoteAssistantRequest,
} from "@/lib/ai/note-assistant";

const DEFAULT_MODEL_NAME = process.env.OPENAI_ASSISTANT_MODEL || "deepseek-v4-flash";
const ALLOWED_MODEL_NAMES = new Set([
  "deepseek-v4-flash",
  "gpt-5.4-nano-2026-03-17",
  "gpt-4.1-mini",
]);
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
const CHAT_COMPLETIONS_ENDPOINT = `${OPENAI_BASE_URL}/chat/completions`;

type AssistantRole = "system" | "user" | "assistant";

type OpenAIInputItem = {
  role: AssistantRole;
  content: Array<{ type: "input_text"; text: string }>;
};

function toInputItem(role: OpenAIInputItem["role"], text: string): OpenAIInputItem {
  return {
    role,
    content: [{ type: "input_text", text }],
  };
}

function resolveModelName(requestedModel?: string): string {
  const normalized = String(requestedModel ?? "").trim();
  if (normalized && ALLOWED_MODEL_NAMES.has(normalized)) {
    return normalized;
  }
  return DEFAULT_MODEL_NAME;
}

function extractProviderMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "No detail from provider.";
  }

  const errorMessage = (payload as { error?: { message?: unknown } }).error?.message;
  if (typeof errorMessage === "string" && errorMessage.trim()) {
    return errorMessage.trim();
  }

  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 360 ? `${serialized.slice(0, 360)}...` : serialized;
  } catch {
    return "Unable to serialize provider error payload.";
  }
}

function flattenMessages(input: OpenAIInputItem[]): Array<{ role: AssistantRole; content: string }> {
  return input.map((item) => ({
    role: item.role,
    content: item.content.map((part) => part.text).join("\n\n").trim(),
  }));
}

async function createChatCompletionsStream(input: OpenAIInputItem[], modelName: string, signal: AbortSignal): Promise<Response> {
  return fetch(CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: flattenMessages(input),
      stream: true,
    }),
    signal,
  });
}

function extractChatCompletionsDelta(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") {
    return "";
  }

  const content = (delta as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function streamChatResponse(providerResponse: Response, abortController: AbortController): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = providerResponse.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode(sseData({ error: "AI provider stream is not readable." })));
        controller.close();
        return;
      }

      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split(/\r?\n\r?\n/);
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const lines = chunk.split(/\r?\n/).filter((line) => line.startsWith("data:"));
            for (const line of lines) {
              const data = line.slice(5).trimStart();
              if (!data || data === "[DONE]") {
                continue;
              }

              const json = JSON.parse(data) as unknown;
              const delta = extractChatCompletionsDelta(json);
              if (delta) {
                controller.enqueue(encoder.encode(sseData({ delta })));
              }
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI provider stream failed.";
        controller.enqueue(encoder.encode(sseData({ error: message })));
        controller.close();
      } finally {
        abortController.abort();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY is not configured. Please add it to your environment variables.",
        },
        { status: 500 },
      );
    }

    const rawPayload = (await request.json()) as NoteAssistantRequest;
    const payload = sanitizeAssistantPayload(rawPayload);

    if (!payload.question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const messages: OpenAIInputItem[] = [
      toInputItem("system", buildAssistantSystemPrompt()),
      ...payload.history.map((item) => toInputItem(item.role, item.content)),
      toInputItem("user", buildAssistantUserPrompt(payload)),
    ];
    const modelName = resolveModelName(payload.model);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 45_000);

    const chatResponse = await createChatCompletionsStream(messages, modelName, abortController.signal);

    if (chatResponse.ok) {
      clearTimeout(timeout);
      return streamChatResponse(chatResponse, abortController);
    }

    clearTimeout(timeout);
    const json = (await chatResponse.json().catch(() => null)) as unknown;
    return NextResponse.json(
      {
        error: `AI provider returned an error. chat_completions: HTTP ${chatResponse.status} - ${extractProviderMessage(json)}`,
      },
      { status: 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected assistant error.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
