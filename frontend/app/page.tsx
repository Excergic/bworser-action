"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
  useAuth,
} from "@clerk/nextjs";
import { Show } from "@clerk/nextjs";
import {
  fetchConversations,
  fetchMessages,
  askQuestionStream,
  type ConversationItem,
  type MessageItem,
} from "@/lib/api";
import { MessageContent } from "@/app/components/MessageContent";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatConversationDate(createdAt: string): string {
  const d = new Date(createdAt);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const { isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const messagesLoadIdRef = useRef<string | null>(null);
  const skipNextLoadRef = useRef(false);

  // Sync dark mode state with document (after anti-FOUC script runs in layout)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("studymate-theme");
      if (stored === "dark") setIsDark(true);
    } catch {}
  }, []);

  // Persist selected conversation to localStorage
  useEffect(() => {
    try {
      if (selectedId) {
        localStorage.setItem("studymate-selected-id", selectedId);
      } else {
        localStorage.removeItem("studymate-selected-id");
      }
    } catch {}
  }, [selectedId]);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    try {
      localStorage.setItem("studymate-theme", next ? "dark" : "light");
    } catch {}
    document.documentElement.setAttribute("data-theme", next ? "dark" : "");
  }

  const loadConversations = useCallback(async () => {
    if (!getToken) return;
    const token = await getToken();
    const list = await fetchConversations(token ?? null);
    setConversations(list);
    // Restore last selected conversation across page refreshes
    try {
      const stored = localStorage.getItem("studymate-selected-id");
      if (stored && list.some((c: ConversationItem) => c.id === stored)) {
        setSelectedId(stored);
      }
    } catch {}
  }, [getToken]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!getToken) return;
      messagesLoadIdRef.current = conversationId;
      const token = await getToken();
      setMessagesLoading(true);
      setMessages([]);
      try {
        const list = await fetchMessages(conversationId, token ?? null);
        if (messagesLoadIdRef.current === conversationId) {
          setMessages(list);
        }
      } finally {
        if (messagesLoadIdRef.current === conversationId) {
          setMessagesLoading(false);
        }
      }
    },
    [getToken]
  );

  useEffect(() => {
    if (!userLoaded || !getToken) return;
    loadConversations();
  }, [userLoaded, getToken, loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    setMessages([]);
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  async function handleAsk() {
    const q = query.trim();
    if (!q || loading) return;
    if (!getToken) {
      setError("Please sign in to chat.");
      return;
    }
    const token = await getToken();
    if (!token) {
      setError("Please sign in to chat.");
      return;
    }
    setLoading(true);
    setError(null);
    setQuery("");
    const streamId = crypto.randomUUID();
    const newMsg: MessageItem = {
      id: streamId,
      question: q,
      answer: "",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
    try {
      await askQuestionStream(
        q,
        token,
        selectedId,
        {
          onChunk: (chunk) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.id !== streamId) return prev;
              return [...prev.slice(0, -1), { ...last, answer: last.answer + chunk }];
            });
          },
          onDone: (conversation_id) => {
            if (conversation_id && conversation_id !== selectedId) {
              skipNextLoadRef.current = true;
              setSelectedId(conversation_id);
              setConversations((prev: ConversationItem[]) => {
                if (prev.some((c: ConversationItem) => c.id === conversation_id)) return prev;
                const title = q.length > 60 ? q.slice(0, 60) + "..." : q;
                return [{ id: conversation_id, created_at: newMsg.created_at, title }, ...prev];
              });
            }
          },
          onError: setError,
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleNewChat() {
    setSelectedId(null);
    setMessages([]);
    setError(null);
  }

  const showCentered = messages.length === 0 && !loading && !messagesLoading;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-3 flex items-center justify-between border-b border-[var(--border)] min-h-[56px]">
          <Link href="/" className="flex items-center gap-2 truncate">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: "var(--accent-grad)" }}
            >
              📚
            </div>
            <span
              className="text-[14px] font-bold tracking-tight text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              StudyMate
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen((o: boolean) => !o)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors duration-150 flex-shrink-0"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
        {sidebarOpen && (
          <>
            <button
              type="button"
              onClick={handleNewChat}
              className="mx-3 mt-3 py-2 px-3 rounded-xl border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all duration-200 flex items-center gap-2"
            >
              <span style={{ color: "var(--accent)" }}>+</span>
              New chat
            </button>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <p className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">
                History
              </p>
              {conversations.length === 0 && (
                <p className="px-3 py-2 text-[var(--text-muted)] text-xs">No conversations yet.</p>
              )}
              <ul className="space-y-0.5">
                {conversations.map((c: ConversationItem) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left py-2 px-3 rounded-xl text-xs truncate transition-all duration-200 ${
                        selectedId === c.id
                          ? "bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="block truncate font-medium">
                        {c.title || "New chat"}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-muted)] block mt-0.5">
                        {formatConversationDate(c.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-5 border-b border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-md shadow-[0_1px_12px_rgba(0,0,0,0.06)] flex-shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors duration-150"
                aria-label="Open sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <span
              className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              StudyMate
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
            >
              AI
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark / light mode toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors duration-150"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="5" strokeWidth={2} />
                  <path strokeLinecap="round" strokeWidth={2} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
            {userLoaded && (
              <>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button
                      type="button"
                      className="rounded-full text-sm font-semibold px-4 py-2 text-white transition-all duration-200 hover:shadow-[0_4px_12px_rgba(14,165,233,0.35)] hover:-translate-y-0.5"
                      style={{ background: "var(--accent-grad)" }}
                    >
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <UserButton
                    appearance={{
                      elements: { avatarBox: "w-8 h-8" },
                    }}
                  />
                </Show>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden">
          {showCentered ? (
            /* Claude-like centered layout when no messages */
            <div className="flex-1 flex flex-col items-center justify-center px-5 bg-[var(--bg-base)]">
              <div className="w-full max-w-2xl animate-fade-up">
                <div className="text-center mb-8">
                  <h1
                    style={{ fontFamily: "var(--font-display)" }}
                    className="text-[2.2rem] font-extrabold leading-[1.15] tracking-tight text-[var(--text-primary)] mb-2"
                  >
                    {getGreeting()}
                  </h1>
                  <p className="text-[var(--text-secondary)] text-base">
                    How can I help you today?
                  </p>
                </div>
                {error && (
                  <div className="mb-3 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] px-4 py-3 text-[var(--danger)] text-sm">
                    {error}
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-4 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-glow)] transition-all duration-200 shadow-sm">
                  <input
                    type="text"
                    value={query}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="What would you like me to help with?"
                    className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm outline-none min-w-0"
                    disabled={loading}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter" && query.trim()) handleAsk();
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAsk}
                    disabled={!query.trim()}
                    className={`rounded-xl text-sm font-semibold px-5 py-2.5 text-white transition-all duration-200 flex-shrink-0 ${
                      query.trim()
                        ? "shadow-[0_4px_18px_var(--accent-glow)] hover:shadow-[0_6px_26px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                    style={{ background: "var(--accent-grad)" }}
                  >
                    Ask
                  </button>
                </div>
                <p className="text-center text-[11px] text-[var(--text-muted)] mt-3">
                  Press{" "}
                  <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--bg-raised)] border border-[var(--border)] font-mono text-[10px]">
                    Enter
                  </kbd>{" "}
                  to send
                </p>
              </div>
            </div>
          ) : (
            /* Normal chat layout */
            <>
              <div className="flex-1 overflow-y-auto px-5 py-8 bg-[var(--bg-base)]">
                <div className="max-w-2xl mx-auto">
                  {messagesLoading && (
                    <div className="flex justify-center py-8">
                      <span className="inline-block w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!messagesLoading && messages.length > 0 && (
                    <div className="space-y-6 pb-4">
                      {messages.map((m: MessageItem) => (
                        <div
                          key={m.id}
                          className="bg-[var(--bg-surface)] rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-[var(--border)]"
                        >
                          <div className="px-6 py-4 border-b border-[var(--border)]">
                            <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1.5">
                              Your question
                            </p>
                            <p className="text-[var(--text-primary)] text-[15px] leading-relaxed">{m.question}</p>
                          </div>
                          <div className="px-6 py-5">
                            <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-3">
                              Answer
                            </p>
                            {m.answer ? (
                              <MessageContent content={m.answer} />
                            ) : (
                              <span className="inline-flex items-center gap-2 text-[var(--text-muted)] text-sm">
                                <span className="inline-block w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                                Thinking...
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 p-4 border-t border-[var(--border)] bg-[var(--bg-surface)]">
                <div className="max-w-2xl mx-auto">
                  {error && (
                    <div className="mb-3 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] px-4 py-3 text-[var(--danger)] text-sm">
                      {error}
                    </div>
                  )}
                  <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-3.5 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-glow)] transition-all duration-200 shadow-sm">
                    <input
                      type="text"
                      value={query}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                      placeholder="Ask a follow-up..."
                      className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm outline-none min-w-0"
                      disabled={loading}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter" && query.trim()) handleAsk();
                      }}
                    />
                    {loading ? (
                      <span className="inline-block w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <button
                        type="button"
                        onClick={handleAsk}
                        disabled={!query.trim()}
                        className={`rounded-xl text-sm font-semibold px-5 py-2.5 text-white transition-all duration-200 flex-shrink-0 ${
                          query.trim()
                            ? "shadow-[0_4px_18px_var(--accent-glow)] hover:shadow-[0_6px_26px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                            : "opacity-40 cursor-not-allowed"
                        }`}
                        style={{ background: "var(--accent-grad)" }}
                      >
                        Ask
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
