# Use official Node + Python combined image
FROM nikolaik/python-nodejs:python3.12-nodejs20

WORKDIR /app

# Copy the full repo (Railway clones everything)
COPY . .

# Install Python scraper dependencies
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

# Install Node dependencies and build TypeScript
WORKDIR /app/backend
RUN npm ci
RUN npm run build

# Expose port
EXPOSE 3001

# Push DB schema and start server
CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]
