# Use official Node + Python combined image
FROM nikolaik/python-nodejs:python3.12-nodejs20

# Copy full repo so scraper/ is accessible at /app/scraper/
WORKDIR /app
COPY . .

# Install Python scraper dependencies globally
RUN pip install --no-cache-dir \
    feedparser==6.0.11 \
    trafilatura==1.9.0 \
    beautifulsoup4==4.12.3 \
    scikit-learn==1.4.2 \
    nltk==3.8.1 \
    psycopg2-binary==2.9.9 \
    python-dotenv==1.0.1 \
    requests==2.31.0 \
    numpy==1.26.4

# Switch to backend folder for Node deps
# /app/backend/package-lock.json exists here
WORKDIR /app/backend
RUN npm ci
RUN npm run build

EXPOSE 3001

# WORKDIR is /app/backend:
#   prisma/schema.prisma → /app/backend/prisma/schema.prisma ✅
#   dist/server.js       → /app/backend/dist/server.js ✅
#   ../scraper/main.py   → /app/scraper/main.py ✅
CMD ["sh", "-c", "npx prisma generate && node dist/server.js"]
