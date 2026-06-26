import logging
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def preprocess_article_text(article: Dict[str, Any]) -> str:
    """
    Builds the document text for an article.
    Uses title + summary + content (preferred),
    falling back to title + summary if content is missing.
    """
    title = article.get("title", "")
    summary = article.get("summary", "")
    content = article.get("content", "")
    
    # Clean fields to ensure strings
    title = title if title else ""
    summary = summary if summary else ""
    content = content if content else ""
    
    if content and len(content.strip()) > 100:
        doc = f"{title}\n{summary}\n{content}"
    else:
        doc = f"{title}\n{summary}"
        
    return doc.strip()

def generate_cluster_label(articles: List[Dict[str, Any]], cluster_docs: List[str], tfidf_vectorizer: TfidfVectorizer, top_n: int = 3) -> str:
    """
    Auto-generates a cluster label using the top TF-IDF terms 
    across the articles in the cluster.
    """
    if not articles:
        return "Empty Cluster"
        
    try:
        # Transform the documents in this cluster
        cluster_tfidf = tfidf_vectorizer.transform(cluster_docs)
        
        # Calculate mean TF-IDF score for each term across the cluster
        mean_tfidf = np.asarray(cluster_tfidf.mean(axis=0)).ravel()
        
        # Get sorted feature indices
        feature_names = tfidf_vectorizer.get_feature_names_out()
        top_indices = mean_tfidf.argsort()[::-1]
        
        # Extract top keywords (filtering out numbers or very short words)
        keywords = []
        for idx in top_indices:
            word = feature_names[idx]
            # Simple filters: no digits, length > 2
            if not word.isdigit() and len(word) > 2 and word not in ["news", "report", "article", "says"]:
                keywords.append(word.capitalize())
            if len(keywords) >= top_n:
                break
                
        if keywords:
            return ", ".join(keywords)
            
    except Exception as e:
        logger.warning(f"Failed to generate label from TF-IDF: {str(e)}")
        
    # Fallback: use capitalization of keywords from the most representative article title
    fallback_title = articles[0].get("title", "News Update")
    words = [w for w in fallback_title.split() if len(w) > 3][:3]
    return " ".join(words) if words else "News Cluster"

def run_clustering(articles: List[Dict[str, Any]], similarity_threshold: float = 0.15) -> List[Dict[str, Any]]:
    """
    Clusters the given list of articles.
    
    Similarity threshold is converted to cosine distance threshold:
    distance_threshold = 1.0 - similarity_threshold.
    A higher similarity threshold means articles must be more similar to be clustered.
    
    Returns a list of cluster dicts:
    {
        "label": str,
        "startTime": datetime,
        "endTime": datetime,
        "articleCount": int,
        "article_ids": list of UUID strings
    }
    """
    if not articles:
        logger.info("No articles to cluster.")
        return []
        
    logger.info(f"Clustering {len(articles)} articles with similarity threshold {similarity_threshold}...")
    
    # 1. Preprocess texts and build document corpus
    documents = [preprocess_article_text(art) for art in articles]
    
    # 2. Vectorize documents using TF-IDF
    # We use sublinear TF scaling to damp the effects of highly frequent terms
    vectorizer = TfidfVectorizer(stop_words="english", sublinear_tf=True, min_df=1)
    try:
        tfidf_matrix = vectorizer.fit_transform(documents)
    except ValueError as e:
        # Fits will fail if there are no terms (e.g. only stop words or numbers)
        logger.warning(f"TF-IDF fit failed: {str(e)}. Creating single-article clusters.")
        # Create a single cluster for each article
        return [{
            "label": art["title"][:50],
            "startTime": art["publishedAt"],
            "endTime": art["publishedAt"],
            "articleCount": 1,
            "article_ids": [art["id"]]
        } for art in articles]
        
    # Convert similarity threshold to distance threshold
    # Cosine Distance = 1.0 - Cosine Similarity
    distance_threshold = 1.0 - similarity_threshold
    
    # 3. Apply Agglomerative Clustering
    # We must specify n_clusters=None to use distance_threshold
    # linkage='average' or 'complete' handles cosine distance well.
    # 'average' linkage groups by average distance between all elements.
    clustering = AgglomerativeClustering(
        n_clusters=None,
        metric="cosine",
        linkage="average",
        distance_threshold=distance_threshold
    )
    
    # Fit clustering
    # Note: AgglomerativeClustering requires dense data for the fit_predict step.
    # For dataset sizes under 10,000 articles, converting to a dense array is safe.
    labels = clustering.fit_predict(tfidf_matrix.toarray())
    
    # 4. Group articles by their cluster label
    cluster_groups = {}
    for idx, label_id in enumerate(labels):
        if label_id not in cluster_groups:
            cluster_groups[label_id] = []
        cluster_groups[label_id].append((articles[idx], documents[idx]))
        
    # 5. Build output Cluster objects
    clusters_to_save = []
    for label_id, group in cluster_groups.items():
        group_articles = [item[0] for item in group]
        group_docs = [item[1] for item in group]
        
        # Sort group articles by published time
        group_articles.sort(key=lambda x: x["publishedAt"])
        
        # Get timeline parameters
        start_time = group_articles[0]["publishedAt"]
        end_time = group_articles[-1]["publishedAt"]
        article_count = len(group_articles)
        article_ids = [art["id"] for art in group_articles]
        
        # Auto-generate cluster label
        label = generate_cluster_label(group_articles, group_docs, vectorizer)
        
        clusters_to_save.append({
            "label": label,
            "startTime": start_time,
            "endTime": end_time,
            "articleCount": article_count,
            "article_ids": article_ids
        })
        
    logger.info(f"Formed {len(clusters_to_save)} clusters from {len(articles)} articles.")
    return clusters_to_save
