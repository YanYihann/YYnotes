import type { NoteAssistantRequest } from "@/lib/ai/note-assistant";

export type NoteAssistantResponse = {
  answer: string;
};

export async function askNoteAssistant(payload: NoteAssistantRequest): Promise<NoteAssistantResponse> {
  const response = await fetch("/api/notes-assistant", {
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
