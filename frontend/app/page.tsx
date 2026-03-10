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

const SUGGESTIONS = [
  "Explain recursion with a simple example",
  "What are the key concepts in linear algebra?",
  "Summarize the causes of World War I",
  "How does photosynthesis work?",
];

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
  const messagesLoadIdRef = useRef<string | null>(null);
  const skipNextLoadRef = useRef(false);

  const loadConversations = useCallback(async () => {
    if (!getToken) return;
    const token = await getToken();
    const list = await fetchConversations(token ?? null);
    setConversations(list);
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

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-zinc-100 flex">
      {/* Sidebar - History Dashboard */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } flex-shrink-0 border-r border-zinc-800 bg-zinc-950/80 flex flex-col transition-all overflow-hidden`}
      >
        <div className="p-3 flex items-center justify-between border-b border-zinc-800 min-h-[56px]">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-zinc-100 hover:text-white truncate"
          >
            StudyBuddy
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen((o: boolean) => !o)}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
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
              className="m-3 py-2.5 px-3 rounded-lg border border-zinc-700 bg-zinc-800/50 text-sm text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <span className="text-zinc-400">+</span>
              New chat
            </button>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <p className="px-2 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                History
              </p>
              {conversations.length === 0 && (
                <p className="px-2 py-2 text-zinc-500 text-sm">No conversations yet.</p>
              )}
              <ul className="space-y-0.5">
                {conversations.map((c: ConversationItem) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left py-2 px-3 rounded-lg text-sm truncate transition-colors ${
                        selectedId === c.id
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                      }`}
                    >
                      <span className="block truncate">
                        {c.title || "New chat"}
                      </span>
                      <span className="text-xs text-zinc-500 block mt-0.5">
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
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300"
                aria-label="Open sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <span className="text-sm font-medium text-zinc-400">StudyBuddy</span>
          </div>
          <div className="flex items-center gap-3">
            {userLoaded && (
              <>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button
                      type="button"
                      className="rounded-full bg-white text-black text-sm font-medium px-4 py-2 hover:bg-zinc-200 transition-colors"
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
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-2xl mx-auto">
              {messages.length === 0 && !loading && (
                <div className="text-center py-12">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">
                    StudyBuddy
                  </h1>
                  <p className="text-zinc-500 text-sm sm:text-base mb-8">
                    Ask anything. Get clear, reliable answers. Your history appears in the sidebar.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setQuery(s)}
                        className="rounded-full border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messagesLoading && (
                <div className="flex justify-center py-8">
                  <span className="inline-block w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!messagesLoading && messages.length > 0 && (
                <div className="space-y-6 pb-4">
                  {messages.map((m: MessageItem) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-zinc-700/80 bg-zinc-900/60 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-zinc-700/80">
                        <p className="text-zinc-400 text-sm font-medium">Your question</p>
                        <p className="text-zinc-100 mt-1">{m.question}</p>
                      </div>
                      <div className="px-4 py-4">
                        <p className="text-zinc-400 text-sm font-medium mb-2">Answer</p>
                        {m.answer ? (
                          <MessageContent content={m.answer} />
                        ) : (
                          <span className="inline-flex items-center gap-2 text-zinc-500 text-sm">
                            <span className="inline-block w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
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

          <div className="flex-shrink-0 p-4 border-t border-zinc-800 bg-[#0f0f0f]">
            <div className="max-w-2xl mx-auto">
              {error && (
                <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-3 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 backdrop-blur-sm px-4 py-3.5 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500/50 transition-all">
                <input
                  type="text"
                  value={query}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 text-base outline-none min-w-0"
                  disabled={loading}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter" && query.trim()) handleAsk();
                  }}
                />
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <button
                    type="button"
                    onClick={handleAsk}
                    disabled={!query.trim()}
                    className={`rounded-lg text-sm font-semibold px-5 py-2.5 transition-all flex-shrink-0 cursor-pointer ${
                      query.trim()
                        ? "bg-zinc-700 text-white hover:bg-zinc-600 active:bg-zinc-800 shadow-sm"
                        : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    Ask
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
