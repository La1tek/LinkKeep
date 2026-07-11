from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import math
import re

from sqlalchemy.orm import Session

from app.models import Link, LinkEmbedding

VECTOR_SIZE = 96


def semantic_text(link: Link) -> str:
    highlights = " ".join(item.text for item in (link.highlights or [])[:20])
    summaries = " ".join(item.summary for item in (link.summaries or [])[:3])
    return " ".join([
        link.title or "",
        link.url or "",
        link.description or "",
        link.note or "",
        link.content or "",
        " ".join(link.tags or []),
        highlights,
        summaries,
    ])


def text_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8", "ignore")).hexdigest()


def _tokens(text: str) -> list[str]:
    raw = re.findall(r"[a-zA-Z0-9а-яА-ЯёЁ]{2,}", (text or "").lower())
    tokens: list[str] = []
    for token in raw:
        tokens.append(token)
        if len(token) >= 6:
            tokens.extend(token[idx:idx + 4] for idx in range(max(0, len(token) - 3)))
    return tokens


def embed_text(text: str) -> list[float]:
    vector = [0.0] * VECTOR_SIZE
    for token in _tokens(text):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "big")
        idx = value % VECTOR_SIZE
        sign = -1.0 if value & 1 else 1.0
        vector[idx] += sign
    norm = math.sqrt(sum(item * item for item in vector))
    if norm == 0:
        return vector
    return [round(item / norm, 6) for item in vector]


def cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b:
        return 0.0
    size = min(len(a), len(b))
    return sum(float(a[idx]) * float(b[idx]) for idx in range(size))


def upsert_link_embedding(db: Session, link: Link) -> LinkEmbedding:
    text = semantic_text(link)
    hsh = text_hash(text)
    row = db.query(LinkEmbedding).filter(LinkEmbedding.link_id == link.id, LinkEmbedding.user_id == link.user_id).first()
    if row and row.text_hash == hsh:
        return row
    if not row:
        row = LinkEmbedding(link_id=link.id, user_id=link.user_id)
        db.add(row)
    row.provider = "local-hash"
    row.text_hash = hsh
    row.vector = embed_text(text)
    row.updated_at = datetime.now(timezone.utc)
    return row


def rebuild_user_embeddings(db: Session, user_id: int, limit: int = 1000) -> int:
    links = db.query(Link).filter(Link.user_id == user_id, Link.deleted_at.is_(None)).order_by(Link.updated_at.desc()).limit(limit).all()
    for link in links:
        upsert_link_embedding(db, link)
    return len(links)


def semantic_rank(db: Session, user_id: int, query: str, limit: int = 20, exclude_link_id: int | None = None) -> list[tuple[float, Link]]:
    query_vector = embed_text(query)
    rows = (
        db.query(LinkEmbedding, Link)
        .join(Link, Link.id == LinkEmbedding.link_id)
        .filter(LinkEmbedding.user_id == user_id, Link.user_id == user_id, Link.deleted_at.is_(None))
        .all()
    )
    ranked: list[tuple[float, Link]] = []
    for embedding, link in rows:
        if exclude_link_id is not None and link.id == exclude_link_id:
            continue
        score = cosine(query_vector, embedding.vector or [])
        if score > 0.02:
            ranked.append((score, link))
    ranked.sort(key=lambda item: (item[0], item[1].created_at), reverse=True)
    return ranked[:limit]
