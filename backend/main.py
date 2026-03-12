"""StudyBuddy API - FastAPI app with OpenAI and Supabase."""

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth.clerk import get_email_from_token
from config import get_settings
from services.ai import generate_answer, stream_answer
from db.supabase import (
    get_conversation,
    get_first_question_per_conversation,
    get_messages,
    get_or_create_user,
    get_supabase,
    list_conversations,
    save_qa,
)


class AskRequest(BaseModel):
    question: str
    conversation_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    conversation_id: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.openai_configured:
        print("Warning: OPENAI_API_KEY not set. Answer generation will return a placeholder.")
    yield


app = FastAPI(
    title="StudyBuddy API",
    description="AI-powered study assistant",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_email(request: Request) -> str:
    """Extract and validate user email from Clerk JWT. Raises 401 if missing/invalid."""
    auth = request.headers.get("Authorization")
    email = get_email_from_token(auth)
    if not email:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization. Sign in and send Bearer token.",
        )
    return email


@app.get("/")
def root():
    """So opening the Render URL in a browser shows API is up (GET / used to 404)."""
    return {
        "service": "StudyBuddy API",
        "health": "GET /health",
        "ask": "POST /api/ask with JSON body {\"question\": \"...\", \"conversation_id\": \"...\"?}",
        "conversations": "GET /api/conversations",
        "messages": "GET /api/conversations/{id}/messages",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/ask", response_model=AskResponse)
async def ask(req: AskRequest, request: Request):
    """Generate an answer for the given question. Requires Authorization: Bearer <Clerk JWT>. Stores in Supabase with user/conversation/message schema."""
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    email = _get_email(request)
    answer = await generate_answer(question)
    conversation_id = save_qa(
        email=email,
        question=question,
        answer=answer,
        conversation_id=req.conversation_id,
    )
    return AskResponse(answer=answer, conversation_id=conversation_id)


async def _stream_ask_async(question: str, email: str, conversation_id: str | None):
    """Async generator for SSE: run sync stream in thread, yield SSE lines from queue."""
    q: asyncio.Queue[str] = asyncio.Queue()

    def run_stream() -> None:
        full: list[str] = []
        for chunk, done in stream_answer(question):
            if chunk:
                full.append(chunk)
                q.put_nowait(json.dumps({"content": chunk}))
            if done:
                break
        answer = "".join(full)
        cid = save_qa(email=email, question=question, answer=answer, conversation_id=conversation_id)
        q.put_nowait(json.dumps({"done": True, "conversation_id": cid}))

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, run_stream)
    while True:
        data = await q.get()
        yield f"data: {data}\n\n"
        try:
            if json.loads(data).get("done"):
                break
        except Exception:
            pass


@app.post("/api/ask/stream")
async def ask_stream(req: AskRequest, request: Request):
    """Stream answer chunks via SSE. Requires Bearer token. Sends conversation_id in final event."""
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    email = _get_email(request)
    return StreamingResponse(
        _stream_ask_async(question, email, req.conversation_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/conversations")
def api_list_conversations(request: Request):
    """List current user's conversations (newest first). Requires Bearer token."""
    email = _get_email(request)
    if not get_supabase():
        return []
    user_id = get_or_create_user(email)
    if not user_id:
        return []
    items = list_conversations(user_id)
    cids = [str(c["id"]) for c in items]
    titles = get_first_question_per_conversation(cids)
    return [
        {
            "id": str(c["id"]),
            "created_at": c["created_at"],
            "title": titles.get(str(c["id"])) or "New chat",
        }
        for c in items
    ]


@app.get("/api/conversations/{conversation_id}/messages")
def api_get_messages(conversation_id: str, request: Request):
    """Get messages for a conversation. Requires Bearer token; conversation must belong to user."""
    email = _get_email(request)
    user_id = get_or_create_user(email)
    if not user_id:
        return []
    conv = get_conversation(conversation_id)
    if not conv or str(conv["user_id"]) != str(user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = get_messages(conversation_id)
    return [
        {
            "id": str(m["id"]),
            "question": m["question"],
            "answer": m["answer"],
            "created_at": m["created_at"],
        }
        for m in messages
    ]
