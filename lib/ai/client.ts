import type { NoteAssistantRequest } from "@/lib/ai/note-assistant";
import { getStoredAuthSession } from "@/lib/auth-session";

export type NoteAssistantResponse = {
  answer: string;
};

type NoteAssistantStreamOptions = {
  onDelta?: (delta: string) => void;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

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

export async function askNoteAssistant(
  payload: NoteAssistantRequest,
  options: NoteAssistantStreamOptions = {},
): Promise<NoteAssistantResponse> {
  const endpoint =
    CLOUD_API_BASE.length > 0
      ? `${normalizeApiBase(CLOUD_API_BASE)}/assistant`
      : "/api/notes-assistant";

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

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

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
    const errorMessage = json?.error || "AI assistant request failed.";
    throw new Error(errorMessage);
  }

  return {
    answer: json.answer,
  };
}
