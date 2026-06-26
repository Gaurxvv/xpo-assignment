import os
import sys
import argparse
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load env variables explicitly before importing database/models
load_dotenv()

# Add the current folder to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from rss import fetch_all_feeds
from extractor import extract_article_content
from deduplicator import filter_duplicates
from cluster import run_clustering
import database as db

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("NewsPulseScraper")

def parse_args():
    parser = argparse.ArgumentParser(description="News Pulse Ingestion Scraper & Clustering Pipeline")
    parser.add_argument("--job-id", type=str, help="IngestJob UUID to update in the database")
    parser.add_argument("--days", type=int, default=30, help="Number of recent days to fetch articles for clustering")
    parser.add_argument("--threshold", type=float, default=0.20, help="Similarity threshold for Agglomerative Clustering (0.0 to 1.0)")
    return parser.parse_args()

def main():
    args = parse_args()
    job_id = args.job_id
    days_to_cluster = args.days
    similarity_threshold = args.threshold
    
    logger.info(f"Starting ingestion pipeline. Job ID: {job_id}")
    
    if job_id:
        try:
            db.update_job_status(job_id, "RUNNING", "Started RSS ingestion pipeline.")
        except Exception as e:
            logger.error(f"Failed to set job status to RUNNING: {str(e)}")
            # We continue anyway
            
    try:
        # Step 1: Fetch articles from RSS feeds
        logger.info("Step 1: Fetching articles from RSS feeds...")
        rss_articles = fetch_all_feeds()
        if not rss_articles:
            msg = "Finished feed fetch: 0 articles found."
            logger.warning(msg)
            if job_id:
                db.update_job_status(job_id, "COMPLETED", msg)
            return
            
        # Step 2: Deduplicate URLs
        logger.info("Step 2: Checking for duplicates...")
        try:
            existing_urls = db.get_existing_urls()
        except Exception as e:
            logger.error(f"Failed to query database for deduplication: {str(e)}")
            raise
            
        new_articles = filter_duplicates(rss_articles, existing_urls)
        
        # Step 3: Extract article content for new articles in parallel
        logger.info(f"Step 3: Extracting content for {len(new_articles)} new articles concurrently...")
        processed_articles = []
        if new_articles:
            from concurrent.futures import ThreadPoolExecutor, as_completed
            
            # Use a thread pool of 8 workers for parallel extraction
            with ThreadPoolExecutor(max_workers=8) as executor:
                future_to_article = {
                    executor.submit(extract_article_content, art["url"]): art 
                    for art in new_articles
                }
                
                for idx, future in enumerate(as_completed(future_to_article)):
                    art = future_to_article[future]
                    try:
                        content = future.result()
                        art["content"] = content
                        processed_articles.append(art)
                        logger.info(f"[{idx+1}/{len(new_articles)}] Completed extraction for: {art['url']}")
                    except Exception as exc:
                        logger.error(f"Extraction generated an exception for {art['url']}: {exc}")
                        art["content"] = None
                        processed_articles.append(art)
            
        # Step 4: Insert new articles into database
        if processed_articles:
            logger.info("Step 4: Inserting new articles into database...")
            db.insert_articles(processed_articles)
        else:
            logger.info("No new articles to insert.")
            
        # Step 5: Perform clustering on recent articles
        logger.info(f"Step 5: Fetching recent articles ({days_to_cluster} days) for clustering...")
        articles_to_cluster = db.get_articles_for_clustering(days=days_to_cluster)
        
        if len(articles_to_cluster) > 0:
            logger.info(f"Running clustering algorithm on {len(articles_to_cluster)} articles...")
            
            # Generate clusters
            new_clusters = run_clustering(articles_to_cluster, similarity_threshold=similarity_threshold)
            
            # Reset existing cluster links and delete old empty clusters
            logger.info("Overwriting old clusters for clustered articles...")
            article_ids = [art["id"] for art in articles_to_cluster]
            db.delete_clusters_and_reset_articles(article_ids)
            
            # Save new clusters and assign clusterId to articles
            logger.info("Saving new clusters to database...")
            db.save_clusters(new_clusters)
        else:
            logger.info("No recent articles found in the database to cluster.")
            
        # Step 6: Complete Job
        success_msg = f"Completed successfully. Fetched {len(new_articles)} new articles."
        logger.info(success_msg)
        if job_id:
            db.update_job_status(job_id, "COMPLETED", success_msg)
            
    except Exception as e:
        error_msg = f"Pipeline execution failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        if job_id:
            try:
                db.update_job_status(job_id, "FAILED", error_msg[:255])
            except Exception as dbe:
                logger.error(f"Failed to update job status to FAILED in DB: {str(dbe)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
