"""
LangChain tools exposed to the Agentic RAG agent.

The agent decides which tool to call and how many times
based on the question and its reasoning trace.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

from langchain_core.tools import tool

if TYPE_CHECKING:
    from rag.vector_store import VectorStore

# Module-level reference set at startup so tools are stateless callables
_store: VectorStore | None = None


def init_tools(store: VectorStore):
    global _store
    _store = store


def _fmt(docs) -> str:
    if not docs:
        return "No relevant documents found."
    parts = []
    for i, doc in enumerate(docs, 1):
        meta = doc.metadata
        parts.append(
            f"[{i}] source={meta.get('source', '?')} | topic={meta.get('topic', '?')}\n"
            f"{doc.page_content}"
        )
    return "\n\n---\n\n".join(parts)


@tool
def semantic_search(query: str, k: int = 5) -> str:
    """Search the knowledge base for content semantically similar to the query.

    Use this when the question is broad or you are unsure which topic it belongs to.
    Args:
        query: The search query.
        k: Number of results to return (default 5, max 10).
    """
    k = min(k, 10)
    docs = _store.search(query, k=k)
    return _fmt(docs)


@tool
def topic_search(query: str, topic: str, k: int = 5) -> str:
    """Search the knowledge base filtered to a specific computer engineering topic.

    Use this when the question is clearly about one topic to get more focused results.
    Args:
        query: The search query.
        topic: One of: os, networks, databases, dsa, architecture, distributed, security, general.
        k: Number of results to return (default 5, max 10).
    """
    k = min(k, 10)
    docs = _store.search(query, k=k, topic=topic)
    return _fmt(docs)


@tool
def list_topics() -> str:
    """List all available topics and document counts in the knowledge base.

    Use this when you are unsure which topics exist before doing a topic_search.
    """
    stats = _store.get_stats()
    lines = [f"Total chunks: {stats['total_documents']}"]
    lines.append(f"Topics: {', '.join(stats['topics']) or 'none'}")
    return "\n".join(lines)


ALL_TOOLS = [semantic_search, topic_search, list_topics]
