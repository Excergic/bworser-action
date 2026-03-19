"""CompareKaro API — product comparison + purchase agent."""

import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth.clerk import get_email_from_token
from db.supabase import (
    get_conversation,
    get_first_question_per_conversation,
    get_messages,
    get_or_create_user,
    get_supabase,
    list_conversations,
    save_qa,
)
from agent.compare_agent import clean_user_input, compare_products_async, compare_products_stream
from agent.browser_agent import browser_add_to_cart, browser_make_payment


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CompareRequest(BaseModel):
    query: str
    conversation_id: str | None = None


class CompareResponse(BaseModel):
    result: str
    conversation_id: str | None = None


class PurchaseRequest(BaseModel):
    query: str           # product to add to cart
    platform: str        # "amazon" | "flipkart"
    email: str           # user's platform login email / phone
    password: str        # user's platform login password


class PurchaseResponse(BaseModel):
    success: bool
    platform: str
    product_name: str | None = None
    product_url: str | None = None
    cart_url: str | None = None
    price: str | None = None
    message: str


class PaymentRequest(BaseModel):
    query: str           # product to buy
    platform: str        # "amazon" | "flipkart"
    email: str           # user's platform login email / phone
    password: str        # user's platform login password


class PaymentResponse(BaseModel):
    success: bool
    platform: str
    order_id: str | None = None
    product_name: str | None = None
    amount_paid: str | None = None
    delivery_date: str | None = None
    delivery_address: str | None = None
    payment_method: str | None = None
    message: str


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = []
    if not os.getenv("OPENAI_API_KEY"):
        missing.append("OPENAI_API_KEY")
    if not os.getenv("BROWSER_USE_API_KEY"):
        missing.append("BROWSER_USE_API_KEY")
    if missing:
        print(f"⚠️  Missing env vars: {', '.join(missing)}")
    yield


app = FastAPI(
    title="CompareKaro API",
    description="Compare products on Amazon & Flipkart — then add to cart or buy",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def _get_email(request: Request) -> str:
    auth = request.headers.get("Authorization")
    # DEV_MODE: skip Clerk JWT check for local dev — REMOVE before production
    if os.getenv("DEV_MODE", "").lower() == "true" and not auth:
        return "dev@localhost"
    email = get_email_from_token(auth)
    if not email:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization.")
    return email


# ---------------------------------------------------------------------------
# Root & Health
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "service": "CompareKaro API",
        "version": "2.0.0",
        "endpoints": {
            "compare": "POST /api/compare",
            "compare_stream": "POST /api/compare/stream",
            "purchase": "POST /api/purchase  (add to cart with your account)",
            "payment": "POST /api/payment   (place order with your account)",
            "conversations": "GET /api/conversations",
            "messages": "GET /api/conversations/{id}/messages",
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

@app.post("/api/compare", response_model=CompareResponse)
async def compare(req: CompareRequest, request: Request):
    """Run full comparison (non-streaming)."""
    query = clean_user_input((req.query or "").strip())
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    email = _get_email(request)
    result = await compare_products_async(query)

    conversation_id = save_qa(
        email=email,
        question=f"[Compare] {query}",
        answer=result,
        conversation_id=req.conversation_id,
    )
    return CompareResponse(result=result, conversation_id=conversation_id)


async def _stream_compare_sse(query: str, email: str, conversation_id: str | None):
    """Wrap sync compare streamer into async SSE generator."""
    q: asyncio.Queue[str] = asyncio.Queue()

    def _run() -> None:
        full: list[str] = []
        for chunk, done in compare_products_stream(query):
            if chunk:
                full.append(chunk)
                q.put_nowait(json.dumps({"content": chunk}))
            if done:
                break
        answer = "".join(full)
        cid = save_qa(
            email=email,
            question=f"[Compare] {query}",
            answer=answer,
            conversation_id=conversation_id,
        )
        q.put_nowait(json.dumps({"done": True, "conversation_id": cid}))

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _run)

    while True:
        data = await q.get()
        yield f"data: {data}\n\n"
        try:
            if json.loads(data).get("done"):
                break
        except Exception:
            pass


@app.post("/api/compare/stream")
async def compare_stream(req: CompareRequest, request: Request):
    """Stream comparison results via SSE."""
    query = clean_user_input((req.query or "").strip())
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    email = _get_email(request)
    return StreamingResponse(
        _stream_compare_sse(query, email, req.conversation_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Purchase (add to cart)
# ---------------------------------------------------------------------------

@app.post("/api/purchase", response_model=PurchaseResponse)
async def purchase(req: PurchaseRequest, request: Request):
    """
    Use browser-use to log into the user's Amazon/Flipkart account
    and add the product to cart.

    ⚠️  Credentials are used in-session only — never stored.
    """
    query = (req.query or "").strip()
    platform = (req.platform or "").strip().lower()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    if platform not in ("amazon", "flipkart"):
        raise HTTPException(status_code=400, detail="platform must be 'amazon' or 'flipkart'")
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="email and password are required")

    _get_email(request)  # verify CompareKaro auth

    result = await browser_add_to_cart(
        query=query,
        platform=platform,
        email=req.email,
        password=req.password,
    )
    return PurchaseResponse(**{k: result.get(k) for k in PurchaseResponse.model_fields})


# ---------------------------------------------------------------------------
# Payment (place order)
# ---------------------------------------------------------------------------

@app.post("/api/payment", response_model=PaymentResponse)
async def payment(req: PaymentRequest, request: Request):
    """
    Use browser-use to log into the user's Amazon/Flipkart account,
    add the product to cart, proceed to checkout, and place the order
    using their saved address and payment method.

    ⚠️  Credentials are used in-session only — never stored.
    ⚠️  This will place a REAL order. User must confirm in the UI before calling.
    """
    query = (req.query or "").strip()
    platform = (req.platform or "").strip().lower()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    if platform not in ("amazon", "flipkart"):
        raise HTTPException(status_code=400, detail="platform must be 'amazon' or 'flipkart'")
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="email and password are required")

    _get_email(request)  # verify CompareKaro auth

    result = await browser_make_payment(
        query=query,
        platform=platform,
        email=req.email,
        password=req.password,
    )
    return PaymentResponse(**{k: result.get(k) for k in PaymentResponse.model_fields})


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------

@app.get("/api/conversations")
def api_list_conversations(request: Request):
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
            "title": titles.get(str(c["id"])) or "New comparison",
        }
        for c in items
    ]


@app.get("/api/conversations/{conversation_id}/messages")
def api_get_messages(conversation_id: str, request: Request):
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
