from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Link, LinkSearchIndex


def build_index_text(link: Link) -> str:
    parts = [
        link.title,
        link.url,
        link.description,
        link.note,
        link.content,
        " ".join(link.tags or []),
    ]
    return " ".join(part for part in parts if part).lower()


def upsert_link_index(db: Session, link: Link) -> LinkSearchIndex:
    row = db.query(LinkSearchIndex).filter(LinkSearchIndex.link_id == link.id).first()
    if row is None:
        row = LinkSearchIndex(link_id=link.id, user_id=link.user_id, text=build_index_text(link))
        db.add(row)
    else:
        row.user_id = link.user_id
        row.text = build_index_text(link)
        row.updated_at = datetime.now(timezone.utc)
    return row


def rebuild_user_index(db: Session, user_id: int) -> int:
    db.query(LinkSearchIndex).filter(LinkSearchIndex.user_id == user_id).delete()
    links = db.query(Link).filter(Link.user_id == user_id).all()
    for link in links:
        upsert_link_index(db, link)
    db.flush()
    return len(links)


def search_user_links(db: Session, user_id: int, query: str, limit: int, offset: int = 0) -> list[Link]:
    tokens = [token.lower() for token in query.split() if token.strip()]
    if not tokens:
        return []

    indexed_count = db.query(LinkSearchIndex).filter(LinkSearchIndex.user_id == user_id).count()
    if indexed_count == 0:
        rebuild_user_index(db, user_id)
        db.commit()

    index_query = db.query(LinkSearchIndex).filter(LinkSearchIndex.user_id == user_id)
    for token in tokens:
        index_query = index_query.filter(LinkSearchIndex.text.contains(token))

    index_rows = index_query.order_by(LinkSearchIndex.updated_at.desc()).offset(offset).limit(limit).all()
    link_ids = [row.link_id for row in index_rows]
    if not link_ids:
        return []

    links = db.query(Link).filter(Link.user_id == user_id, Link.id.in_(link_ids)).all()
    by_id = {link.id: link for link in links}
    return [by_id[link_id] for link_id in link_ids if link_id in by_id]
