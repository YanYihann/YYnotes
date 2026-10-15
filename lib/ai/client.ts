import type { NoteAssistantRequest } from "@/lib/ai/note-assistant";
import { getStoredAuthSession } from "@/lib/auth-session";

export type NoteAssistantResponse = {
  answer: string;
};

type NoteAssistantStreamOptions = {
  onDelta?: (delta: string) => void;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const LOCAL_ASSISTANT_ENDPOINT = "/api/notes-assistant";

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function extractSseDataLines(buffer: string): { events: string[]; remainder: string } {
  const chunks = buffer.split(/\r?\n\r?\n/);
  const remainder = chunks.pop() ?? "";
  const events = chunks
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n"),
    )
    .filter(Boolean);

  return { events, remainder };
}

async function readAssistantStream(response: Response, onDelta?: (delta: string) => void): Promise<string> {
  if (!response.body) {
    throw new Error("AI assistant stream is not readable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let answer = "";
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = extractSseDataLines(buffer);
    buffer = parsed.remainder;

    for (const eventData of parsed.events) {
      if (eventData === "[DONE]") {
        continue;
      }

      const payload = JSON.parse(eventData) as { delta?: string; error?: string };
      if (payload.error) {
        throw new Error(payload.error);
      }

      if (payload.delta) {
        answer += payload.delta;
        onDelta?.(payload.delta);
      }
    }
  }

  const finalText = decoder.decode();
  if (finalText) {
    buffer += finalText;
  }

  const parsed = extractSseDataLines(buffer);
  for (const eventData of parsed.events) {
    if (eventData === "[DONE]") {
      continue;
    }

    const payload = JSON.parse(eventData) as { delta?: string; error?: string };
    if (payload.error) {
      throw new Error(payload.error);
    }
    if (payload.delta) {
      answer += payload.delta;
      onDelta?.(payload.delta);
    }
  }

  return answer.trim();
}

function isFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === "TypeError" ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

function buildNetworkErrorMessage(endpoint: string): string {
  const isCloudEndpoint = endpoint.startsWith("http://") || endpoint.startsWith("https://");
  if (isCloudEndpoint) {
    return "云端 AI 助手接口连接失败。已尝试连接远程 Notes API，但浏览器网络请求失败；请检查网络、代理或 Worker 是否可访问。";
  }

  return "本地 AI 助手接口连接失败。请确认 Next.js 开发服务正在运行，并且当前页面与服务地址一致。";
}

function shouldFallbackToLocal(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.message.startsWith("云端 AI 助手接口连接失败") ||
    message.includes("ai provider returned an error") ||
    message.includes("not allowed by this api key") ||
    message.includes("openai_api_key is missing")
  );
}

async function requestAssistantEndpoint(
  endpoint: string,
  payload: NoteAssistantRequest,
  headers: Record<string, string>,
  options: NoteAssistantStreamOptions,
): Promise<NoteAssistantResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (isFetchNetworkError(error)) {
      throw new Error(buildNetworkErrorMessage(endpoint));
    }
    throw error;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && contentType.includes("text/event-stream")) {
    const answer = await readAssistantStream(response, options.onDelta);
    if (!answer) {
      throw new Error("AI assistant returned an empty answer.");
    }
    return { answer };
  }

  const json = (await response.json().catch(() => null)) as
    | { answer?: string; error?: string }
    | null;

  if (!response.ok || !json?.answer) {
    const errorMessage = json?.error || `AI assistant request failed with HTTP ${response.status}.`;
    throw new Error(errorMessage);
  }

  return {
    answer: json.answer,
  };
}

export async function askNoteAssistant(
  payload: NoteAssistantRequest,
  options: NoteAssistantStreamOptions = {},
): Promise<NoteAssistantResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (CLOUD_API_BASE.length > 0) {
    const session = getStoredAuthSession();
    if (session?.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }
  }

  if (!CLOUD_API_BASE.length) {
    return requestAssistantEndpoint(LOCAL_ASSISTANT_ENDPOINT, payload, headers, options);
  }

  const cloudEndpoint = `${normalizeApiBase(CLOUD_API_BASE)}/assistant`;
  try {
    return await requestAssistantEndpoint(cloudEndpoint, payload, headers, options);
  } catch (error) {
    if (CLOUD_API_BASE.startsWith("/") || !shouldFallbackToLocal(error)) {
      throw error;
    }

    try {
      return await requestAssistantEndpoint(LOCAL_ASSISTANT_ENDPOINT, payload, headers, options);
    } catch (fallbackError) {
      const cloudMessage = error instanceof Error ? error.message : "云端 AI 助手请求失败。";
      const localMessage = fallbackError instanceof Error ? fallbackError.message : "本地 AI 助手请求失败。";
      throw new Error(`${cloudMessage} 本地回退也失败：${localMessage}`);
    }
  }
}
