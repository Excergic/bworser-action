"""OpenAI-based answer generation."""

from openai import OpenAI

from config import get_settings


def get_openai_client() -> OpenAI | None:
    settings = get_settings()
    if not settings.openai_configured:
        return None
    return OpenAI(api_key=settings.openai_api_key)


SYSTEM_PROMPT = """You are StudyBuddy, a helpful AI study assistant. Answer questions clearly and concisely.
Focus on accuracy and educational value. Use simple language.

Format your responses in Markdown:
- Use ## or ### for headings when explaining topics.
- Use bullet points (- or *) for lists and key points.
- Use numbered lists when giving steps.
- For code examples use fenced code blocks with ```bash for shell commands or ``` with a language (e.g. ```python). Always use code blocks for any code."""


async def generate_answer(question: str, user_id: str | None = None) -> str:
    """Generate an answer for the given question using OpenAI."""
    client = get_openai_client()
    if not client:
        return "OpenAI is not configured. Set OPENAI_API_KEY in the environment."

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        max_tokens=1024,
    )
    content = response.choices[0].message.content
    return content or "I couldn't generate an answer for that."


def stream_answer(question: str):
    """Stream answer chunks from OpenAI. Yields (chunk_text, done)."""
    client = get_openai_client()
    if not client:
        yield "OpenAI is not configured. Set OPENAI_API_KEY in the environment.", True
        return
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        max_tokens=1024,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and getattr(delta, "content", None):
            yield delta.content, False
    yield "", True
