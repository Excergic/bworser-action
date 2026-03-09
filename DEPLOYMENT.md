# StudyBuddy — Production Deployment (Vercel)

This doc covers deploying the **frontend** (Next.js) and **backend** (FastAPI/Python) to Vercel, plus CI/CD and Docker for self-hosting.

## Overview

- **Frontend**: Next.js on Vercel (framework preset: Next.js).
- **Backend**: Python FastAPI as a single serverless function (Mangum) on Vercel.
- **CI**: GitHub Actions runs lint + build for both (no secrets; Vercel deploys via Git integration).

You need **two Vercel projects** (or one monorepo with two “apps”): one for frontend, one for backend.

---

## 1. Vercel — Frontend

1. **Import** the repo in [Vercel](https://vercel.com) and create a **new project**.
2. **Root Directory**: set to `frontend`.
3. **Framework**: Next.js (auto-detected).
4. **Build**: `npm run build` (default).
5. **Environment variables** (Settings → Environment Variables). Use **Production** (and Preview if you want):

   | Name | Example | Notes |
   |------|---------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | From Supabase dashboard |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | From Supabase |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...` | From Clerk |
   | `CLERK_SECRET_KEY` | `sk_test_...` or `sk_live_...` | From Clerk |
   | `NEXT_PUBLIC_API_URL` | `https://your-backend.vercel.app` | **Backend base URL** (see below) |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | Optional |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | Optional |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/` | Optional |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/` | Optional |

6. Deploy. Note the frontend URL (e.g. `https://studybuddy.vercel.app`).

---

## 2. Vercel — Backend

1. Create a **second** Vercel project from the same repo.
2. **Root Directory**: set to `backend`.
3. **Build**: Vercel will use `api/index.py` and `requirements.txt` (Python runtime).
4. **Environment variables** (Settings → Environment Variables):

   | Name | Example | Notes |
   |------|---------|--------|
   | `OPENAI_API_KEY` | `sk-...` | Required |
   | `OPENAI_MODEL` | `gpt-4o-mini` | Optional |
   | `EMBEDDING_MODEL` | `text-embedding-3-small` or `text-embedding-3-large` | Optional |
   | `PINECONE_API_KEY` | `pcsk_...` | Required |
   | `PINECONE_INDEX` | `studybuddy` | Optional |
   | `PINECONE_CLOUD` | `aws` | Optional |
   | `PINECONE_REGION` | `us-east-1` | Optional |
   | `CLERK_JWKS_URL` | `https://your-app.clerk.accounts.dev/.well-known/jwks.json` | From Clerk → API Keys → Advanced |
   | `SUPABASE_URL` | `https://xxx.supabase.co` | Required |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **Service role** (not anon) |
   | `FRONTEND_URL` | `https://studybuddy.vercel.app` | **Frontend origin** for CORS |
   | `OPIK_API_KEY` | (optional) | LLMOps |
   | `OPIK_WORKSPACE` | (optional) | |
   | `OPIK_PROJECT_NAME` | (optional) | |

5. Deploy. Note the backend URL (e.g. `https://studybuddy-api.vercel.app`).

---

## 3. Wire frontend to backend

- In the **frontend** Vercel project, set:
  - `NEXT_PUBLIC_API_URL` = backend URL (e.g. `https://studybuddy-api.vercel.app`) **with no trailing slash**.
- In the **backend** Vercel project, set:
  - `FRONTEND_URL` = frontend URL (e.g. `https://studybuddy.vercel.app`).
- Redeploy frontend after changing `NEXT_PUBLIC_*` so the build picks up the new value.

---

## 4. Clerk (production)

- In Clerk dashboard, add **Allowed redirect URLs** and **Sign-in/Sign-up URLs** for your frontend (e.g. `https://studybuddy.vercel.app`).
- Use **Production** keys for production; keep `CLERK_JWKS_URL` in sync with the key type (test vs live).

---

## 5. CI/CD (GitHub Actions)

- **`.github/workflows/ci.yml`** runs on push/PR to `main` (or `master`):
  - **Frontend**: `npm run lint`, `npm run build` (with placeholder env for build).
  - **Backend**: `uv sync`, ruff, pyright, and export of `requirements.txt`.
- Actual **deploy** is done by Vercel via Git: connect both Vercel projects to the repo; each uses its **Root Directory** so only its app is built and deployed.

---

## 6. Docker (self-hosted or local)

- **Backend**: `backend/Dockerfile` — run FastAPI with uvicorn.
- **Frontend**: `frontend/Dockerfile` — Next.js standalone build.
- **Compose**: root `docker-compose.yml` runs backend (port 8000) and frontend (port 3000).

Steps:

```bash
# Copy env examples and fill secrets
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# Edit backend/.env and frontend/.env.local

# Optional: root .env for compose build args
cp .env.example .env

# Build and run
docker compose up --build
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:8000 (health: http://localhost:8000/health)

For production over the internet, set `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` to the public URLs of backend and frontend.

---

## 7. Checklist

- [ ] Two Vercel projects: frontend (root `frontend`), backend (root `backend`).
- [ ] All env vars set in each project; `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` point to each other.
- [ ] Clerk redirect URLs and JWKS URL match the environment.
- [ ] Supabase: service role key in backend; anon key and URL in frontend.
- [ ] Pinecone index created and env set in backend.
- [ ] After changing any `NEXT_PUBLIC_*`, redeploy frontend.

---

## 8. Regenerating `backend/requirements.txt`

For Vercel, backend dependencies are installed from `backend/requirements.txt`. To refresh it from `pyproject.toml`:

```bash
cd backend
uv export --no-dev --no-hashes -o requirements.txt
# Remove the "-e ." line if present (Vercel does not need the local package)
sed -i '' '/^-e \.\s*$/d' requirements.txt   # macOS
# or: sed -i '/^-e \.\s*$/d' requirements.txt   # Linux
```

Commit the updated `requirements.txt` so the next Vercel backend deploy uses it.
