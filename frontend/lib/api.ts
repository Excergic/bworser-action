/**
 * CompareKaro API client
 * Endpoints: /api/compare/stream, /api/purchase, /api/payment, /api/conversations
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export type ConversationItem = { id: string; created_at: string; title?: string };
export type MessageItem     = { id: string; question: string; answer: string; created_at: string };

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Compare (streaming)
// ---------------------------------------------------------------------------

export type StreamCallbacks = {
  onChunk: (chunk: string) => void;
  onDone: (conversationId: string | null) => void;
  onError: (error: string) => void;
};

export async function compareProductsStream(
  query: string,
  token: string,
  conversationId: string | null,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch(`${API_URL}/api/compare/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, conversation_id: conversationId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail;
    const msg =
      typeof detail === "string" ? detail : `Request failed: ${res.status}`;
    callbacks.onError(msg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { callbacks.onError("No response body"); return; }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.content) callbacks.onChunk(data.content);
        if (data.done) { callbacks.onDone(data.conversation_id || null); return; }
      } catch { /* ignore malformed */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Purchase — add to cart
// ---------------------------------------------------------------------------

export type PurchaseResult = {
  success: boolean;
  platform: string;
  product_name: string | null;
  product_url: string | null;
  cart_url: string | null;
  price: string | null;
  message: string;
};

export async function purchaseProduct(
  query: string,
  platform: "amazon" | "flipkart",
  email: string,
  password: string,
  token: string
): Promise<PurchaseResult> {
  const res = await fetch(`${API_URL}/api/purchase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, platform, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const message = typeof detail === "string" ? detail : `Request failed: ${res.status}`;
    return { success: false, platform, product_name: null, product_url: null, cart_url: null, price: null, message };
  }
  return data as PurchaseResult;
}

// ---------------------------------------------------------------------------
// Payment — place order
// ---------------------------------------------------------------------------

export type PaymentResult = {
  success: boolean;
  platform: string;
  order_id: string | null;
  product_name: string | null;
  amount_paid: string | null;
  delivery_date: string | null;
  delivery_address: string | null;
  payment_method: string | null;
  message: string;
};

export async function makePayment(
  query: string,
  platform: "amazon" | "flipkart",
  email: string,
  password: string,
  token: string
): Promise<PaymentResult> {
  const res = await fetch(`${API_URL}/api/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, platform, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const message = typeof detail === "string" ? detail : `Request failed: ${res.status}`;
    return {
      success: false, platform, order_id: null, product_name: null,
      amount_paid: null, delivery_date: null, delivery_address: null,
      payment_method: null, message,
    };
  }
  return data as PaymentResult;
}
