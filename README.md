# StudyMate

**StudyMate** is an AI-powered study assistant that helps you finish assignments, prepare for quizzes, understand topics, and get clear explanations—all in one place. Ask questions in natural language and get structured answers with headings, bullet points, and code examples.

---

## Features

- **Assignments & homework** — Get step-by-step explanations and check your approach.
- **Quiz prep** — Clarify concepts, review key points, and test your understanding.
- **Topic explanations** — Clear answers with headings, bullet points, and numbered lists.
- **Code & commands** — Code blocks with syntax styling (e.g. bash, Python) when the answer includes examples.
- **Streaming answers** — Responses appear as they’re generated for a smoother experience.
- **Chat history** — Conversations are saved per user; pick up where you left off from the sidebar.
- **Sign-in required** — Uses [Clerk](https://clerk.com) so your history is private and synced to your account.

---

## Tech stack

| Layer      | Stack |
|-----------|--------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS, Clerk (auth) |
| **Backend**  | Python 3.12, FastAPI, OpenAI (GPT-4o-mini), Supabase (Postgres) |
| **Deploy**   | Vercel (frontend), Render (backend) |

---

## Project structure

```
studyMate/
├── frontend/          # Next.js app (Vercel)
├── backend/           # FastAPI API (Render)
├── supabase/
│   └── migrations/   # DB schema (users, conversations, messages)
├── .github/workflows/ # CI (lint + build on main, dev)
├── render.yaml        # Render blueprint for backend
└── README.md
```

---

## Prerequisites

- **Node.js** 20+ (for frontend)
- **Python** 3.11+ and [uv](https://docs.astral.sh/uv/) (for backend)
- Accounts: [OpenAI](https://platform.openai.com), [Clerk](https://clerk.com), [Supabase](https://supabase.com) (optional for history)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/Excergic/studyMate.git
cd studyMate
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: OPENAI_API_KEY, SUPABASE_*, CLERK_SECRET_KEY
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API: http://localhost:8000 · Docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local: Clerk keys, NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

App: http://localhost:3000

### 4. Database (for chat history)

Run the Supabase migrations so the backend can store users, conversations, and messages:

- In [Supabase](https://supabase.com) → SQL Editor, run the contents of  
  `supabase/migrations/20250310000000_users_conversations_messages.sql`

Or with Supabase CLI: `supabase db push` from the project root.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for answer generation |
| `SUPABASE_URL` | For history | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For history | Supabase service role key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (same as frontend); used to verify JWTs and resolve user email |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL (e.g. `http://localhost:8000` or your Render URL) |

Get Clerk keys from [Clerk Dashboard](https://dashboard.clerk.com) → API Keys.

---

## Deployment

- **Frontend (Vercel)**  
  Connect the repo, set root to `frontend`, add the env vars above (use your production backend URL for `NEXT_PUBLIC_API_URL`).

- **Backend (Render)**  
  Use the repo’s `render.yaml` or create a Web Service from `backend/`, set build to `pip install uv && uv sync --frozen` and start to `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`. Add `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CLERK_SECRET_KEY` in Render’s environment.

After deploy, set your production domain in Clerk (e.g. Sign-in URL, allowed redirect origins).

---

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/ask` | One-shot question → answer (JSON) |
| POST | `/api/ask/stream` | Streaming question → answer (SSE) |
| GET | `/api/conversations` | List current user’s conversations (Bearer token) |
| GET | `/api/conversations/:id/messages` | Messages for a conversation (Bearer token) |

All authenticated endpoints expect: `Authorization: Bearer <Clerk session JWT>`.

---

## License

MIT — see [LICENSE](LICENSE).
