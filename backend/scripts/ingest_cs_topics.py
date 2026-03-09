"""
Fetch computer engineering Wikipedia articles and ingest them into the Agentic RAG system.

Topics covered:
  - Operating Systems      (topic=os)
  - Computer Networks      (topic=networks)
  - Databases              (topic=databases)
  - Data Structures & Alg  (topic=dsa)
  - Computer Architecture  (topic=architecture)
  - Distributed Computing  (topic=distributed)
  - Computer Security      (topic=security)

Usage:
    uv run python scripts/ingest_cs_topics.py                         # all topics
    uv run python scripts/ingest_cs_topics.py --topic databases        # one topic
"""

import sys
import os
import argparse
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
INGEST_URL = "http://localhost:8000/ingest"
WIKIPEDIA_HEADERS = {"User-Agent": "StudyBuddyIngest/1.0 (educational use)"}

# (main Wikipedia title, topic tag, sub-pages)
CS_TOPICS: list[tuple[str, str, list[str]]] = [
    (
        "Operating system", "os",
        ["Process (computing)", "Memory management", "File system",
         "Scheduling (computing)", "Virtual memory", "Deadlock"],
    ),
    (
        "Computer network", "networks",
        ["OSI model", "Transmission Control Protocol", "Internet Protocol",
         "Network topology", "Routing", "Domain Name System", "HTTP"],
    ),
    (
        "Database", "databases",
        ["Relational database", "SQL", "Database normalization",
         "Database index", "NoSQL", "Transaction processing", "ACID"],
    ),
    (
        "Data structure", "dsa",
        ["Array (data structure)", "Linked list", "Stack (abstract data type)",
         "Queue (abstract data type)", "Hash table", "Tree (data structure)",
         "Graph (abstract data type)", "Heap (data structure)"],
    ),
    (
        "Algorithm", "dsa",
        ["Sorting algorithm", "Search algorithm", "Dynamic programming",
         "Big O notation", "Graph traversal", "Divide-and-conquer algorithm",
         "Greedy algorithm"],
    ),
    (
        "Computer architecture", "architecture",
        ["Central processing unit", "Cache (computing)",
         "Instruction set architecture", "Pipeline (computing)",
         "Random-access memory"],
    ),
    (
        "Distributed computing", "distributed",
        ["CAP theorem", "Consensus (computer science)", "MapReduce",
         "Remote procedure call", "Load balancing (computing)"],
    ),
    (
        "Computer security", "security",
        ["Cryptography", "Firewall (computing)", "Public-key cryptography",
         "Intrusion detection system", "SQL injection"],
    ),
]


def fetch_article(title: str) -> tuple[str, str] | None:
    params = {
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "explaintext": True,
        "exsectionformat": "plain",
        "format": "json",
    }
    try:
        resp = requests.get(WIKIPEDIA_API, params=params, headers=WIKIPEDIA_HEADERS, timeout=30)
        resp.raise_for_status()
        pages = resp.json()["query"]["pages"]
        page = next(iter(pages.values()))
        if "missing" in page:
            print(f"    [skip] '{title}' not found")
            return None
        return page["title"], page.get("extract", "")
    except Exception as exc:
        print(f"    [error] '{title}': {exc}")
        return None


def ingest_text(text: str, source: str, topic: str) -> int:
    """POST text to /ingest in sections. Returns chunks_added."""
    section_size = 4000
    sections = [text[i : i + section_size] for i in range(0, len(text), section_size)]
    total = 0

    for idx, section in enumerate(sections, 1):
        try:
            resp = requests.post(
                INGEST_URL,
                json={"text": section, "source": source, "topic": topic},
                timeout=60,
            )
            if not resp.ok:
                print(f"      [!] section {idx} failed ({resp.status_code}): {resp.text[:200]}")
                continue
            result = resp.json()
            total += result["chunks_added"]
            print(f"      section {idx}/{len(sections)} — +{result['chunks_added']} chunks")
        except Exception as exc:
            print(f"      [!] section {idx} error: {exc}")

    return total


def run(topics: list[tuple[str, str, list[str]]]):
    grand_total = 0

    for main_title, tag, sub_titles in topics:
        print(f"\n{'='*60}")
        print(f"Topic: {tag.upper()}")

        all_pages = [(main_title, tag)] + [(t, tag) for t in sub_titles]

        for title, topic in all_pages:
            print(f"\n  Fetching: {title}")
            result = fetch_article(title)
            if result is None:
                continue
            page_title, text = result
            source = f"wikipedia:{topic}:{page_title.replace(' ', '_')}"
            print(f"  {len(text):,} chars — ingesting as source='{source}'")
            added = ingest_text(text, source=source, topic=topic)
            grand_total += added
            print(f"  Done: +{added} chunks")

    print(f"\n{'='*60}")
    print(f"All done. Total chunks ingested: {grand_total}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--topic", help="Filter by topic tag (e.g. databases, dsa, os)")
    args = parser.parse_args()

    if args.topic:
        filtered = [t for t in CS_TOPICS if args.topic.lower() == t[1]]
        if not filtered:
            available = [t[1] for t in CS_TOPICS]
            print(f"Unknown topic '{args.topic}'. Available: {available}")
            sys.exit(1)
        run(filtered)
    else:
        run(CS_TOPICS)
