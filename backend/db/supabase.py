"""Supabase client and helpers for users, conversations, messages."""

from __future__ import annotations

from uuid import UUID

from supabase import Client, create_client

from config import get_settings


def get_supabase() -> Client | None:
    """Return Supabase client if configured."""
    settings = get_settings()
    if not settings.supabase_configured:
        return None
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


def get_or_create_user(email: str) -> str | None:
    """
    Get existing user id by email, or create user and return id.
    Returns uuid string or None if Supabase not configured.
    """
    client = get_supabase()
    if not client:
        return None
    try:
        r = client.table("users").select("id").eq("email", email).limit(1).execute()
        if r.data and len(r.data) > 0:
            return str(r.data[0]["id"])
        ins = client.table("users").insert({"email": email}).execute()
        if ins.data and len(ins.data) > 0:
            return str(ins.data[0]["id"])
    except Exception:
        pass
    return None


def get_or_create_conversation(user_id: str) -> str | None:
    """
    Create a new conversation for the user and return its id.
    Returns uuid string or None.
    """
    client = get_supabase()
    if not client:
        return None
    try:
        ins = client.table("conversations").insert({"user_id": user_id}).execute()
        if ins.data and len(ins.data) > 0:
            return str(ins.data[0]["id"])
    except Exception:
        pass
    return None


def get_conversation(conversation_id: str) -> dict | None:
    """Get a conversation by id. Returns None if not found or error."""
    client = get_supabase()
    if not client:
        return None
    try:
        r = (
            client.table("conversations")
            .select("id, user_id, created_at")
            .eq("id", conversation_id)
            .limit(1)
            .execute()
        )
        if r.data and len(r.data) > 0:
            return r.data[0]
    except Exception:
        pass
    return None


def create_message(conversation_id: str, question: str, answer: str) -> None:
    """Insert a message into a conversation."""
    client = get_supabase()
    if not client:
        return
    try:
        client.table("messages").insert(
            {
                "conversation_id": conversation_id,
                "question": question,
                "answer": answer,
            }
        ).execute()
    except Exception:
        pass


def list_conversations(user_id: str) -> list[dict]:
    """List conversations for a user, newest first."""
    client = get_supabase()
    if not client:
        return []
    try:
        r = (
            client.table("conversations")
            .select("id, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return list(r.data) if r.data else []
    except Exception:
        return []


def get_first_question_per_conversation(conversation_ids: list[str]) -> dict[str, str]:
    """Return mapping conversation_id -> first message question (truncated)."""
    if not conversation_ids:
        return {}
    client = get_supabase()
    if not client:
        return {}
    out: dict[str, str] = {}
    try:
        r = (
            client.table("messages")
            .select("conversation_id, question, created_at")
            .in_("conversation_id", conversation_ids)
            .order("created_at", desc=False)
            .execute()
        )
        if not r.data:
            return out
        for row in r.data:
            cid = str(row.get("conversation_id", ""))
            if cid not in out:
                q = (row.get("question") or "").strip()
                out[cid] = q[:60] + ("..." if len(q) > 60 else "") if q else "New chat"
    except Exception:
        pass
    return out


def get_messages(conversation_id: str) -> list[dict]:
    """Get all messages in a conversation, oldest first."""
    client = get_supabase()
    if not client:
        return []
    try:
        r = (
            client.table("messages")
            .select("id, question, answer, created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=False)
            .execute()
        )
        return list(r.data) if r.data else []
    except Exception:
        return []


def save_qa(
    email: str,
    question: str,
    answer: str,
    conversation_id: str | None = None,
) -> str | None:
    """
    Store a Q&A: ensure user exists by email, use or create conversation,
    insert message. Returns conversation_id for the frontend to use.
    """
    if not email:
        return None
    uid = get_or_create_user(email)
    if not uid:
        return None
    cid = conversation_id
    if cid:
        conv = get_conversation(cid)
        if not conv or str(conv["user_id"]) != str(uid):
            return None
    else:
        cid = get_or_create_conversation(uid)
    if not cid:
        return None
    create_message(cid, question, answer)
    return cid
