import type { NoteAssistantRequest } from "@/lib/ai/note-assistant";

export type NoteAssistantResponse = {
  answer: string;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

export async function askNoteAssistant(payload: NoteAssistantRequest): Promise<NoteAssistantResponse> {
  const endpoint =
    CLOUD_API_BASE.length > 0
      ? `${normalizeApiBase(CLOUD_API_BASE)}/assistant`
      : "/api/notes-assistant";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

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
