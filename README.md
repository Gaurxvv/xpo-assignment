# 📰 News Pulse — RSS Aggregation & Topic Clustering Engine

> A production-quality full-stack dashboard that continuously ingests news from RSS feeds, extracts clean article text, clusters similar stories using TF-IDF + Cosine Similarity, and visualizes them on an interactive timeline.

---

## 🗂️ Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Architecture & Data Flow](#architecture--data-flow)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Clustering Algorithm](#clustering-algorithm)
- [RSS Feed Sources](#rss-feed-sources)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Limitations & Future Enhancements](#limitations--future-enhancements)

---

## Overview

News Pulse solves the problem of **news overload** by automatically grouping related articles from multiple sources into topic clusters. Instead of reading 50 separate headlines, you see a small set of meaningful clusters — each representing a distinct story being covered across the web.

**Key capabilities:**
- Fetches articles from 5 major RSS feeds every time you click **Refresh**
- Deduplicates by URL to avoid re-processing the same article
- Extracts full article body text (not just the RSS summary)
- Groups articles by topic using unsupervised machine learning (no predefined categories)
- Auto-labels each cluster with its top TF-IDF keywords
- Displays clusters on an interactive timeline dashboard

---

## Project Structure

```
Assignment-01/
├── backend/                        # Express.js + Prisma + TypeScript API Server
│   ├── prisma/
│   │   └── schema.prisma           # PostgreSQL schema (Article, Cluster, IngestJob)
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── cluster.controller.ts   # GET /clusters, /clusters/:id, /timeline
│   │   │   └── ingest.controller.ts    # POST /ingest/trigger, GET /ingest/status/:jobId
│   │   ├── middleware/
│   │   │   └── error.middleware.ts     # Global error handler (AppError class)
│   │   ├── routes/
│   │   │   ├── cluster.routes.ts       # Cluster route definitions
│   │   │   └── ingest.routes.ts        # Ingest route definitions
│   │   ├── services/
│   │   │   ├── cluster.service.ts      # Prisma queries for clusters & timeline
│   │   │   ├── ingest.service.ts       # Python subprocess spawner + job tracker
│   │   │   └── prisma.ts               # Prisma client singleton
│   │   └── server.ts               # Express app entry point
│   ├── .env                        # Environment variables (not committed)
│   ├── package.json
│   └── tsconfig.json
│
├── scraper/                        # Python 3.12 Ingestion & Clustering Pipeline
│   ├── .venv/                      # Python virtual environment
│   ├── main.py                     # Pipeline coordinator & CLI entry point
│   ├── rss.py                      # RSS feed fetcher and article normalizer
│   ├── extractor.py                # Full-text HTML extractor (trafilatura + BS4)
│   ├── deduplicator.py             # URL normalizer and duplicate filter
│   ├── cluster.py                  # TF-IDF vectorizer + Agglomerative Clustering
│   ├── database.py                 # Threaded connection pool + raw SQL queries
│   ├── clear_db.py                 # Utility to wipe articles/clusters from DB
│   └── requirements.txt            # Python dependencies
│
└── frontend/                       # Next.js 15 Dashboard
    └── src/
        ├── app/                    # Pages, layout, global CSS
        └── components/             # Timeline, ClusterCard, ThemeProvider, etc.
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, TypeScript, TanStack Query, Recharts |
| **Backend** | Node.js, Express.js, TypeScript, Prisma ORM |
| **Database** | PostgreSQL (hosted on Supabase) |
| **Scraper** | Python 3.12, feedparser, trafilatura, BeautifulSoup4 |
| **ML / Clustering** | scikit-learn (TF-IDF, AgglomerativeClustering), NumPy |
| **DB Connection** | psycopg2 with ThreadedConnectionPool |
| **Process Communication** | Node.js `child_process.spawn()` → Python subprocess |

---

## Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        User Browser                              │
│                    Next.js Dashboard                             │
│         (Timeline View + Cluster Detail + Refresh Button)        │
└───────────────────────────┬──────────────────────────────────────┘
                            │ REST API (JSON)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Express.js Backend (Port 3001)                 │
│   GET /clusters  |  GET /clusters/:id  |  GET /timeline          │
│   POST /ingest/trigger  |  GET /ingest/status/:jobId             │
└────────────┬──────────────────────────────┬─────────────────────┘
             │ Prisma ORM                   │ child_process.spawn()
             ▼                             ▼
┌────────────────────┐       ┌─────────────────────────────────────┐
│  Supabase          │       │     Python Scraper (main.py)        │
│  PostgreSQL        │       │                                     │
│                    │  ◄────│  1. rss.py      → Fetch RSS feeds   │
│  Article           │       │  2. dedup       → Filter known URLs │
│  Cluster           │  ◄────│  3. extractor   → Extract HTML text │
│  IngestJob         │  ◄────│  4. database    → Insert articles   │
│                    │  ◄────│  5. cluster.py  → TF-IDF + cluster  │
└────────────────────┘       │  6. database    → Save clusters     │
                             └─────────────────────────────────────┘
```

### Step-by-Step Flow

1. **Trigger** — User clicks **Refresh News** on the frontend dashboard.
2. **Job Creation** — Backend creates an `IngestJob` record (`PENDING`) in Supabase, then spawns `scraper/main.py --job-id <UUID>` as a **non-blocking background subprocess**.
3. **RSS Ingestion** — Python updates the job to `RUNNING` and fetches articles from 5 RSS feeds (BBC, NPR, TechCrunch, The Verge, Wired).
4. **Deduplication** — Checks the database for all known URLs and discards articles already stored.
5. **Content Extraction** — For each new article, downloads the raw HTML and extracts clean readable text using `trafilatura`. Falls back to `BeautifulSoup` if trafilatura returns nothing. Uses 8 parallel threads for speed.
6. **Database Insert** — New articles are batch-inserted via a single transaction using `execute_values`.
7. **Clustering** — Fetches all articles from the last **30 days**, builds TF-IDF vectors (title + summary + full content), and runs **Agglomerative Hierarchical Clustering** with a cosine similarity threshold of `0.20`.
8. **Cluster Reset & Save** — Old cluster assignments for the fetched articles are cleared. New cluster rows are inserted and linked to their articles via `clusterId`.
9. **Auto-Labeling** — Each cluster is labeled using the **top 3 TF-IDF keywords** across all articles in the cluster.
10. **Completion** — Python exits, backend detects exit and updates the job to `COMPLETED` or `FAILED`. Frontend polling picks up the new status and refreshes the timeline.

---

## Database Schema

```prisma
model Article {
  id          String   @id @default(uuid())
  title       String
  summary     String?  @db.Text
  content     String?  @db.Text       // Full extracted article text
  url         String   @unique        // Deduplication key
  source      String                  // Feed name (e.g. "BBC News")
  publishedAt DateTime
  clusterId   String?
  cluster     Cluster? @relation(fields: [clusterId], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())
}

model Cluster {
  id           String    @id @default(uuid())
  label        String                   // Auto-generated from top TF-IDF keywords
  startTime    DateTime                 // publishedAt of earliest article
  endTime      DateTime                 // publishedAt of latest article
  articleCount Int       @default(0)
  articles     Article[]
  createdAt    DateTime  @default(now())
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model IngestJob {
  id          String    @id @default(uuid())
  status      JobStatus @default(PENDING)
  startedAt   DateTime  @default(now())
  completedAt DateTime?
  message     String?                  // Last status message / error detail
}
```

---

## API Endpoints

| Method | Endpoint | Status Code | Description |
|---|---|---|---|
| `GET` | `/health` | `200` | Server health check |
| `GET` | `/clusters` | `200` | List all clusters with label, articleCount, startTime, endTime, sources |
| `GET` | `/clusters/:id` | `200` / `404` | Full cluster detail with all articles sorted chronologically |
| `GET` | `/timeline` | `200` | Clusters formatted for charting: `{ id, label, start, end, articleCount }` |
| `POST` | `/ingest/trigger` | `202` / `400` | Trigger background scrape + cluster pipeline. Returns `{ jobId }`. Returns `400` if a job is already running. |
| `GET` | `/ingest/status/:jobId` | `200` / `404` | Poll status of a scraper job: `pending`, `running`, `completed`, or `failed` |

### Example Responses

**`GET /timeline`**
```json
[
  {
    "id": "a1b2c3d4-...",
    "label": "Gaza, Ceasefire, Israel",
    "start": "2026-06-24T08:12:00.000Z",
    "end": "2026-06-26T17:45:00.000Z",
    "articleCount": 12
  }
]
```

**`POST /ingest/trigger`**
```json
{ "jobId": "f7e6d5c4-b3a2-1098-7654-321098765432" }
```

**`GET /ingest/status/:jobId`**
```json
{
  "id": "f7e6d5c4-...",
  "status": "completed",
  "startedAt": "2026-06-26T18:00:00.000Z",
  "completedAt": "2026-06-26T18:02:30.000Z",
  "message": "Completed successfully. Fetched 28 new articles."
}
```

---

## Clustering Algorithm

The clustering pipeline in [`scraper/cluster.py`](scraper/cluster.py) uses **unsupervised Agglomerative Hierarchical Clustering** — no predefined number of clusters required.

### How it works

```
Articles (last 30 days)
        │
        ▼
Build Document Text
  ┌─────────────────────────────────────────┐
  │  If content length > 100 chars:         │
  │    doc = title + summary + content      │
  │  Else:                                  │
  │    doc = title + summary                │
  └─────────────────────────────────────────┘
        │
        ▼
TF-IDF Vectorization
  - English stop words removed
  - Sublinear TF scaling (dampens common terms)
        │
        ▼
Agglomerative Clustering
  - metric = cosine
  - linkage = average
  - distance_threshold = 1.0 - similarity_threshold
  - similarity_threshold = 0.20  →  distance_threshold = 0.80
        │
        ▼
Auto-Label Each Cluster
  - Top 3 TF-IDF keywords across all articles in the cluster
  - Filtered: no digits, no words ≤ 2 chars, no generic words
        │
        ▼
Save clusters → Link articles via clusterId
```

### Threshold Tuning Guide

| `similarity_threshold` | `distance_threshold` | Effect |
|---|---|---|
| `0.05` | `0.95` | Very aggressive merging → very few broad clusters |
| `0.10` | `0.90` | More merging → fewer clusters |
| **`0.20` (current)** | **`0.80`** | **Balanced — fewer meaningful clusters** |
| `0.35` | `0.65` | Conservative → many singleton clusters |

> To override the default, pass `--threshold <value>` when running the scraper manually.

---

## RSS Feed Sources

| Source | Feed URL |
|---|---|
| BBC News | `http://feeds.bbci.co.uk/news/rss.xml` |
| NPR News | `https://feeds.npr.org/1001/rss.xml` |
| TechCrunch | `https://techcrunch.com/feed/` |
| The Verge | `https://www.theverge.com/rss/index.xml` |
| Wired | `https://www.wired.com/feed/rss` |

---

## Local Setup

### Prerequisites
- **Node.js** v18+
- **Python** 3.12 (with `venv` support)
- **Supabase** project with a PostgreSQL connection string

---

### Step 1 — Clone & Install Backend

```bash
cd backend
npm install
```

### Step 2 — Configure Environment Variables

Create `backend/.env` (see [Environment Variables](#environment-variables) below):

```bash
cp backend/.env.example backend/.env
# then edit backend/.env with your Supabase credentials
```

### Step 3 — Push Database Schema

```bash
cd backend
npx prisma db push
```

### Step 4 — Setup Python Scraper

```bash
cd scraper
python -m venv .venv
```

**Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Unix / macOS:**
```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 5 — Run the Application

Open **3 terminal windows**:

**Terminal 1 — Backend API:**
```bash
cd backend
npm run dev
# Running at http://localhost:3001
```

**Terminal 2 — Frontend Dashboard:**
```bash
cd frontend
npm run dev
# Running at http://localhost:3000
```

**Terminal 3 — Manual Scraper (optional, or use the Refresh button):**
```bash
cd scraper

# Windows
.venv\Scripts\python main.py

# Unix/macOS
.venv/bin/python main.py

# With custom options
.venv\Scripts\python main.py --days 30 --threshold 0.20
```

### CLI Options for `main.py`

| Flag | Default | Description |
|---|---|---|
| `--days` | `30` | Number of past days to include in clustering window |
| `--threshold` | `0.20` | Cosine similarity threshold for clustering |
| `--job-id` | _(none)_ | UUID of an `IngestJob` row to update (used by backend) |

---

## Environment Variables

### `backend/.env`

```env
# Supabase connection string (Transaction Pooler recommended)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase direct connection (used by Prisma migrations)
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Port for the Express server
PORT=3001

# Optional: path to python if virtualenv is not auto-detected
PYTHON_CMD=python
```

> `DATABASE_URL` and `DIRECT_URL` are both required for Supabase. The pooled URL is used at runtime; the direct URL is used by Prisma migrations.

---

## Deployment

### ✅ Recommended Architecture

| Component | Platform | Notes |
|---|---|---|
| **Frontend** | [Vercel](https://vercel.com) | Native Next.js support, free tier |
| **Backend + Python** | [Railway](https://railway.app) | Supports subprocess spawning, free tier |
| **Database** | [Supabase](https://supabase.com) | Managed PostgreSQL, free tier |

> ⚠️ **Do NOT deploy the backend on Vercel** if you need the ingest trigger to work. Vercel Serverless Functions cannot spawn long-running child processes. Use **Railway** or **Render** for the backend instead.

---

### Deploy Frontend → Vercel

1. Push your project to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import repository.
3. Set **Root Directory** to `frontend`.
4. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
   ```
5. Deploy.

---

### Deploy Backend + Scraper → Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
2. Set **Root Directory** to `backend`.
3. Set **Build Command**:
   ```bash
   npm install && npm run build && pip install -r ../scraper/requirements.txt
   ```
4. Set **Start Command**:
   ```bash
   npx prisma migrate deploy && npm start
   ```
5. Add environment variables in Railway dashboard:
   ```
   DATABASE_URL=<your supabase pooled connection string>
   DIRECT_URL=<your supabase direct connection string>
   PORT=3001
   PYTHON_CMD=python3
   ```

> Railway has Python pre-installed. The scraper's `.venv` is not needed on Railway — install packages globally via the build command.

---

### Deploy Database → Supabase

1. Go to [supabase.com](https://supabase.com) → **New Project**.
2. After creation, go to **Project Settings → Database → Connection String**.
3. Copy both:
   - **Transaction Pooler** URL → use as `DATABASE_URL`
   - **Direct Connection** URL → use as `DIRECT_URL`
4. Run `npx prisma db push` once to create the tables.

---

## Limitations & Future Enhancements

| Limitation | Potential Fix |
|---|---|
| **Scraper blocking** | Some sites block scrapers after repeated requests. A rotating proxy middleware or headless browser (Playwright) would improve reliability. |
| **Full re-clustering** | Every run re-clusters the entire 30-day window. For high-volume sites, incremental clustering (assigning new articles to existing cluster centroids) would be faster. |
| **Keyword-based labels** | TF-IDF labels like "Gaza, Ceasefire, Israel" are useful but not grammatically natural. Replacing with a small LLM (e.g. Ollama/Gemma) would produce "Israel-Gaza Ceasefire Talks" style titles. |
| **Single ingestion source** | Only 5 RSS feeds. The `DEFAULT_FEEDS` list in `rss.py` can be extended trivially with any valid RSS URL. |
| **No auth** | The ingest trigger is open to anyone. Adding an API key header check to `POST /ingest/trigger` would prevent abuse in production. |
