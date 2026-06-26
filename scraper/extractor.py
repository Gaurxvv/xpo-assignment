import requests
import trafilatura
from bs4 import BeautifulSoup
import logging
import time
import random
from typing import Optional

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
]

def get_random_headers() -> dict:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0"
    }

def extract_with_trafilatura(url: str) -> Optional[str]:
    """Primary extraction method using trafilatura."""
    try:
        # trafilatura.fetch_url has its own request mechanism, 
        # but sometimes standard requests are more flexible.
        # We try fetch_url first.
        downloaded = trafilatura.fetch_url(url)
        if downloaded is None:
            # Try fetching manually with requests and passing to trafilatura
            headers = get_random_headers()
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                downloaded = response.text
            else:
                logger.warning(f"Manual download failed for {url} with status {response.status_code}")
                return None
                
        if downloaded:
            content = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=False,
                no_fallback=False
            )
            if content:
                cleaned = content.strip()
                if len(cleaned) > 100:  # Check if we got substantial content
                    return cleaned
    except Exception as e:
        logger.debug(f"Trafilatura failed for {url}: {str(e)}")
    return None

def extract_with_beautifulsoup(url: str) -> Optional[str]:
    """Fallback extraction method using requests and BeautifulSoup."""
    try:
        headers = get_random_headers()
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            return None
            
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "header", "footer", "aside"]):
            script.decompose()
            
        # Common article body selectors
        body_selectors = [
            "article",
            ".article-body",
            ".article-content",
            ".entry-content",
            ".post-content",
            "#article-body",
            "#article-content"
        ]
        
        article_elem = None
        for selector in body_selectors:
            article_elem = soup.select_one(selector)
            if article_elem:
                break
                
        # If no specific container found, fallback to body
        if not article_elem:
            article_elem = soup.body
            
        if not article_elem:
            return None
            
        # Extract paragraph text
        paragraphs = article_elem.find_all("p")
        text_blocks = [p.get_text().strip() for p in paragraphs if len(p.get_text().strip()) > 20]
        
        if text_blocks:
            content = "\n\n".join(text_blocks)
            if len(content) > 100:
                return content
                
    except Exception as e:
        logger.debug(f"BeautifulSoup fallback failed for {url}: {str(e)}")
        
    return None

def extract_article_content(url: str, retries: int = 2, delay: float = 1.0) -> Optional[str]:
    """
    Downloads and extracts article readable content with retries.
    Prefers trafilatura, falls back to BeautifulSoup.
    """
    for attempt in range(retries + 1):
        try:
            # 1. Try Trafilatura
            content = extract_with_trafilatura(url)
            if content:
                return content[:5000].strip()
                
            # 2. Try BeautifulSoup fallback
            content = extract_with_beautifulsoup(url)
            if content:
                return content[:5000].strip()
                
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1} failed for {url}: {str(e)}")
            
        if attempt < retries:
            sleep_time = delay * (2 ** attempt) + random.uniform(0, 0.5)
            logger.info(f"Retrying extraction for {url} in {sleep_time:.2f} seconds...")
            time.sleep(sleep_time)
            
    logger.error(f"Failed to extract content from {url} after {retries + 1} attempts.")
    return None

if __name__ == "__main__":
    # Test extractor
    logging.basicConfig(level=logging.INFO)
    test_url = "https://techcrunch.com/2024/04/17/meta-is-testing-its-ai-chatbot-with-users-in-india-on-whatsapp/"
    logger.info(f"Testing extraction on: {test_url}")
    text = extract_article_content(test_url)
    if text:
        logger.info(f"Extracted content length: {len(text)}")
        logger.info(f"First 200 chars:\n{text[:200]}")
    else:
        logger.info("Failed to extract text.")
