import feedparser
import logging
from datetime import datetime
import time
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

DEFAULT_FEEDS = [
    {"name": "BBC News", "url": "http://feeds.bbci.co.uk/news/rss.xml"},
    {"name": "NPR News", "url": "https://feeds.npr.org/1001/rss.xml"},
    {"name": "TechCrunch", "url": "https://techcrunch.com/feed/"},
    {"name": "The Verge", "url": "https://www.theverge.com/rss/index.xml"},
    {"name": "Wired", "url": "https://www.wired.com/feed/rss"}
]

def parse_published_date(entry: Any) -> datetime:
    """Helper to parse various date formats in RSS feeds."""
    for date_key in ["published_parsed", "updated_parsed", "created_parsed"]:
        parsed_struct = getattr(entry, date_key, None)
        if parsed_struct:
            try:
                return datetime.fromtimestamp(time.mktime(parsed_struct))
            except Exception:
                pass
    
    # Fallback to string parsing if structure parsing failed
    for date_key in ["published", "updated", "created"]:
        val = getattr(entry, date_key, None)
        if val:
            try:
                # Try common formats or let dateutil parse it if available
                # feedparser does a lot of work parsing dates into entry.published_parsed, 
                # but if that fails, we can fall back to datetime.now()
                return datetime.strptime(val, "%a, %d %b %Y %H:%M:%S %Z")
            except Exception:
                pass
                
    return datetime.now()

def fetch_feed(feed_name: str, feed_url: str) -> List[Dict[str, Any]]:
    """Fetches a single RSS feed and normalizes its articles."""
    logger.info(f"Fetching feed '{feed_name}' from URL: {feed_url}")
    normalized_articles = []
    
    try:
        # Use feedparser to download and parse feed
        feed = feedparser.parse(feed_url)
        
        # Check for parse errors
        if feed.bozo:
            # Note: bozo might be 1 even for minor XML standard deviations. 
            # We only log a warning and still try to process entries.
            logger.warning(f"Feed '{feed_name}' might have XML format issues: {feed.bozo_exception}")
            
        if not feed.entries:
            logger.warning(f"No entries found in feed '{feed_name}'")
            return []
            
        for entry in feed.entries:
            title = getattr(entry, "title", "").strip()
            url = getattr(entry, "link", "").strip()
            summary = getattr(entry, "summary", "").strip()
            
            # If summary is missing, check description
            if not summary:
                summary = getattr(entry, "description", "").strip()
                
            # If still missing, check content
            if not summary and hasattr(entry, "content"):
                summary = entry.content[0].value.strip()

            if not title or not url:
                # Skip invalid entries
                continue
                
            published_at = parse_published_date(entry)
            
            normalized_articles.append({
                "title": title,
                "url": url,
                "summary": summary,
                "source": feed_name,
                "publishedAt": published_at
            })
            
        logger.info(f"Successfully fetched {len(normalized_articles)} articles from '{feed_name}'")
        
    except Exception as e:
        logger.error(f"Error fetching feed '{feed_name}': {str(e)}")
        
    return normalized_articles

def fetch_all_feeds(feeds: List[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """Fetches multiple feeds and merges the normalized articles."""
    if feeds is None:
        feeds = DEFAULT_FEEDS
        
    all_articles = []
    for idx, feed_info in enumerate(feeds):
        name = feed_info.get("name", "Unknown Source")
        url = feed_info.get("url")
        if not url:
            continue
            
        # Add a polite rate-limiting delay between fetches
        if idx > 0:
            time.sleep(0.5)
            
        articles = fetch_feed(name, url)
        all_articles.extend(articles)
        
    logger.info(f"Total articles fetched from all RSS sources: {len(all_articles)}")
    return all_articles

if __name__ == "__main__":
    # Test the RSS module
    test_articles = fetch_all_feeds()
    if test_articles:
        logger.info(f"Sample Article: {test_articles[0]}")
    else:
        logger.info("No articles fetched.")
