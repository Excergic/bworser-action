from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class IngestRequest(BaseModel):
    text: str
    source: str = "manual"
    topic: str = "general"


class IngestResponse(BaseModel):
    message: str
    chunks_added: int
    source: str
    topic: str


class QueryRequest(BaseModel):
    question: str
    max_steps: int = 5


class QueryResponse(BaseModel):
    answer: str
    steps: list[str]
    sources: list[str]


class HistoryItem(BaseModel):
    id: str
    question: str
    answer: str
    steps: list[str]
    sources: list[str]
    created_at: datetime


class StoreStats(BaseModel):
    total_documents: int
    topics: list[str]
    sources: list[str]
