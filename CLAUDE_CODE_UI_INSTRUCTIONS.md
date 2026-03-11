# StudyMate AI — UI Redesign Instructions for Claude Code

## Context & Hard Constraints

You are redesigning the **UI only** of StudyMate AI — an agentic assignment helper for CS engineering students.

**Stack:**
- Next.js 14 (App Router) with TypeScript
- Tailwind CSS (generic/unstyled currently)
- Clerk for auth (do NOT touch any `<SignIn>`, `<UserButton>`, `<ClerkProvider>`, auth middleware, or `useUser`/`useAuth` hooks)
- Supabase as database (do NOT touch any `supabase` client calls, queries, or types)
- FastAPI backend (do NOT touch any `fetch`/`axios` calls, their URLs, payloads, or response handling logic)

**Absolute rules — read before touching any file:**
- Do NOT change any function names, props, state variables, API calls, auth logic, or database logic
- Do NOT add new npm dependencies (exception: `framer-motion` if not already installed — for animations only)
- Every existing feature must remain fully functional after the restyle
- TypeScript types must stay correct — do not widen, remove, or rename any types or interfaces
- Keep all existing conditional className logic — just replace the class names with better-looking ones

---

## Aesthetic Direction: "Perplexity Modern"

**Feel:** Clean, confident, colorful without being loud. Light base with rich teal-to-cyan accent system.
Generous whitespace. Cards with soft shadows. Pill badges everywhere. Smooth transitions.

**Reference:** Perplexity AI, Vercel v0, Luma AI, Raycast for Mac
**Fonts:** Sora (display) + Plus Jakarta Sans (body) + JetBrains Mono (mono/code)
**NOT:** Dark hacker aesthetic, purple AI gradients, bubbly consumer app, Material Design

---

## Step 0 — Install Fonts in `app/layout.tsx`

```tsx
import { Sora, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
})
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
})

// Apply all three variables to <html>:
// className={`${sora.variable} ${jakarta.variable} ${jetbrains.variable}`}
```

---

## Step 1 — Design Tokens in `globals.css`

Replace or append to your existing `globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Backgrounds */
  --bg-base:    #f7f8fa;
  --bg-surface: #ffffff;
  --bg-raised:  #f0f2f5;
  --bg-overlay: #e8eaee;

  /* Borders */
  --border:        rgba(0, 0, 0, 0.07);
  --border-strong: rgba(0, 0, 0, 0.14);

  /* Accent — teal/cyan like Perplexity */
  --accent:      #0ea5e9;
  --accent-2:    #06b6d4;
  --accent-soft: rgba(14, 165, 233, 0.10);
  --accent-glow: rgba(14, 165, 233, 0.22);
  --accent-grad: linear-gradient(135deg, #0ea5e9, #06b6d4, #10b981);

  /* Semantic */
  --success: #10b981;
  --warning: #f59e0b;
  --danger:  #ef4444;

  /* Text */
  --text-primary:   #0f172a;
  --text-secondary: #475569;
  --text-muted:     #94a3b8;
}

body {
  font-family: var(--font-body), system-ui, sans-serif;
  background: var(--bg-base);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, .font-display {
  font-family: var(--font-display), sans-serif;
}

code, .font-mono, [data-mono] {
  font-family: var(--font-mono), monospace;
}

/* Scrollbars */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-overlay); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }

/* Animations */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(14px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes stepIn {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes blink {
  50% { opacity: 0; }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-fade-up      { animation: fadeUp 0.45s ease forwards; }
.animate-step-in      { animation: stepIn 0.3s ease forwards; }
.animate-slide-right  { animation: slideInRight 0.3s ease forwards; }

.gradient-text {
  background: var(--accent-grad);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.shimmer-text {
  background: linear-gradient(90deg, #0ea5e9, #06b6d4, #10b981, #0ea5e9);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 3s linear infinite;
}

.typewriter-cursor::after {
  content: '▋';
  color: var(--accent);
  animation: blink 0.7s step-end infinite;
  font-size: 0.85em;
  margin-left: 1px;
}
```

---

## Step 2 — Navigation / Topbar

```
Layout:   h-14, sticky top-0 z-50
BG:       bg-white/80 backdrop-blur-md
Border:   border-b border-[var(--border)]
Shadow:   shadow-[0_1px_12px_rgba(0,0,0,0.06)]
Padding:  px-5 flex items-center
```

**Logo (left):**
```tsx
<div className="flex items-center gap-2.5">
  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
       style={{ background: 'var(--accent-grad)' }}>
    📚
  </div>
  <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-display)' }}>
    StudyMate
  </span>
  <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}>
    AI
  </span>
</div>
```

**Nav links:**
```
text-sm font-medium text-[var(--text-secondary)]
hover:text-[var(--text-primary)] transition-colors duration-150
Active: text-[var(--accent)]
Active underline: 2px bottom border in var(--accent), rounded-full
```

**Right side:** keep Clerk `<UserButton />` as-is, just add `ml-auto`

**Status dot (if you show agent status):**
```
w-2 h-2 rounded-full
Idle:    bg-emerald-400
Running: bg-amber-400 animate-pulse
```

---

## Step 3 — Home / Input Page

Container: `max-w-2xl mx-auto px-5 py-16 animate-fade-up`

**Hero:**
```tsx
<h1 style={{ fontFamily: 'var(--font-display)' }}
    className="text-[2.6rem] font-extrabold leading-[1.15] tracking-tight text-[var(--text-primary)] mb-4">
  Your assignment,<br />
  <span className="shimmer-text">handled end-to-end.</span>
</h1>
<p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-lg mb-10">
  Drop any prompt. StudyMate researches the web, structures an outline,
  and writes a complete document — then refines it on your feedback.
</p>
```

**Feature cards (3-col grid):**
```
grid grid-cols-3 gap-3 mb-8
Each card:
  bg-white border border-[var(--border)] rounded-2xl p-4
  hover:border-[var(--border-strong)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]
  transition-all duration-200 cursor-default

  Icon:  text-2xl mb-2.5
  Title: text-sm font-semibold text-[var(--text-primary)] mb-1
  Desc:  text-xs text-[var(--text-muted)] leading-relaxed
```

**Textarea:**
```
w-full bg-white border border-[var(--border)] rounded-2xl
px-5 py-4 text-sm text-[var(--text-primary)] leading-relaxed
placeholder:text-[var(--text-muted)]
focus:outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-glow)]
transition-all duration-200 resize-none shadow-sm
rows={6}
```

**CTA Button:**
```
w-full mt-3 py-3.5 rounded-xl font-semibold text-sm text-white
style={{ background: 'var(--accent-grad)' }}
shadow-[0_4px_18px_var(--accent-glow)]
hover:shadow-[0_6px_26px_rgba(14,165,233,0.35)] hover:-translate-y-0.5
active:translate-y-0
transition-all duration-200
disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0

Inside: "🚀 Run Agent" + <span className="ml-2 text-white/50 text-xs font-normal">⌘ Return</span>
```

---

## Step 4 — Agent View (3-panel layout)

Wrapper: `flex h-[calc(100vh-56px)] overflow-hidden bg-[var(--bg-base)]`

---

### Panel A — Pipeline Sidebar (`w-[280px] flex-shrink-0`)

```
bg-white border-r border-[var(--border)] flex flex-col overflow-hidden
```

**Assignment recap box:**
```
m-3 bg-[var(--bg-raised)] rounded-xl p-3.5 border border-[var(--border)]

Label: text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-1.5
Text:  text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-4
```

**"+ New Assignment" button (shown when phase === 'done'):**
```
mx-3 mt-2 w-[calc(100%-24px)] py-2 rounded-xl border border-[var(--border)]
text-xs font-medium text-[var(--text-secondary)]
hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]
transition-all duration-200
```

**Section label:** `px-4 pt-4 pb-2 text-[10px] uppercase tracking-widest font-semibold text-[var(--text-muted)]`

**Step rows:**
```
Base:
  flex items-start gap-3 mx-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-300 animate-step-in

Pending: opacity-30
Active:  bg-sky-50 border border-sky-200
Done:    bg-emerald-50 border border-emerald-200

Icon: text-base mt-0.5 flex-shrink-0

Label (text-xs font-semibold):
  Pending → text-[var(--text-muted)]
  Active  → text-sky-600
  Done    → text-emerald-600

Summary: text-[11px] text-[var(--text-muted)] mt-0.5 leading-[1.5]

Right side:
  Active spinner: w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin ml-auto flex-shrink-0
  Done check:     <span className="text-emerald-500 text-xs ml-auto">✓</span>
```

**Sources block:**
```
mx-3 mt-1 mb-2 bg-sky-50 border border-sky-100 rounded-xl p-3

Label: text-[10px] uppercase tracking-widest font-semibold text-sky-500 mb-2
Row:   flex items-start gap-1.5 mb-1.5
  Dot:  w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 flex-shrink-0
  Text: text-[11px] text-[var(--text-secondary)] leading-[1.45]
```

---

### Panel B — Document Viewer (`flex-1 flex flex-col overflow-hidden`)

**Toolbar (`h-12`):**
```
bg-white border-b border-[var(--border)] flex items-center px-4 gap-3 flex-shrink-0

Left: doc icon (text-base) + title (font-display text-sm font-bold text-[var(--text-primary)])
      + status pill (text-[10px] font-mono px-2.5 py-0.5 rounded-full)
        Writing:  text-sky-500 bg-sky-50 border border-sky-200 animate-pulse + "writing…"
        Complete: text-emerald-600 bg-emerald-50 border border-emerald-200 + "complete"

Right (ml-auto flex items-center gap-2.5):
  Word count: text-xs font-mono text-[var(--text-muted)]
  Export btn: text-xs px-3 py-1.5 rounded-lg border border-[var(--border)]
              text-[var(--text-secondary)]
              hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]
              transition-all duration-150
```

**Scroll area:** `flex-1 overflow-y-auto p-6 md:p-8 bg-[var(--bg-base)]`

**Paper card:**
```
max-w-[700px] mx-auto bg-white rounded-2xl min-h-[480px] overflow-hidden
shadow-[0_8px_40px_rgba(0,0,0,0.08)]

Top gradient bar: <div className="h-1 w-full" style={{ background: 'var(--accent-grad)' }} />

Content: px-10 py-10
  ## headings: font-display text-lg font-bold text-[var(--text-primary)] mt-6 mb-2
  Body text:   text-[15px] text-[#374151] leading-[1.8]
  Paragraphs:  mb-3

While isTyping === true: add className "typewriter-cursor" to content wrapper div
```

**Empty state:**
```
flex flex-col items-center justify-center h-[400px] text-center
Icon: text-5xl mb-4 opacity-30
Text: text-sm text-[var(--text-muted)]
```

**Waiting state (step running, before write step):**
```
flex flex-col items-center justify-center h-[400px]
Icon of current step: text-5xl mb-4
Label: text-sm font-medium text-[var(--text-secondary)] font-mono
Bounce dots (mt-4 flex gap-1.5):
  3 × <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce"
           style={{ animationDelay: `${i * 0.15}s` }} />
```

---

### Panel C — Refine Chat (`w-[272px] flex-shrink-0`)

Only render when `phase === 'done'`. Add `animate-slide-right` on mount.

```
bg-white border-l border-[var(--border)] flex flex-col overflow-hidden
```

**Header:**
```
px-4 py-3.5 border-b border-[var(--border)]
Title: text-sm font-semibold text-[var(--text-primary)]
Sub:   text-xs text-[var(--text-muted)] mt-0.5
```

**Quick prompt chips (when chat history is empty):**
```
flex flex-col gap-2 p-3
Each:
  text-xs text-left px-3 py-2 rounded-xl border border-[var(--border)]
  text-[var(--text-secondary)] bg-[var(--bg-raised)]
  hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700
  transition-all duration-150 cursor-pointer
```

Suggested chips: "Make the intro more compelling" / "Add real-world examples" / "Shorten to ~400 words" / "Use a more formal tone"

**Chat messages area:** `flex-1 overflow-y-auto p-3 flex flex-col gap-2`

```
User:  self-end max-w-[88%] bg-gradient-to-br from-sky-500 to-cyan-500
       text-white text-xs px-3.5 py-2.5 rounded-2xl rounded-tr-sm shadow-sm

Agent: self-start max-w-[88%] bg-[var(--bg-raised)] border border-[var(--border)]
       text-[var(--text-secondary)] text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-sm
```

**Loading dots:**
```
self-start flex gap-1 px-3 py-2.5 bg-[var(--bg-raised)] rounded-2xl rounded-tl-sm
3 × <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"
         style={{ animationDelay: `${i * 0.18}s` }} />
```

**Changes summary:**
```
mx-3 mb-2 text-[11px] leading-relaxed
text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2
```

**Input row:** `p-3 border-t border-[var(--border)] flex gap-2`
```
Input:
  flex-1 bg-[var(--bg-raised)] border border-[var(--border)] rounded-xl
  px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
  focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100
  transition-all duration-150

Send button:
  px-3 py-2 rounded-xl text-xs font-semibold text-white
  style={{ background: 'var(--accent-grad)' }}
  hover:shadow-[0_4px_12px_rgba(14,165,233,0.35)] hover:-translate-y-0.5
  transition-all duration-150
  disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none
```

---

## Step 5 — History Page

Container: `max-w-2xl mx-auto px-5 py-12 animate-fade-up`

**Header:**
```tsx
<h1 style={{ fontFamily: 'var(--font-display)' }}
    className="text-3xl font-extrabold text-[var(--text-primary)] mb-1">
  History
</h1>
<p className="text-sm text-[var(--text-muted)] mb-8">
  {count} assignment{count !== 1 ? 's' : ''} completed
</p>
```

**Empty state:**
```
bg-white border border-[var(--border)] rounded-2xl p-14 text-center shadow-sm
Icon: text-5xl mb-4 opacity-30
Title: text-sm font-semibold text-[var(--text-secondary)] mb-1
Desc:  text-xs text-[var(--text-muted)]
```

**Card list:** `flex flex-col gap-3`

Each card:
```
bg-white border border-[var(--border)] rounded-2xl p-5 cursor-pointer group
hover:border-sky-300 hover:shadow-[0_4px_20px_rgba(14,165,233,0.10)]
transition-all duration-200

Title:   text-sm font-semibold text-[var(--text-primary)] mb-1
         group-hover:text-sky-600 transition-colors

Preview: text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2 mb-3

Footer (flex items-center justify-between):
  Source pills: text-[10px] font-medium px-2 py-0.5 rounded-full
                bg-sky-50 text-sky-600 border border-sky-200

  Meta: font-mono text-[11px] text-[var(--text-muted)]
        "{date} · {wordCount}w"
```

---

## Step 6 — Tailwind Config

In `tailwind.config.ts`, add font family extension:

```ts
theme: {
  extend: {
    fontFamily: {
      display: ['var(--font-display)', 'sans-serif'],
      body:    ['var(--font-body)',    'sans-serif'],
      mono:    ['var(--font-mono)',    'monospace'],
    },
  },
},
```

---

## Do NOT Touch

| Area | What to leave alone |
|---|---|
| API calls | Any `fetch()`, `axios`, files in `app/api/` |
| Auth | `<ClerkProvider>`, `<SignIn>`, `<UserButton>`, `useAuth`, `useUser`, `middleware.ts` |
| Database | Any `supabase` import or method call |
| State & logic | All hooks, handlers, business logic, data transforms |
| TypeScript | All interfaces, types, generics |
| Env | `.env`, `.env.local` |

---

## Execution Order

1. `globals.css` — full CSS block (tokens + keyframes + utilities)
2. `app/layout.tsx` — font imports + apply variables to `<html>`
3. `tailwind.config.ts` — fontFamily extension
4. **Navbar component** — restyle only
5. **Home page** — hero, feature cards, textarea, button
6. **Agent view** — sidebar → document panel → refine panel
7. **History page** — header, empty state, cards
8. `npm run build` — fix any TypeScript errors (styling only, zero logic changes)
