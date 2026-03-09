"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
  sources?: string[];
}

interface HistoryItem {
  id: string;
  question: string;
  answer: string;
  steps: string[];
  sources: string[];
  created_at: string;
}

export default function Home() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchHistory() {
    const token = await getToken();
    const res = await fetch(`${API}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setHistory(await res.json());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const token = await getToken();
      const res = await fetch(`${API}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          steps: data.steps,
          sources: data.sources,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", flexDirection: "column" }}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.logo}>StudyBuddy</span>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            style={styles.ghostBtn}
            onClick={() => { setShowHistory((v) => !v); if (!showHistory) fetchHistory(); }}
          >
            {showHistory ? "Chat" : "History"}
          </button>
          <UserButton />
        </div>
      </header>

      {showHistory ? (
        /* History panel */
        <div style={styles.historyPanel}>
          <h2 style={{ marginBottom: "1rem", color: "var(--muted)" }}>Query history</h2>
          {history.length === 0 && <p style={{ color: "var(--muted)" }}>No history yet.</p>}
          {history.map((item) => (
            <div key={item.id} style={styles.historyCard}>
              <p style={{ fontWeight: 600 }}>{item.question}</p>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                {new Date(item.created_at).toLocaleString()}
              </p>
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>{item.answer.slice(0, 200)}…</p>
            </div>
          ))}
        </div>
      ) : (
        /* Chat panel */
        <>
          <div style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.empty}>
                <p style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
                  Ask me anything about computer engineering
                </p>
                <div style={styles.chips}>
                  {["Operating Systems", "Data Structures", "Computer Networks", "Databases", "Algorithms"].map((t) => (
                    <button key={t} style={styles.chip} onClick={() => setInput(`Explain ${t}`)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{ ...styles.bubble, ...(msg.role === "user" ? styles.userBubble : styles.aiBubble) }}
              >
                <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
                {msg.steps && msg.steps.length > 0 && (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem" }}>
                      {msg.steps.length} reasoning step{msg.steps.length > 1 ? "s" : ""}
                    </summary>
                    <ol style={{ paddingLeft: "1rem", marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                      {msg.steps.map((s, j) => <li key={j}>{s}</li>)}
                    </ol>
                  </details>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" }}>
                    Sources: {msg.sources.join(" · ")}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ ...styles.bubble, ...styles.aiBubble }}>
                <span style={{ color: "var(--muted)" }}>Thinking…</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} style={styles.inputRow}>
            <input
              style={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a computer engineering question…"
              disabled={loading}
            />
            <button type="submit" style={styles.sendBtn} disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1.5rem",
    borderBottom: "1px solid #27272a",
    flexShrink: 0,
  },
  logo: { fontWeight: 700, fontSize: "1.1rem" },
  ghostBtn: {
    background: "none",
    border: "1px solid #3f3f46",
    color: "var(--text)",
    padding: "0.4rem 0.9rem",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  empty: { margin: "auto", textAlign: "center", color: "var(--muted)" },
  chips: { display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" },
  chip: {
    background: "#18181b",
    border: "1px solid #3f3f46",
    color: "var(--text)",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  bubble: { maxWidth: "720px", padding: "0.75rem 1rem", borderRadius: "10px", lineHeight: 1.6 },
  userBubble: { alignSelf: "flex-end", background: "#3f3f46" },
  aiBubble: { alignSelf: "flex-start", background: "#18181b", border: "1px solid #27272a" },
  inputRow: {
    display: "flex",
    gap: "0.5rem",
    padding: "1rem 1.5rem",
    borderTop: "1px solid #27272a",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: "0.65rem 1rem",
    borderRadius: "8px",
    border: "1px solid #3f3f46",
    background: "#18181b",
    color: "var(--text)",
    fontSize: "0.95rem",
    outline: "none",
  },
  sendBtn: {
    padding: "0.65rem 1.25rem",
    borderRadius: "8px",
    border: "none",
    background: "#6366f1",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  historyPanel: { flex: 1, overflowY: "auto", padding: "1.5rem" },
  historyCard: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "8px",
    padding: "1rem",
    marginBottom: "0.75rem",
  },
};
