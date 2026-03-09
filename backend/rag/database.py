import os
from supabase import create_client, Client

_client: Client | None = None


def get_db() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],  # service role bypasses RLS
        )
    return _client


def save_query(
    user_id: str,
    question: str,
    answer: str,
    steps: list[str],
    sources: list[str],
) -> dict:
    result = (
        get_db()
        .table("query_history")
        .insert(
            {
                "user_id": user_id,
                "question": question,
                "answer": answer,
                "steps": steps,
                "sources": sources,
            }
        )
        .execute()
    )
    return result.data[0] if result.data else {}


def get_history(user_id: str, limit: int = 20) -> list[dict]:
    result = (
        get_db()
        .table("query_history")
        .select("id, question, answer, steps, sources, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []
