"""
Agentic RAG agent using LangGraph's ReAct pattern.

Flow:
  User question
      → Agent reasons about which tool(s) to call
      → semantic_search / topic_search / list_topics
      → Agent synthesises answer from retrieved context
      → Answer + reasoning trace returned
"""

import os
import opik
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.prebuilt import create_react_agent
from opik.integrations.langchain import OpikTracer

from rag.tools import ALL_TOOLS

SYSTEM_PROMPT = """You are StudyBuddy, an expert computer engineering tutor.

You have access to a knowledge base covering:
  - Operating Systems (os)
  - Computer Networks (networks)
  - Databases (databases)
  - Data Structures & Algorithms (dsa)
  - Computer Architecture (architecture)
  - Distributed Computing (distributed)
  - Computer Security (security)

When answering a question:
1. Use `list_topics` if you need to know what topics are available.
2. Use `topic_search` when the question clearly belongs to one topic — it gives more focused results.
3. Use `semantic_search` for broad or cross-topic questions.
4. You may call tools multiple times to gather enough context.
5. Synthesise a clear, structured, educational answer from the retrieved content.
6. Always cite the sources (source metadata) of the information you use.
"""


class AgenticRAG:
    def __init__(self):
        tracer = OpikTracer(tags=["agentic-rag"])
        llm = ChatOpenAI(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.2,
            callbacks=[tracer],
        )
        self.agent = create_react_agent(
            model=llm,
            tools=ALL_TOOLS,
            prompt=SYSTEM_PROMPT,
        )

    @opik.track(name="agentic-rag-query")
    def query(self, question: str, max_steps: int = 5) -> dict:
        """Run the ReAct agent and return answer + tool call trace."""
        config = {"recursion_limit": max_steps * 2 + 1}
        result = self.agent.invoke(
            {"messages": [HumanMessage(content=question)]},
            config=config,
        )

        messages = result["messages"]
        answer = messages[-1].content

        # Collect tool calls and sources from the message trace
        steps: list[str] = []
        sources: set[str] = set()

        for msg in messages:
            if isinstance(msg, AIMessage) and msg.tool_calls:
                for tc in msg.tool_calls:
                    args = ", ".join(f"{k}={v!r}" for k, v in tc["args"].items())
                    steps.append(f"{tc['name']}({args})")
            elif isinstance(msg, ToolMessage):
                # Extract source lines like "source=wikipedia:dsa:..."
                for line in msg.content.splitlines():
                    if line.startswith("[") and "source=" in line:
                        src = line.split("source=")[1].split(" ")[0].strip("|").strip()
                        sources.add(src)

        return {
            "answer": answer,
            "steps": steps,
            "sources": sorted(sources),
        }
