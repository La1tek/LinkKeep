import httpx
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import ipaddress
import socket


def validate_public_http_url(url: str) -> str:
    """Return a normalized URL after rejecting local/private network targets."""
    if not isinstance(url, str):
        raise ValueError("URL must be a string")
    value = url.strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only http and https URLs are allowed")

    hostname = parsed.hostname
    try:
        addresses = [ipaddress.ip_address(hostname)]
    except ValueError:
        try:
            infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            raise ValueError("URL host cannot be resolved") from exc
        addresses = []
        for info in infos:
            address = info[4][0]
            try:
                addresses.append(ipaddress.ip_address(address))
            except ValueError:
                continue

    if not addresses:
        raise ValueError("URL host cannot be resolved")

    for address in addresses:
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            raise ValueError("Local and private network URLs are not allowed")
    return value


async def fetch_metadata(url: str) -> dict:
    """Fetch title, description, and favicon from a URL."""
    url = validate_public_http_url(url)
    result = {"title": None, "description": None, "favicon": None, "image": None}

    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True, trust_env=False) as client:
            resp = await client.get(url, headers={"User-Agent": "LinkKeep/1.0"})
            resp.raise_for_status()
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

        # OG Image
        og_image = soup.find("meta", property="og:image")
        if og_image and og_image.get("content"):
            result["image"] = og_image["content"][:512]

    except httpx.HTTPError:
        pass

    return result
