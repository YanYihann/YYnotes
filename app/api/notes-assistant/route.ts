import { NextResponse } from "next/server";
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  extractResponseText,
  sanitizeAssistantPayload,
  type NoteAssistantRequest,
} from "@/lib/ai/note-assistant";

const DEFAULT_MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ALLOWED_MODEL_NAMES = new Set([
  "gpt-5.4-nano-2026-03-17",
  "gpt-4.1-mini",
]);
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
const RESPONSES_ENDPOINT = `${OPENAI_BASE_URL}/responses`;
const CHAT_COMPLETIONS_ENDPOINT = `${OPENAI_BASE_URL}/chat/completions`;

type AssistantRole = "system" | "user" | "assistant";

type OpenAIInputItem = {
  role: AssistantRole;
  content: Array<{ type: "input_text"; text: string }>;
};

type ProviderAttempt = {
  ok: boolean;
  answer?: string;
  status?: number;
  message?: string;
  provider: "responses" | "chat_completions";
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

function extractChatCompletionsText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const maybeText = (item as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return text;
}

async function attemptResponses(input: OpenAIInputItem[], modelName: string, signal: AbortSignal): Promise<ProviderAttempt> {
  const response = await fetch(RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
      input,
    }),
    signal,
  });

  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: extractProviderMessage(json),
      provider: "responses",
    };
  }

  const answer = extractResponseText(json);
  if (!answer) {
    return {
      ok: false,
      status: response.status,
      message: "Responses API returned success but no readable text.",
      provider: "responses",
    };
  }

  return {
    ok: true,
    answer,
    provider: "responses",
  };
}

async function attemptChatCompletions(input: OpenAIInputItem[], modelName: string, signal: AbortSignal): Promise<ProviderAttempt> {
  const response = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: flattenMessages(input),
    }),
    signal,
  });

  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: extractProviderMessage(json),
      provider: "chat_completions",
    };
  }

  const answer = extractChatCompletionsText(json);
  if (!answer) {
    return {
      ok: false,
      status: response.status,
      message: "Chat Completions API returned success but no readable text.",
      provider: "chat_completions",
    };
  }

  return {
    ok: true,
    answer,
    provider: "chat_completions",
  };
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

    const responsesAttempt = await attemptResponses(messages, modelName, abortController.signal);
    if (responsesAttempt.ok) {
      clearTimeout(timeout);
      return NextResponse.json({ answer: responsesAttempt.answer });
    }

    const chatAttempt = await attemptChatCompletions(messages, modelName, abortController.signal);
    clearTimeout(timeout);

    if (chatAttempt.ok) {
      return NextResponse.json({ answer: chatAttempt.answer });
    }

    const fallbackError = [
      `responses: HTTP ${responsesAttempt.status ?? "?"} - ${responsesAttempt.message ?? "unknown error"}`,
      `chat_completions: HTTP ${chatAttempt.status ?? "?"} - ${chatAttempt.message ?? "unknown error"}`,
    ].join(" | ");

    return NextResponse.json(
      {
        error: `AI provider returned an error. ${fallbackError}`,
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
