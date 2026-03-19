"""
Browser-Use Agent
-----------------
All browser automation via browser-use-sdk:

  1. search_and_scrape_product()  — open actual product pages, extract full specs
  2. add_to_cart()                — log in with user's credentials, add to cart
  3. make_payment()               — proceed to checkout and place order
"""

import asyncio
import concurrent.futures
import json
import os
import re

from browser_use_sdk import AsyncBrowserUse

from agent.compare_agent import ProductInfo


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _key() -> str:
    return os.getenv("BROWSER_USE_API_KEY", "")


def run_async(coro):
    """
    Run an async coroutine from synchronous code without event-loop conflicts.
    Creates a fresh thread with its own event loop every time.
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _extract_json(output: str, kind: str):
    """Pull first JSON array or object out of raw text output."""
    pattern = r'\[[\s\S]*?\]' if kind == "array" else r'\{[\s\S]*?\}'
    match = re.search(pattern, output)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# 1. Full product scrape (used by comparison agent)
# ---------------------------------------------------------------------------

async def _async_search_and_scrape(query: str, platform: str) -> list[ProductInfo]:
    """
    Open Amazon.in or Flipkart, search for the product, open the top 3 results
    one by one, and extract complete product details from each page.
    """
    domain = "amazon.in" if platform == "amazon" else "flipkart.com"

    task = (
        f'Go to https://www.{domain} and search for "{query}". '
        f"From the search results, open the top 3 product listings one by one. "
        f"For each product page, extract ALL available information:\n"
        f"- Full product name\n"
        f"- Current selling price (in ₹)\n"
        f"- MRP / original price if shown\n"
        f"- Rating out of 5\n"
        f"- Total number of ratings/reviews\n"
        f"- All technical specifications (storage, RAM, battery, display, camera, "
        f"  weight, dimensions, color, connectivity, OS, warranty, material — "
        f"  whatever is listed on the page)\n"
        f"- Delivery date and cost\n"
        f"- Seller name\n"
        f"- Direct URL of the product page\n\n"
        f"Return ONLY a valid JSON array — no markdown, no explanation:\n"
        f"[\n"
        f"  {{\n"
        f'    "name": "Full product name",\n'
        f'    "price": "₹54,990",\n'
        f'    "mrp": "₹59,900",\n'
        f'    "rating": 4.3,\n'
        f'    "rating_count": "12,456",\n'
        f'    "specs": {{"Storage": "128GB", "RAM": "6GB", "Battery": "3877mAh"}},\n'
        f'    "delivery": "Free delivery by Tomorrow",\n'
        f'    "seller": "Cloudtail India",\n'
        f'    "url": "https://www.{domain}/dp/..."\n'
        f"  }}\n"
        f"]"
    )

    try:
        client = AsyncBrowserUse(api_key=_key())
        result = await client.run(task)
        output = result.output or ""
        print(f"[Browser] {platform} scrape output (first 400):\n{output[:400]}")

        items = _extract_json(output, "array")
        if not items or not isinstance(items, list):
            print(f"[Browser] {platform}: could not parse product array")
            return []

        products: list[ProductInfo] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            price_str = str(item.get("price", "See link"))
            price_num: float | None = None
            num = re.search(r'[\d,]+', price_str.replace(",", ""))
            if num:
                try:
                    price_num = float(num.group(0))
                except ValueError:
                    pass

            products.append(ProductInfo(
                name=item.get("name", ""),
                price=price_str,
                extracted_price=price_num,
                rating=item.get("rating"),
                rating_count=str(item.get("rating_count", "")),
                source=platform,
                url=item.get("url", ""),
                image="",
                specs=item.get("specs") or {},
                delivery=str(item.get("delivery", "")),
            ))
        return products

    except Exception as e:
        print(f"[Browser] {platform} scrape error: {e}")
        return []


def browser_search_product(query: str, platform: str) -> list[ProductInfo]:
    """Sync wrapper for LangGraph nodes and sync generators."""
    return run_async(_async_search_and_scrape(query, platform))


# ---------------------------------------------------------------------------
# 2. Add to cart  (requires user's platform credentials)
# ---------------------------------------------------------------------------

async def browser_add_to_cart(
    query: str,
    platform: str,
    email: str,
    password: str,
) -> dict:
    """
    Log into Amazon.in or Flipkart using the user's credentials,
    search for the product, open the best match, and add it to cart.
    Returns structured result with success status, product details, cart URL.
    """
    domain = "amazon.in" if platform == "amazon" else "flipkart.com"
    platform_name = "Amazon.in" if platform == "amazon" else "Flipkart"

    task = (
        f"Go to https://www.{domain}.\n"
        f"Log in with email/phone: {email} and password: {password}.\n"
        f'After logging in, search for "{query}".\n'
        f"Click on the first relevant product result.\n"
        f'On the product page, click the "Add to Cart" button.\n'
        f"Wait for confirmation that the item was added.\n"
        f"Return ONLY a JSON object:\n"
        f"{{\n"
        f'  "success": true,\n'
        f'  "product_name": "exact product name from the page",\n'
        f'  "product_url": "https://www.{domain}/...",\n'
        f'  "cart_url": "https://www.{domain}/cart",\n'
        f'  "price": "₹XX,XXX",\n'
        f'  "message": "Item added to cart successfully"\n'
        f"}}\n"
        f"Or if anything fails:\n"
        f"{{\n"
        f'  "success": false,\n'
        f'  "product_name": null,\n'
        f'  "product_url": null,\n'
        f'  "cart_url": null,\n'
        f'  "price": null,\n'
        f'  "message": "reason for failure"\n'
        f"}}"
    )

    try:
        client = AsyncBrowserUse(api_key=_key())
        result = await client.run(task)
        output = result.output or ""
        print(f"[Browser] add-to-cart {platform} output: {output[:300]}")

        parsed = _extract_json(output, "object")
        if parsed and isinstance(parsed, dict):
            return {**parsed, "platform": platform_name}

        # Fallback: infer from text
        success = any(w in output.lower() for w in ["added", "cart", "success"])
        return {
            "success": success,
            "platform": platform_name,
            "product_name": None,
            "product_url": None,
            "cart_url": None,
            "price": None,
            "message": output[:400] or "No response",
        }

    except Exception as e:
        print(f"[Browser] add-to-cart error: {e}")
        return {
            "success": False,
            "platform": platform_name,
            "product_name": None,
            "product_url": None,
            "cart_url": None,
            "price": None,
            "message": f"Browser agent error: {str(e)}",
        }


# ---------------------------------------------------------------------------
# 3. Make payment  (requires user's platform credentials)
# ---------------------------------------------------------------------------

async def browser_make_payment(
    query: str,
    platform: str,
    email: str,
    password: str,
) -> dict:
    """
    Log into Amazon.in or Flipkart, find the product in cart (adding it first
    if needed), proceed to checkout, use saved address + payment method,
    and place the order. Returns order confirmation details.
    """
    domain = "amazon.in" if platform == "amazon" else "flipkart.com"
    platform_name = "Amazon.in" if platform == "amazon" else "Flipkart"

    task = (
        f"Go to https://www.{domain}.\n"
        f"Log in with email/phone: {email} and password: {password}.\n"
        f'Search for "{query}" and open the first relevant product.\n'
        f'Add it to cart if not already there, then click "Proceed to Buy" or "Buy Now".\n'
        f"On the checkout page:\n"
        f"- Use the first saved delivery address.\n"
        f"- Use the first available saved payment method (UPI, card, net banking — whatever is saved).\n"
        f"- Confirm and place the order.\n"
        f"Return ONLY a JSON object with the order confirmation:\n"
        f"{{\n"
        f'  "success": true,\n'
        f'  "order_id": "order ID from confirmation page",\n'
        f'  "product_name": "exact product name",\n'
        f'  "amount_paid": "₹XX,XXX",\n'
        f'  "delivery_date": "estimated delivery date",\n'
        f'  "delivery_address": "address used",\n'
        f'  "payment_method": "payment method used",\n'
        f'  "message": "Order placed successfully"\n'
        f"}}\n"
        f"Or if anything fails:\n"
        f"{{\n"
        f'  "success": false,\n'
        f'  "order_id": null,\n'
        f'  "product_name": null,\n'
        f'  "amount_paid": null,\n'
        f'  "delivery_date": null,\n'
        f'  "delivery_address": null,\n'
        f'  "payment_method": null,\n'
        f'  "message": "reason for failure"\n'
        f"}}"
    )

    try:
        client = AsyncBrowserUse(api_key=_key())
        result = await client.run(task)
        output = result.output or ""
        print(f"[Browser] payment {platform} output: {output[:300]}")

        parsed = _extract_json(output, "object")
        if parsed and isinstance(parsed, dict):
            return {**parsed, "platform": platform_name}

        success = any(w in output.lower() for w in ["order placed", "confirmed", "success"])
        return {
            "success": success,
            "platform": platform_name,
            "order_id": None,
            "product_name": None,
            "amount_paid": None,
            "delivery_date": None,
            "delivery_address": None,
            "payment_method": None,
            "message": output[:400] or "No response",
        }

    except Exception as e:
        print(f"[Browser] payment error: {e}")
        return {
            "success": False,
            "platform": platform_name,
            "order_id": None,
            "product_name": None,
            "amount_paid": None,
            "delivery_date": None,
            "delivery_address": None,
            "payment_method": None,
            "message": f"Browser agent error: {str(e)}",
        }
