/**
 * API helpers for StudyBuddy backend. All requests that need auth
 * should pass the Clerk JWT via getToken().
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
  /\/+$/,
  ""
);

export type ConversationItem = { id: string; created_at: string; title?: string };
export type MessageItem = { id: string; question: string; answer: string; created_at: string };

export async function fetchConversations(token: string | null): Promise<ConversationItem[]> {
  if (!token) return [];
  const res = await fetch(`${API_URL}/api/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchMessages(
  conversationId: string,
  token: string | null
): Promise<MessageItem[]> {
  if (!token) return [];
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function askQuestion(
  question: string,
  token: string | null,
  conversationId: string | null
): Promise<{ answer: string; conversation_id: string | null; error?: string }> {
  const res = await fetch(`${API_URL}/api/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      question: question.trim(),
      conversation_id: conversationId || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).join(", ")
      : typeof detail === "string"
        ? detail
        : `Request failed: ${res.status}`;
    return { answer: "", conversation_id: null, error: message || `Request failed: ${res.status}` };
  }
  return {
    answer: data.answer ?? "",
    conversation_id: data.conversation_id ?? null,
  };
}

export type StreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: (conversationId: string | null) => void;
  onError: (message: string) => void;
};

export async function askQuestionStream(
  question: string,
  token: string | null,
  conversationId: string | null,
  callbacks: StreamCallbacks
): Promise<void> {
  if (!token) {
    callbacks.onError("Please sign in to chat.");
    return;
  }
  const res = await fetch(`${API_URL}/api/ask/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question: question.trim(),
      conversation_id: conversationId || undefined,
    }),
  });

  // Fallback: if stream endpoint doesn't exist (404), use non-streaming /api/ask
  if (res.status === 404) {
    const result = await askQuestion(question, token, conversationId);
    if (result.error) {
      callbacks.onError(result.error);
      return;
    }
    if (result.answer) callbacks.onChunk(result.answer);
    callbacks.onDone(result.conversation_id);
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).join(", ")
      : typeof detail === "string"
        ? detail
        : `Request failed: ${res.status}`;
    callbacks.onError(message || `Request failed: ${res.status}`);
    return;
  }
  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  function processBuffer() {
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const trimmed = event.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const raw = trimmed.slice(6).trim();
      if (raw === "[DONE]" || raw === "") continue;
      try {
        const data = JSON.parse(raw) as { content?: string; done?: boolean; conversation_id?: string | null };
        if (data.content) callbacks.onChunk(data.content);
        if (data.done) callbacks.onDone(data.conversation_id ?? null);
      } catch {
        // ignore parse errors for partial chunks
      }
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      processBuffer();
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
