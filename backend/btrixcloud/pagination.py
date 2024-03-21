"""API pagination"""

from typing import Any, List, Optional


DEFAULT_PAGE_SIZE = 1_000


# ============================================================================
def paginated_format(
    items: Optional[List[Any]],
    total: int,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
):
    """Return items in paged format."""
    return {"items": items, "total": total, "page": page, "pageSize": page_size}
