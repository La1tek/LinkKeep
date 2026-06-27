import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
from typing import Optional


async def fetch_metadata(url: str) -> dict:
    """Fetch title, description, and favicon from a URL."""
    result = {"title": None, "description": None, "favicon": None}

    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "LinkKeep/1.0"})
            html = resp.text

        soup = BeautifulSoup(html, "html.parser")

        # Title
        if soup.title and soup.title.string:
            result["title"] = soup.title.string.strip()[:256]
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            result["title"] = og_title["content"][:256]

        # Description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            result["description"] = meta_desc["content"][:512]
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            result["description"] = og_desc["content"][:512]

        # Favicon
        parsed = urlparse(url)
        favicon_icon = soup.find("link", rel="icon") or soup.find("link", rel="shortcut icon")
        if favicon_icon and favicon_icon.get("href"):
            result["favicon"] = urljoin(url, favicon_icon["href"])
        else:
            result["favicon"] = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"

    except Exception:
        pass

    return result
