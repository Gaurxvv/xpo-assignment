import logging
from urllib.parse import urlparse, urlunparse
from typing import List, Dict, Any, Set

logger = logging.getLogger(__name__)

def normalize_url(url: str) -> str:
    """
    Normalizes a URL by converting the scheme and netloc to lowercase,
    removing tracking parameters, and stripping trailing slashes.
    """
    try:
        parsed = urlparse(url.strip())
        # Lowercase scheme and netloc (domain)
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        path = parsed.path
        
        # Remove trailing slash from path
        if path.endswith("/"):
            path = path[:-1]
            
        # Ignore query parameters (tracking, etc.) for normalization
        # Some sites use query parameters for article IDs, but standard RSS feeds 
        # usually use clean URLs. Stripping queries prevents duplicated articles 
        # from social share tokens like ?utm_source=rss.
        # But if the URL relies on query parameters (e.g., id=123), we keep them.
        query = ""
        if any(keyword in parsed.query for keyword in ["id=", "article=", "p="]):
            query = parsed.query
            
        normalized = urlunparse((scheme, netloc, path, parsed.params, query, parsed.fragment))
        return normalized
    except Exception as e:
        logger.warning(f"Failed to normalize URL {url}: {str(e)}")
        return url

def filter_duplicates(articles: List[Dict[str, Any]], existing_urls: Set[str]) -> List[Dict[str, Any]]:
    """
    Filters out articles that already exist in the database
    or are duplicated in the current feed batch.
    """
    normalized_existing = {normalize_url(url) for url in existing_urls}
    unique_articles = []
    seen_in_batch = set()
    
    for art in articles:
        url = art.get("url")
        if not url:
            continue
            
        norm_url = normalize_url(url)
        
        if norm_url in normalized_existing:
            # Already exists in DB
            continue
            
        if norm_url in seen_in_batch:
            # Duplicate in current run
            continue
            
        seen_in_batch.add(norm_url)
        # Store the normalized URL as the primary identifier
        art["url"] = norm_url
        unique_articles.append(art)
        
    logger.info(f"Deduplication: filtered {len(articles) - len(unique_articles)} duplicate articles. {len(unique_articles)} remain.")
    return unique_articles
