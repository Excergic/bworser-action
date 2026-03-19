"""
LangGraph Product Comparison Agent
------------------------------------
Compares products across Amazon.in & Flipkart using Tavily search.

Graph:
  parse_input → route
    ├─ (urls)    → extract_from_urls ─┐
    └─ (natural) → search_products ───┤
                                      ▼
                              compare_products → format_output → END
"""

import json
import re
import os
from typing import Literal, TypedDict

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from tavily import TavilyClient


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class ProductInfo(TypedDict, total=False):
    name: str
    price: str
    extracted_price: float | None
    rating: float | None
    rating_count: str
    source: str             # "amazon" | "flipkart"
    url: str
    image: str
    specs: dict[str, str]
    delivery: str


class CompareState(TypedDict):
    user_input: str
    input_type: Literal["urls", "natural"]
    urls: list[str]
    search_query: str
    amazon_products: list[ProductInfo]
    flipkart_products: list[ProductInfo]
    comparison_table: str
    analysis: str
    final_output: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_llm():
    return ChatOpenAI(
        model="gpt-4o-mini",
        api_key=os.getenv("OPENAI_API_KEY", ""),
        temperature=0.3,
    )


def _tavily_key() -> str:
    return os.getenv("TAVILY_API_KEY", "")


URL_PATTERN = re.compile(
    r'https?://(?:www\.)?'
    r'(?:amazon\.in|amazon\.com|flipkart\.com)'
    r'[^\s]*'
)

NON_PRODUCT_URL = re.compile(
    r'https?://(?!.*(?:amazon|flipkart))[^\s]+'
)


def clean_user_input(text: str) -> str:
    """Strip non-product URLs so we keep only natural language and Amazon/Flipkart links."""
    if not (text or text.strip()):
        return text or ""
    cleaned = NON_PRODUCT_URL.sub(" ", text)
    return " ".join(cleaned.split()).strip()


def _detect_source(url: str) -> str:
    if "amazon" in url:
        return "amazon"
    if "flipkart" in url:
        return "flipkart"
    return "unknown"


def _optimize_search_query(product: str, domain: str) -> str:
    """Use LLM to generate an optimized search query. Returns JSON {"query": "..."}."""
    llm = _get_llm()
    resp = llm.invoke([
        SystemMessage(content=(
            "Generate an optimized search query to find a product's current price on an Indian e-commerce site. "
            "Return ONLY a JSON object with a single key 'query'. "
            'Example: {"query": "Apple iPhone 15 128GB buy price India"}'
        )),
        HumanMessage(content=f"Product: {product}\nPlatform: {domain}"),
    ])
    try:
        result = json.loads(resp.content.strip())
        return result.get("query", product)
    except (json.JSONDecodeError, AttributeError):
        return product


def _extract_product_data(results: list[dict], source_filter: str) -> list[ProductInfo]:
    """
    Use LLM to extract structured product data (price, specs, rating, delivery)
    from raw Tavily search result snippets. Much more reliable than regex.
    """
    if not results:
        return []

    llm = _get_llm()

    results_text = "\n\n".join(
        f"Result {i + 1}:\nTitle: {r.get('title', '')}\nURL: {r.get('url', '')}\nContent: {r.get('content', '')}"
        for i, r in enumerate(results)
    )

    resp = llm.invoke([
        SystemMessage(content=(
            "You extract structured product data from e-commerce search result snippets.\n"
            "Return ONLY a JSON array. Each element must have these exact keys:\n"
            '  "name": full product name (string)\n'
            '  "price": price as shown (e.g. "₹54,990") — use "See link" if not found\n'
            '  "extracted_price": numeric value only (e.g. 54990.0) or null\n'
            '  "rating": rating out of 5 as float (e.g. 4.3) or null\n'
            '  "rating_count": number of reviews as string (e.g. "1,234") or ""\n'
            '  "specs": object with key specs like {"Storage": "128GB", "Color": "Blue"} or {}\n'
            '  "delivery": delivery info string or ""\n'
            '  "url": product URL from the result\n'
            "Extract from the content as accurately as possible. Do not invent data."
        )),
        HumanMessage(content=results_text),
    ])

    try:
        # Strip markdown code fences if present
        raw = resp.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        extracted = json.loads(raw)
        if not isinstance(extracted, list):
            raise ValueError("Expected a JSON array")
    except Exception as e:
        print(f"[LLM extract] parse error: {e} — raw: {resp.content[:200]}")
        # Fallback: build minimal ProductInfo from raw Tavily fields
        extracted = [
            {"name": r.get("title", ""), "price": "See link", "extracted_price": None,
             "rating": None, "rating_count": "", "specs": {}, "delivery": "", "url": r.get("url", "")}
            for r in results
        ]

    products: list[ProductInfo] = []
    for item in extracted:
        if not isinstance(item, dict):
            continue
        products.append(ProductInfo(
            name=item.get("name", ""),
            price=item.get("price", "See link"),
            extracted_price=item.get("extracted_price"),
            rating=item.get("rating"),
            rating_count=str(item.get("rating_count", "")),
            source=source_filter,
            url=item.get("url", ""),
            image="",
            specs=item.get("specs") or {},
            delivery=item.get("delivery", ""),
        ))
    return products


def _search_shopping_tavily(query: str, source_filter: str) -> list[ProductInfo]:
    """
    Fallback: search via Tavily + LLM extraction.
    1. Optimizes query via LLM
    2. Searches Tavily restricted to platform domain
    3. Extracts structured data via LLM from snippets
    """
    domain = "amazon.in" if source_filter == "amazon" else "flipkart.com"

    optimized_query = _optimize_search_query(query, domain)
    print(f"[Tavily] {source_filter} query: {optimized_query!r}")

    try:
        client = TavilyClient(api_key=_tavily_key())
        response = client.search(
            query=optimized_query,
            include_domains=[domain],
            max_results=5,
            search_depth="advanced",
        )
        raw_results = response.get("results", [])
    except Exception as e:
        print(f"[Tavily] {source_filter} search error: {e}")
        return []

    return _extract_product_data(raw_results, source_filter)


def _search_shopping(query: str, source_filter: str) -> list[ProductInfo]:
    """
    Search for products on a specific platform.
    Tries browser-use first (accurate real-time data), falls back to Tavily.
    """
    # Lazy import to avoid circular dependency at module load time
    from agent.browser_agent import browser_search_product

    try:
        print(f"[BrowserUse] trying {source_filter} search for: {query!r}")
        products = browser_search_product(query, source_filter)
        if products:
            print(f"[BrowserUse] {source_filter}: got {len(products)} results")
            return products
        print(f"[BrowserUse] {source_filter}: no results, falling back to Tavily")
    except Exception as e:
        print(f"[BrowserUse] {source_filter} failed ({e}), falling back to Tavily")

    return _search_shopping_tavily(query, source_filter)


def _search_product_url(url: str) -> ProductInfo | None:
    """Fetch product details for a specific URL via Tavily."""
    source = _detect_source(url)
    try:
        client = TavilyClient(api_key=_tavily_key())
        response = client.search(
            query=url,
            max_results=1,
            search_depth="basic",
        )
        results = response.get("results", [])
        if results:
            extracted = _extract_product_data(results, source)
            if extracted:
                p = extracted[0]
                p["url"] = url  # ensure original URL is preserved
                return p
    except Exception as e:
        print(f"[Tavily] URL lookup error: {e}")

    return ProductInfo(
        name="Product from URL",
        price="See link",
        extracted_price=None,
        rating=None,
        rating_count="",
        source=source,
        url=url,
        image="",
        specs={},
        delivery="",
    )


# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------

def parse_input(state: CompareState) -> dict:
    """Detect whether user provided URLs or a natural language query."""
    user_input = state["user_input"]
    full_urls = [m.group(0) for m in URL_PATTERN.finditer(user_input)]

    if full_urls:
        return {
            "input_type": "urls",
            "urls": full_urls,
            "search_query": "",
        }

    # Natural language → extract product search term via LLM
    llm = _get_llm()
    resp = llm.invoke([
        SystemMessage(content=(
            "Extract ONLY the product name/type from the user query for "
            "searching on e-commerce sites. Return just the product search "
            "term, nothing else.\n"
            "Examples:\n"
            "  'compare iphone 15 on amazon and flipkart' → 'iPhone 15'\n"
            "  'which is cheaper samsung s24 ultra' → 'Samsung Galaxy S24 Ultra'\n"
            "  'best noise cancelling headphones under 5000' → 'noise cancelling headphones under 5000'"
        )),
        HumanMessage(content=user_input),
    ])
    search_query = resp.content.strip().strip('"').strip("'")

    return {
        "input_type": "natural",
        "urls": [],
        "search_query": search_query,
    }


def search_products(state: CompareState) -> dict:
    """Search both Amazon and Flipkart for the product."""
    query = state["search_query"]
    amazon = _search_shopping(query, "amazon")
    flipkart = _search_shopping(query, "flipkart")
    return {
        "amazon_products": amazon,
        "flipkart_products": flipkart,
    }


def extract_from_urls(state: CompareState) -> dict:
    """Extract product info from provided URLs."""
    amazon_products: list[ProductInfo] = []
    flipkart_products: list[ProductInfo] = []

    for url in state["urls"]:
        product = _search_product_url(url)
        if not product:
            continue
        if product["source"] == "amazon":
            amazon_products.append(product)
        elif product["source"] == "flipkart":
            flipkart_products.append(product)

    query = state.get("search_query", "")
    if not query:
        all_products = amazon_products + flipkart_products
        if all_products:
            llm = _get_llm()
            names = ", ".join(p["name"] for p in all_products)
            resp = llm.invoke([
                SystemMessage(content="Extract the core product name from these titles for searching. Return just the search term."),
                HumanMessage(content=names),
            ])
            query = resp.content.strip().strip('"')

    if not amazon_products and query:
        amazon_products = _search_shopping(query, "amazon")
    if not flipkart_products and query:
        flipkart_products = _search_shopping(query, "flipkart")

    return {
        "amazon_products": amazon_products,
        "flipkart_products": flipkart_products,
        "search_query": query,
    }


def compare_products(state: CompareState) -> dict:
    """Use LLM to generate comparison table + written analysis."""
    llm = _get_llm()

    amazon_data = json.dumps(
        [dict(p) for p in state["amazon_products"][:5]],
        indent=2, default=str,
    )
    flipkart_data = json.dumps(
        [dict(p) for p in state["flipkart_products"][:5]],
        indent=2, default=str,
    )

    prompt = f"""You are a product comparison expert for Indian e-commerce.
Compare these products from Amazon.in and Flipkart.

## Amazon Products:
{amazon_data}

## Flipkart Products:
{flipkart_data}

Generate this output in clean Markdown:

### 1. Comparison Table
Create a table with columns:
| Feature | Amazon.in | Flipkart |
Include rows for: Product Name, Price (₹), Rating, Reviews Count, Delivery.
Match the MOST SIMILAR products across platforms.

### 2. Price Analysis
Which platform is cheaper and by how much.

### 3. Ratings & Trust
Which has better ratings and more reviews.

### 4. Platform Pros & Cons
Brief pros/cons for buying from each platform for this product.

### 5. Verdict
One clear recommendation with reasoning. Be direct — say which to buy from.

Rules:
- Use ₹ for all prices
- Be factual, use only the data provided
- Keep it concise — no fluff
- If data is missing, say so honestly"""

    resp = llm.invoke([
        SystemMessage(content="You create accurate, concise product comparisons for Indian shoppers."),
        HumanMessage(content=prompt),
    ])

    return {
        "comparison_table": "",
        "analysis": resp.content,
    }


def format_output(state: CompareState) -> dict:
    """Assemble final markdown output."""
    query = state.get("search_query", "your product")

    header = f"## 🛒 Product Comparison: {query}\n"
    subtitle = "*Compared across Amazon.in and Flipkart.com*\n\n"

    links: list[str] = []
    for p in state["amazon_products"][:3]:
        if p.get("url"):
            name = p["name"][:55] + "..." if len(p["name"]) > 55 else p["name"]
            links.append(f"- **Amazon**: [{name}]({p['url']})")
    for p in state["flipkart_products"][:3]:
        if p.get("url"):
            name = p["name"][:55] + "..." if len(p["name"]) > 55 else p["name"]
            links.append(f"- **Flipkart**: [{name}]({p['url']})")

    links_section = ""
    if links:
        links_section = "\n\n---\n### 🔗 Direct Links\n" + "\n".join(links) + "\n"

    final = header + subtitle + state["analysis"] + links_section
    return {"final_output": final}


# ---------------------------------------------------------------------------
# Router & Graph
# ---------------------------------------------------------------------------

def route_input(state: CompareState) -> str:
    return "extract_from_urls" if state["input_type"] == "urls" else "search_products"


def build_compare_graph():
    graph = StateGraph(CompareState)

    graph.add_node("parse_input", parse_input)
    graph.add_node("search_products", search_products)
    graph.add_node("extract_from_urls", extract_from_urls)
    graph.add_node("compare_products", compare_products)
    graph.add_node("format_output", format_output)

    graph.set_entry_point("parse_input")
    graph.add_conditional_edges(
        "parse_input",
        route_input,
        {
            "search_products": "search_products",
            "extract_from_urls": "extract_from_urls",
        },
    )
    graph.add_edge("search_products", "compare_products")
    graph.add_edge("extract_from_urls", "compare_products")
    graph.add_edge("compare_products", "format_output")
    graph.add_edge("format_output", END)

    return graph.compile()


# Singleton
_compare_agent = None


def get_compare_agent():
    global _compare_agent
    if _compare_agent is None:
        _compare_agent = build_compare_graph()
    return _compare_agent


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def compare_products_async(user_input: str) -> str:
    """Run the full comparison agent (non-streaming)."""
    user_input = clean_user_input(user_input or "")
    agent = get_compare_agent()
    result = await agent.ainvoke({
        "user_input": user_input,
        "input_type": "natural",
        "urls": [],
        "search_query": "",
        "amazon_products": [],
        "flipkart_products": [],
        "comparison_table": "",
        "analysis": "",
        "final_output": "",
    })
    return result.get("final_output", "Could not generate comparison.")


def compare_products_stream(user_input: str):
    """
    Stream comparison results. Yields (chunk, done).

    Runs parse + search synchronously, then streams the LLM comparison
    token-by-token via the OpenAI SDK for real-time UX.
    """
    from openai import OpenAI

    user_input = clean_user_input(user_input or "")

    yield "🔍 *Searching Amazon & Flipkart...*\n\n", False

    # --- Step 1: Parse input ---
    full_urls = [m.group(0) for m in URL_PATTERN.finditer(user_input)]

    if full_urls:
        amazon_products: list[ProductInfo] = []
        flipkart_products: list[ProductInfo] = []
        for url in full_urls:
            product = _search_product_url(url)
            if not product:
                continue
            if product["source"] == "amazon":
                amazon_products.append(product)
            else:
                flipkart_products.append(product)

        all_p = amazon_products + flipkart_products
        if all_p:
            llm = _get_llm()
            names = ", ".join(p["name"] for p in all_p)
            resp = llm.invoke([
                SystemMessage(content="Extract the core product name. Return just the search term."),
                HumanMessage(content=names),
            ])
            query = resp.content.strip().strip('"')
        else:
            query = user_input

        if not amazon_products:
            amazon_products = _search_shopping(query, "amazon")
        if not flipkart_products:
            flipkart_products = _search_shopping(query, "flipkart")
    else:
        llm = _get_llm()
        resp = llm.invoke([
            SystemMessage(content="Extract ONLY the product name from the query. Return just the search term."),
            HumanMessage(content=user_input),
        ])
        query = resp.content.strip().strip('"').strip("'")

        yield f"🔎 *Searching for: **{query}***\n\n", False

        amazon_products = _search_shopping(query, "amazon")
        flipkart_products = _search_shopping(query, "flipkart")

    if not amazon_products and not flipkart_products:
        yield "❌ No products found on either platform. Try a more specific product name.\n", True
        return

    a_count = len(amazon_products)
    f_count = len(flipkart_products)
    yield f"✅ *Found {a_count} Amazon & {f_count} Flipkart results. Generating comparison...*\n\n", False

    # --- Step 2: Stream the comparison ---
    amazon_data = json.dumps([dict(p) for p in amazon_products[:5]], indent=2, default=str)
    flipkart_data = json.dumps([dict(p) for p in flipkart_products[:5]], indent=2, default=str)

    system_prompt = "You create accurate, concise product comparisons for Indian shoppers."
    user_prompt = f"""Compare these products from Amazon.in and Flipkart:

## Amazon Products:
{amazon_data}

## Flipkart Products:
{flipkart_data}

Generate in clean Markdown:
1. **Comparison Table** (Product Name, Price ₹, Rating, Reviews, Source)
2. **Price Analysis** — which is cheaper, by how much
3. **Ratings & Trust** — which has better social proof
4. **Platform Pros & Cons** — brief for each
5. **Verdict** — one clear recommendation

Use ₹ for prices. Be factual and concise."""

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2048,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and getattr(delta, "content", None):
            yield delta.content, False

    # Append direct links
    links: list[str] = []
    for p in amazon_products[:3]:
        if p.get("url"):
            links.append(f"- **Amazon**: [{p['name'][:50]}]({p['url']})")
    for p in flipkart_products[:3]:
        if p.get("url"):
            links.append(f"- **Flipkart**: [{p['name'][:50]}]({p['url']})")
    if links:
        yield "\n\n---\n### 🔗 Direct Links\n" + "\n".join(links) + "\n", False

    yield "", True
