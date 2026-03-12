# """OpenAI-based answer generation."""

# from openai import OpenAI

# from config import get_settings


# def get_openai_client() -> OpenAI | None:
#     settings = get_settings()
#     if not settings.openai_configured:
#         return None
#     return OpenAI(api_key=settings.openai_api_key)


# SYSTEM_PROMPT = """You are StudyBuddy, a helpful AI study assistant. Answer questions clearly and concisely.
# Focus on accuracy and educational value. Use simple language.

# Format your responses in Markdown:
# - Use ## or ### for headings when explaining topics.
# - Use bullet points (- or *) for lists and key points.
# - Use numbered lists when giving steps.
# - For code examples use fenced code blocks with ```bash for shell commands or ``` with a language (e.g. ```python). Always use code blocks for any code."""


# async def generate_answer(question: str, user_id: str | None = None) -> str:
#     """Generate an answer for the given question using OpenAI."""
#     client = get_openai_client()
#     if not client:
#         return "OpenAI is not configured. Set OPENAI_API_KEY in the environment."

#     response = client.chat.completions.create(
#         model="gpt-4o-mini",
#         messages=[
#             {"role": "system", "content": SYSTEM_PROMPT},
#             {"role": "user", "content": question},
#         ],
#         max_tokens=1024,
#     )
#     content = response.choices[0].message.content
#     return content or "I couldn't generate an answer for that."


# def stream_answer(question: str):
#     """Stream answer chunks from OpenAI. Yields (chunk_text, done)."""
#     client = get_openai_client()
#     if not client:
#         yield "OpenAI is not configured. Set OPENAI_API_KEY in the environment.", True
#         return
#     stream = client.chat.completions.create(
#         model="gpt-4o-mini",
#         messages=[
#             {"role": "system", "content": SYSTEM_PROMPT},
#             {"role": "user", "content": question},
#         ],
#         max_tokens=1024,
#         stream=True,
#     )
#     for chunk in stream:
#         delta = chunk.choices[0].delta if chunk.choices else None
#         if delta and getattr(delta, "content", None):
#             yield delta.content, False
#     yield "", True


import json
from typing import Annotated, TypedDict

from langchain_openai import ChatOpenAI
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from config import get_settings

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class AgentState(TypedDict):
    """State that flows through the LangGraph agent."""

    question: str
    search_queries: list[str]
    search_results: list[dict]
    answer: str
    messages: Annotated[list, add_messages]


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


def _get_llm():
    settings = get_settings()
    return ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.openai_api_key,
        max_tokens=1024,
        streaming=True,
    )


def _get_search_tool():
    """Tavily search tool — requires TAVILY_API_KEY env var."""
    return TavilySearchResults(
        max_results=5,
        search_depth="basic",
    )


SYSTEM_PROMPT = """You are StudyBuddy, a helpful AI study assistant. You ALWAYS search the web
for the latest information before answering. Answer questions clearly and concisely.
Focus on accuracy and educational value. Use simple language.

Format your responses in Markdown:
- Use ## or ### for headings when explaining topics.
- Use bullet points (- or *) for lists and key points.
- Use numbered lists when giving steps.
- For code examples use fenced code blocks with the language name.
- When you use information from web search, mention the source briefly."""


def plan_search(state: AgentState) -> dict:
    """Generate 1-3 targeted search queries from the user's question."""
    llm = _get_llm()
    planning_prompt = f"""Given this user question, generate 1 to 3 concise web search queries
that would help answer it thoroughly. Return ONLY a JSON array of strings, nothing else.

Question: {state['question']}"""

    response = llm.invoke(
        [
            SystemMessage(
                content="You generate search queries. Return only a JSON array of strings."
            ),
            HumanMessage(content=planning_prompt),
        ]
    )

    try:
        queries = json.loads(response.content)
        if not isinstance(queries, list):
            queries = [state["question"]]
    except (json.JSONDecodeError, TypeError):
        queries = [state["question"]]

    # Cap at 3 queries
    queries = queries[:3]
    return {"search_queries": queries}


def web_search(state: AgentState) -> dict:
    """Execute all planned search queries via Tavily."""
    tool = _get_search_tool()
    all_results = []

    for query in state.get("search_queries", [state["question"]]):
        try:
            results = tool.invoke(query)
            if isinstance(results, list):
                for r in results:
                    all_results.append(
                        {
                            "query": query,
                            "url": r.get("url", ""),
                            "content": r.get("content", ""),
                        }
                    )
        except Exception as e:
            all_results.append(
                {
                    "query": query,
                    "url": "",
                    "content": f"Search failed: {str(e)}",
                }
            )

    return {"search_results": all_results}


def synthesize(state: AgentState) -> dict:
    """Synthesize search results into a final answer using GPT."""
    llm = _get_llm()

    # Build context from search results
    context_parts = []
    for i, r in enumerate(state.get("search_results", []), 1):
        source = r.get("url", "unknown source")
        content = r.get("content", "")[:800]  # trim long snippets
        context_parts.append(f"[Source {i}] {source}\n{content}")

    context_block = (
        "\n\n".join(context_parts) if context_parts else "No search results found."
    )

    user_msg = f"""Web search results:
---
{context_block}
---

User question: {state['question']}

Using the search results above, provide a comprehensive answer. Cite sources where relevant."""

    response = llm.invoke(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_msg),
        ]
    )

    return {
        "answer": response.content,
        "messages": [
            HumanMessage(content=state["question"]),
            AIMessage(content=response.content),
        ],
    }


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def build_agent_graph() -> StateGraph:
    """Build and compile the LangGraph search agent."""
    graph = StateGraph(AgentState)

    graph.add_node("plan_search", plan_search)
    graph.add_node("web_search", web_search)
    graph.add_node("synthesize", synthesize)

    graph.set_entry_point("plan_search")
    graph.add_edge("plan_search", "web_search")
    graph.add_edge("web_search", "synthesize")
    graph.add_edge("synthesize", END)

    return graph.compile()


# Singleton compiled graph
_agent = None


def _get_agent():
    global _agent
    if _agent is None:
        _agent = build_agent_graph()
    return _agent


# ---------------------------------------------------------------------------
# Public API (drop-in replacements for old ai.py)
# ---------------------------------------------------------------------------


async def generate_answer(question: str, user_id: str | None = None) -> str:
    """Generate an answer by running the full search agent (non-streaming)."""
    settings = get_settings()
    if not settings.openai_configured:
        return "OpenAI is not configured. Set OPENAI_API_KEY in the environment."

    agent = _get_agent()
    result = await agent.ainvoke(
        {
            "question": question,
            "search_queries": [],
            "search_results": [],
            "answer": "",
            "messages": [],
        }
    )
    return result.get("answer", "I couldn't generate an answer.")


def stream_answer(question: str):
    """Stream answer chunks from the search agent. Yields (chunk_text, done).

    Flow: plan → search → stream the synthesis step token-by-token.
    The first two steps run fully, then we stream only the final LLM call.
    """
    settings = get_settings()
    if not settings.openai_configured:
        yield (
            "OpenAI is not configured. Set OPENAI_API_KEY in the environment.",
            True,
        )
        return

    # --- Step 1 & 2: plan + search (non-streaming, fast) ---
    from langchain_core.messages import HumanMessage as HM
    from langchain_core.messages import SystemMessage as SM

    llm = _get_llm()
    tool = _get_search_tool()

    # Plan
    planning_prompt = f"""Given this user question, generate 1 to 3 concise web search queries
that would help answer it thoroughly. Return ONLY a JSON array of strings.

Question: {question}"""

    plan_resp = llm.invoke(
        [
            SM(content="You generate search queries. Return only a JSON array of strings."),
            HM(content=planning_prompt),
        ]
    )
    try:
        queries = json.loads(plan_resp.content)
        if not isinstance(queries, list):
            queries = [question]
    except (json.JSONDecodeError, TypeError):
        queries = [question]
    queries = queries[:3]

    # Signal that we're searching
    yield "🔍 *Searching the web...*\n\n", False

    # Search
    all_results = []
    for q in queries:
        try:
            results = tool.invoke(q)
            if isinstance(results, list):
                for r in results:
                    all_results.append(
                        {
                            "url": r.get("url", ""),
                            "content": r.get("content", ""),
                        }
                    )
        except Exception:
            pass

    # --- Step 3: stream the synthesis ---
    context_parts = []
    for i, r in enumerate(all_results, 1):
        source = r.get("url", "unknown")
        content = r.get("content", "")[:800]
        context_parts.append(f"[Source {i}] {source}\n{content}")

    context_block = (
        "\n\n".join(context_parts) if context_parts else "No search results found."
    )

    user_msg = f"""Web search results:
---
{context_block}
---

User question: {question}

Using the search results above, provide a comprehensive answer. Cite sources where relevant."""

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=1024,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and getattr(delta, "content", None):
            yield delta.content, False

    yield "", True
