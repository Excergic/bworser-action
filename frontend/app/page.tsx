"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
  useAuth,
  Show,
} from "@clerk/nextjs";
import {
  fetchConversations,
  fetchMessages,
  compareProductsStream,
  purchaseProduct,
  makePayment,
  type ConversationItem,
  type MessageItem,
  type PurchaseResult,
  type PaymentResult,
} from "@/lib/api";
import { MessageContent } from "@/app/components/MessageContent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(createdAt: string): string {
  const d = new Date(createdAt);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isComparison(answer: string): boolean {
  return answer.includes("Product Comparison") || answer.includes("Amazon") && answer.includes("Flipkart");
}

// ---------------------------------------------------------------------------
// Credential Modal
// ---------------------------------------------------------------------------

type ModalAction = {
  query: string;
  platform: "amazon" | "flipkart";
  messageId: string;
  mode: "cart" | "payment";
};

function CredentialModal({
  action,
  onSubmit,
  onClose,
}: {
  action: ModalAction;
  onSubmit: (email: string, password: string) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const platformName = action.platform === "amazon" ? "Amazon.in" : "Flipkart";
  const platformColor = action.platform === "amazon" ? "#FF9900" : "#2874F0";
  const isPayment = action.mode === "payment";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
            style={{ background: platformColor }}
          >
            {action.platform === "amazon" ? "A" : "F"}
          </div>
          <div>
            <p className="text-[var(--text-primary)] font-semibold text-sm">
              {isPayment ? `Buy on ${platformName}` : `Add to Cart — ${platformName}`}
            </p>
            <p className="text-[var(--text-muted)] text-xs truncate max-w-[220px]">
              {action.query}
            </p>
          </div>
        </div>

        {isPayment && (
          <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ This will place a <strong>real order</strong> using your saved address &amp; payment method.
          </div>
        )}

        <div className="mb-3 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-xs text-[var(--text-muted)]">
          🔒 Your credentials are sent directly to {platformName} via browser — never stored by us.
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {platformName} Email / Phone
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter" && email && password) onSubmit(email, password);
              }}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!email || !password}
            onClick={() => onSubmit(email, password)}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: platformColor }}
          >
            {isPayment ? "Place Order" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ActionState = {
  loading: boolean;
  result: PurchaseResult | PaymentResult | null;
};

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

  // Per-message action state: messageId → platform → ActionState
  const [actionState, setActionState] = useState<
    Record<string, Record<string, ActionState>>
  >({});

  // Credential modal
  const [modalAction, setModalAction] = useState<ModalAction | null>(null);

  const messagesLoadIdRef = useRef<string | null>(null);
  const skipNextLoadRef = useRef(false);

  // Theme
  useEffect(() => {
    try {
      const stored = localStorage.getItem("comparekaro-theme");
      if (stored === "dark") setIsDark(true);
    } catch {}
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    try { localStorage.setItem("comparekaro-theme", next ? "dark" : "light"); } catch {}
    document.documentElement.setAttribute("data-theme", next ? "dark" : "");
  }

  // Conversations
  const loadConversations = useCallback(async () => {
    if (!getToken) return;
    const token = await getToken();
    const list = await fetchConversations(token ?? null);
    setConversations(list);
    try {
      const stored = localStorage.getItem("comparekaro-selected-id");
      if (stored && list.some((c: ConversationItem) => c.id === stored)) setSelectedId(stored);
    } catch {}
  }, [getToken]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!getToken) return;
    messagesLoadIdRef.current = conversationId;
    const token = await getToken();
    setMessagesLoading(true);
    setMessages([]);
    try {
      const list = await fetchMessages(conversationId, token ?? null);
      if (messagesLoadIdRef.current === conversationId) setMessages(list);
    } finally {
      if (messagesLoadIdRef.current === conversationId) setMessagesLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!userLoaded || !getToken) return;
    loadConversations();
  }, [userLoaded, getToken, loadConversations]);

  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem("comparekaro-selected-id", selectedId);
      else localStorage.removeItem("comparekaro-selected-id");
    } catch {}
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); setMessagesLoading(false); return; }
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }
    setMessages([]);
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // ---------------------------------------------------------------------------
  // Compare
  // ---------------------------------------------------------------------------

  async function handleCompare() {
    const q = query.trim();
    if (!q || loading) return;
    if (!getToken) { setError("Please sign in."); return; }
    const token = await getToken();
    if (!token) { setError("Please sign in."); return; }

    setLoading(true);
    setError(null);
    setQuery("");

    const streamId = crypto.randomUUID();
    const newMsg: MessageItem = { id: streamId, question: q, answer: "", created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, newMsg]);

    try {
      await compareProductsStream(q, token, selectedId, {
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
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Purchase / Payment actions
  // ---------------------------------------------------------------------------

  function openModal(messageId: string, query: string, platform: "amazon" | "flipkart", mode: "cart" | "payment") {
    setModalAction({ messageId, query, platform, mode });
  }

  async function handleModalSubmit(email: string, password: string) {
    if (!modalAction || !getToken) return;
    const { messageId, query, platform, mode } = modalAction;
    setModalAction(null);

    const token = await getToken();
    if (!token) return;

    setActionState((prev) => ({
      ...prev,
      [messageId]: { ...(prev[messageId] || {}), [`${platform}-${mode}`]: { loading: true, result: null } },
    }));

    const result = mode === "cart"
      ? await purchaseProduct(query, platform, email, password, token)
      : await makePayment(query, platform, email, password, token);

    setActionState((prev) => ({
      ...prev,
      [messageId]: { ...(prev[messageId] || {}), [`${platform}-${mode}`]: { loading: false, result } },
    }));
  }

  function handleNewChat() {
    setSelectedId(null);
    setMessages([]);
    setError(null);
  }

  const showCentered = messages.length === 0 && !loading && !messagesLoading;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex">
      {modalAction && (
        <CredentialModal
          action={modalAction}
          onSubmit={handleModalSubmit}
          onClose={() => setModalAction(null)}
        />
      )}

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
              🛒
            </div>
            <span
              className="text-[14px] font-bold tracking-tight text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              CompareKaro
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors duration-150 flex-shrink-0"
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
              New comparison
            </button>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <p className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">
                History
              </p>
              {conversations.length === 0 && (
                <p className="px-3 py-2 text-[var(--text-muted)] text-xs">No comparisons yet.</p>
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
                        {(c.title || "Comparison").replace("[Compare] ", "")}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-muted)] block mt-0.5">
                        {formatDate(c.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-5 border-b border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-md shadow-[0_1px_12px_rgba(0,0,0,0.06)] flex-shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors duration-150"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]" style={{ fontFamily: "var(--font-display)" }}>
              CompareKaro
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
            >
              AI
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] transition-colors duration-150"
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
                    <button type="button" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button
                      type="button"
                      className="rounded-full text-sm font-semibold px-4 py-2 text-white hover:shadow-[0_4px_12px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 transition-all"
                      style={{ background: "var(--accent-grad)" }}
                    >
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
                </Show>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden">
          {showCentered ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center px-5 bg-[var(--bg-base)]">
              <div className="w-full max-w-2xl animate-fade-up">
                <div className="text-center mb-8">
                  <h1
                    className="text-[2.2rem] font-extrabold leading-[1.15] tracking-tight text-[var(--text-primary)] mb-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Compare before you buy
                  </h1>
                  <p className="text-[var(--text-secondary)] text-base">
                    Search any product — get price, specs &amp; reviews from Amazon &amp; Flipkart side by side.
                  </p>
                </div>
                {error && (
                  <div className="mb-3 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] px-4 py-3 text-[var(--danger)] text-sm">
                    {error}
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-4 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-glow)] transition-all shadow-sm">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Try "iPhone 15", "Sony WH-1000XM5", "boAt headphones under 2000"'
                    className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm outline-none min-w-0"
                    disabled={loading}
                    onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) handleCompare(); }}
                  />
                  <button
                    type="button"
                    onClick={handleCompare}
                    disabled={!query.trim() || loading}
                    className={`rounded-xl text-sm font-semibold px-5 py-2.5 text-white transition-all flex-shrink-0 ${
                      query.trim() && !loading
                        ? "shadow-[0_4px_18px_var(--accent-glow)] hover:shadow-[0_6px_26px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                    style={{ background: "var(--accent-grad)" }}
                  >
                    {loading ? "Searching..." : "Compare"}
                  </button>
                </div>
                <p className="text-center text-[11px] text-[var(--text-muted)] mt-3">
                  Press <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--bg-raised)] border border-[var(--border)] font-mono text-[10px]">Enter</kbd> to compare
                </p>
              </div>
            </div>
          ) : (
            /* Chat layout */
            <>
              <div className="flex-1 overflow-y-auto px-5 py-8 bg-[var(--bg-base)]">
                <div className="max-w-3xl mx-auto">
                  {messagesLoading && (
                    <div className="flex justify-center py-8">
                      <span className="inline-block w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!messagesLoading && messages.length > 0 && (
                    <div className="space-y-6 pb-4">
                      {messages.map((m: MessageItem) => {
                        const compResult = isComparison(m.answer);
                        // Strip the "[Compare] " prefix shown in history
                        const displayQuestion = m.question.replace(/^\[Compare\]\s*/i, "");
                        return (
                          <div
                            key={m.id}
                            className="bg-[var(--bg-surface)] rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-[var(--border)]"
                          >
                            {/* Question */}
                            <div className="px-6 py-4 border-b border-[var(--border)]">
                              <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1.5">
                                Comparing
                              </p>
                              <p className="text-[var(--text-primary)] text-[15px] leading-relaxed">{displayQuestion}</p>
                            </div>

                            {/* Answer */}
                            <div className="px-6 py-5">
                              {m.answer ? (
                                <>
                                  <MessageContent content={m.answer} />

                                  {/* Buy / Pay actions */}
                                  {compResult && (
                                    <div className="mt-6 pt-5 border-t border-[var(--border)]">
                                      <p className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-4">
                                        Ready to buy?
                                      </p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {(["amazon", "flipkart"] as const).map((platform) => {
                                          const pName = platform === "amazon" ? "Amazon.in" : "Flipkart";
                                          const pColor = platform === "amazon" ? "#FF9900" : "#2874F0";
                                          const cartKey = `${platform}-cart`;
                                          const payKey = `${platform}-payment`;
                                          const cartState = actionState[m.id]?.[cartKey];
                                          const payState = actionState[m.id]?.[payKey];

                                          return (
                                            <div key={platform} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                                              <div className="flex items-center gap-2 mb-1">
                                                <div
                                                  className="w-6 h-6 rounded-lg text-white text-xs font-bold flex items-center justify-center"
                                                  style={{ background: pColor }}
                                                >
                                                  {platform === "amazon" ? "A" : "F"}
                                                </div>
                                                <span className="text-sm font-semibold text-[var(--text-primary)]">{pName}</span>
                                              </div>

                                              {/* Add to Cart */}
                                              <button
                                                type="button"
                                                disabled={cartState?.loading}
                                                onClick={() => openModal(m.id, displayQuestion, platform, "cart")}
                                                className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ background: pColor }}
                                              >
                                                {cartState?.loading ? (
                                                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Adding...</>
                                                ) : "🛒 Add to Cart"}
                                              </button>

                                              {/* Buy Now (payment) */}
                                              <button
                                                type="button"
                                                disabled={payState?.loading}
                                                onClick={() => openModal(m.id, displayQuestion, platform, "payment")}
                                                className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium border transition-all hover:bg-[var(--bg-raised)] disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ borderColor: pColor, color: pColor }}
                                              >
                                                {payState?.loading ? (
                                                  <><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" /> Processing...</>
                                                ) : "⚡ Buy Now"}
                                              </button>

                                              {/* Cart result */}
                                              {cartState?.result && (
                                                <div className={`rounded-lg px-3 py-2 text-xs ${
                                                  cartState.result.success
                                                    ? "bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400"
                                                    : "bg-red-500/10 border border-red-500/30 text-[var(--danger)]"
                                                }`}>
                                                  {cartState.result.success ? "✅ " : "❌ "}
                                                  {cartState.result.message}
                                                  {cartState.result.success && (cartState.result as PurchaseResult).cart_url && (
                                                    <> · <a href={(cartState.result as PurchaseResult).cart_url!} target="_blank" rel="noopener noreferrer" className="underline font-medium">View Cart</a></>
                                                  )}
                                                </div>
                                              )}

                                              {/* Payment result */}
                                              {payState?.result && (
                                                <div className={`rounded-lg px-3 py-2 text-xs space-y-1 ${
                                                  payState.result.success
                                                    ? "bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400"
                                                    : "bg-red-500/10 border border-red-500/30 text-[var(--danger)]"
                                                }`}>
                                                  {payState.result.success ? "✅ Order placed!" : "❌ "}
                                                  {payState.result.message}
                                                  {payState.result.success && (() => {
                                                    const r = payState.result as PaymentResult;
                                                    return (
                                                      <div className="mt-1 space-y-0.5 text-[11px] opacity-80">
                                                        {r.order_id && <p>Order ID: <strong>{r.order_id}</strong></p>}
                                                        {r.amount_paid && <p>Paid: <strong>{r.amount_paid}</strong></p>}
                                                        {r.delivery_date && <p>Delivery: <strong>{r.delivery_date}</strong></p>}
                                                      </div>
                                                    );
                                                  })()}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-2 text-[var(--text-muted)] text-sm">
                                  <span className="inline-block w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                                  Searching Amazon &amp; Flipkart...
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Input bar */}
              <div className="flex-shrink-0 p-4 border-t border-[var(--border)] bg-[var(--bg-surface)]">
                <div className="max-w-3xl mx-auto">
                  {error && (
                    <div className="mb-3 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] px-4 py-3 text-[var(--danger)] text-sm">
                      {error}
                    </div>
                  )}
                  <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-3.5 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-glow)] transition-all shadow-sm">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search another product..."
                      className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm outline-none min-w-0"
                      disabled={loading}
                      onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) handleCompare(); }}
                    />
                    {loading ? (
                      <span className="inline-block w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <button
                        type="button"
                        onClick={handleCompare}
                        disabled={!query.trim()}
                        className={`rounded-xl text-sm font-semibold px-5 py-2.5 text-white transition-all flex-shrink-0 ${
                          query.trim()
                            ? "shadow-[0_4px_18px_var(--accent-glow)] hover:shadow-[0_6px_26px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                            : "opacity-40 cursor-not-allowed"
                        }`}
                        style={{ background: "var(--accent-grad)" }}
                      >
                        Compare
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
