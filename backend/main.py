import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from rag.auth import get_current_user
from rag.database import get_history, save_query
from rag.document_processor import DocumentProcessor
from rag.vector_store import VectorStore
from rag.tools import init_tools
from rag.agent import AgenticRAG
from rag.models import (
    HistoryItem,
    IngestRequest,
    IngestResponse,
    QueryRequest,
    QueryResponse,
    StoreStats,
)

load_dotenv()

_processor: DocumentProcessor | None = None
_store: VectorStore | None = None
_agent: AgenticRAG | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _processor, _store, _agent
    _processor = DocumentProcessor()
    _store = VectorStore()
    init_tools(_store)
    _agent = AgenticRAG()
    yield


app = FastAPI(
    title="StudyBuddy — Agentic RAG",
    description="Computer engineering knowledge base with a LangGraph ReAct agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Public ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/store/stats", response_model=StoreStats)
def store_stats():
    try:
        return StoreStats(**_store.get_stats())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Admin (no user auth — protect via API gateway / secret header in prod) ──

@app.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest):
    try:
        chunks = _processor.process(req.text, source=req.source, topic=req.topic)
        added = _store.add(chunks)
        return IngestResponse(
            message="Ingested successfully.",
            chunks_added=added,
            source=req.source,
            topic=req.topic,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/store")
def clear_store():
    try:
        _store.clear()
        return {"message": "Vector store cleared."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Authenticated ────────────────────────────────────────────────────────────

@app.post("/query", response_model=QueryResponse)
def query(
    req: QueryRequest,
    user: dict = Depends(get_current_user),
):
    try:
        result = _agent.query(req.question, max_steps=req.max_steps)
        save_query(
            user_id=user["sub"],
            question=req.question,
            answer=result["answer"],
            steps=result["steps"],
            sources=result["sources"],
        )
        return QueryResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/history", response_model=list[HistoryItem])
def history(user: dict = Depends(get_current_user)):
    try:
        return get_history(user_id=user["sub"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
