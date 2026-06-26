import os
import logging
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Set
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor, execute_values
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Search for .env in current directory, parent directory, and backend directory
load_dotenv()  # current dir
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))  # parent
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))  # backend

DATABASE_URL = os.getenv("DATABASE_URL")

# Global connection pool placeholder
_connection_pool: pool.ThreadedConnectionPool = None

def get_connection_pool() -> pool.ThreadedConnectionPool:
    """Lazy initialization of the Threaded Connection Pool."""
    global _connection_pool
    if _connection_pool is None:
        if not DATABASE_URL:
            raise ValueError("DATABASE_URL environment variable is not set!")
        
        # Strip ?pgbouncer=true because psycopg2 does not support it
        clean_url = DATABASE_URL
        if "pgbouncer=" in clean_url:
            from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
            parsed = urlparse(clean_url)
            query_params = parse_qs(parsed.query)
            query_params.pop("pgbouncer", None)
            new_query = urlencode(query_params, doseq=True)
            parsed = parsed._replace(query=new_query)
            clean_url = urlunparse(parsed)
            
        try:
            logger.info("Initializing ThreadedConnectionPool (minconn=1, maxconn=10)...")
            _connection_pool = pool.ThreadedConnectionPool(1, 10, clean_url)
        except Exception as e:
            logger.error(f"Failed to create connection pool: {str(e)}")
            raise
            
    return _connection_pool

@contextmanager
def get_connection():
    """Context manager that yields a connection from the pool and returns it on exit."""
    p = get_connection_pool()
    conn = p.getconn()
    try:
        yield conn
    finally:
        p.putconn(conn)

def get_existing_urls() -> Set[str]:
    """Fetches all article URLs already present in the database. Raises on failure."""
    urls = set()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT url FROM "Article";')
                rows = cur.fetchall()
                urls = {row[0] for row in rows}
    except Exception as e:
        logger.error(f"Error fetching existing URLs: {str(e)}")
        raise  # Propagate error to prevent full site re-scraping
    return urls

def insert_articles(articles: List[Dict[str, Any]]) -> None:
    """
    Inserts a list of normalized articles into the database inside a single transaction.
    """
    if not articles:
        return
        
    query = """
        INSERT INTO "Article" (id, title, summary, content, url, source, "publishedAt", "createdAt")
        VALUES %s
        ON CONFLICT (url) DO NOTHING;
    """
    
    prepared_data = []
    now = datetime.now()
    for art in articles:
        art_id = str(uuid.uuid4())
        prepared_data.append((
            art_id,
            art["title"],
            art.get("summary"),
            art.get("content"),
            art["url"],
            art["source"],
            art["publishedAt"],
            now
        ))
        
    try:
        with get_connection() as conn:
            # Transaction block: automatically commits on success or rolls back on exception
            with conn:
                with conn.cursor() as cur:
                    execute_values(cur, query, prepared_data)
                    logger.info(f"Successfully inserted {len(articles)} articles into the database.")
    except Exception as e:
        logger.error(f"Error inserting articles: {str(e)}")
        raise

def get_articles_for_clustering(days: int = 14) -> List[Dict[str, Any]]:
    """
    Fetches articles published within the last N days to perform clustering on.
    """
    cutoff_date = datetime.now() - timedelta(days=days)
    query = """
        SELECT id, title, summary, content, url, source, "publishedAt"
        FROM "Article"
        WHERE "publishedAt" >= %s;
    """
    try:
        with get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (cutoff_date,))
                return cur.fetchall()
    except Exception as e:
        logger.error(f"Error fetching articles for clustering: {str(e)}")
        return []

def delete_clusters_and_reset_articles(article_ids: List[str]) -> None:
    """
    Removes the cluster associations for the given articles and 
    cleans up empty clusters inside a transaction. Securely uses ANY(%s) query parameters.
    """
    if not article_ids:
        return
        
    try:
        with get_connection() as conn:
            # Transaction block
            with conn:
                with conn.cursor() as cur:
                    # 1. Reset clusterId for the articles using safe ANY() binding
                    cur.execute(
                        'UPDATE "Article" SET "clusterId" = NULL WHERE id = ANY(%s);', 
                        (article_ids,)
                    )
                    
                    # 2. Delete any clusters that have no articles remaining
                    cur.execute("""
                        DELETE FROM "Cluster" 
                        WHERE id NOT IN (
                            SELECT DISTINCT "clusterId" 
                            FROM "Article" 
                            WHERE "clusterId" IS NOT NULL
                        );
                    """)
    except Exception as e:
        logger.error(f"Error resetting clusters: {str(e)}")
        raise

def save_clusters(clusters: List[Dict[str, Any]]) -> None:
    """
    Saves newly created clusters and links articles to them inside a transaction.
    Securely uses ANY(%s) query parameters.
    """
    if not clusters:
        logger.info("No clusters to save.")
        return
        
    now = datetime.now()
    
    try:
        with get_connection() as conn:
            # Transaction block
            with conn:
                with conn.cursor() as cur:
                    for cluster in clusters:
                        cluster_id = str(uuid.uuid4())
                        
                        # 1. Insert the cluster
                        cur.execute(
                            """
                            INSERT INTO "Cluster" (id, label, "startTime", "endTime", "articleCount", "createdAt")
                            VALUES (%s, %s, %s, %s, %s, %s);
                            """,
                            (
                                cluster_id,
                                cluster["label"],
                                cluster["startTime"],
                                cluster["endTime"],
                                cluster["articleCount"],
                                now
                            )
                        )
                        
                        # 2. Update the articles to link to this cluster using safe ANY() binding
                        article_ids = cluster["article_ids"]
                        if article_ids:
                            cur.execute(
                                'UPDATE "Article" SET "clusterId" = %s WHERE id = ANY(%s);',
                                (cluster_id, article_ids)
                            )
                
                logger.info(f"Successfully saved {len(clusters)} clusters to database.")
    except Exception as e:
        logger.error(f"Error saving clusters: {str(e)}")
        raise

def update_job_status(job_id: str, status: str, message: str = None) -> None:
    """Updates the status of an IngestJob inside a transaction."""
    if not job_id:
        return
        
    now = datetime.now()
    try:
        with get_connection() as conn:
            # Transaction block
            with conn:
                with conn.cursor() as cur:
                    if status in ["COMPLETED", "FAILED"]:
                        query = """
                            UPDATE "IngestJob"
                            SET status = %s, "completedAt" = %s, message = %s
                            WHERE id = %s;
                        """
                        cur.execute(query, (status, now, message, job_id))
                    else:
                        query = """
                            UPDATE "IngestJob"
                            SET status = %s, message = %s
                            WHERE id = %s;
                        """
                        cur.execute(query, (status, message, job_id))
        logger.info(f"Job {job_id} updated to {status}")
    except Exception as e:
        logger.error(f"Error updating job status: {str(e)}")
        raise
