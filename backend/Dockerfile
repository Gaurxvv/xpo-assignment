# Use official Node + Python combined image
FROM nikolaik/python-nodejs:python3.12-nodejs20

# Railway copies only the /backend folder contents here (Root Directory = /backend)
# So /app/ contains: prisma/, src/, dist/, package.json etc. directly
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

# Install Node dependencies and build TypeScript
RUN npm ci
RUN npm run build

# Expose port
EXPOSE 3001

# WORKDIR is /app, so prisma/schema.prisma and dist/server.js are found correctly
CMD ["sh", "-c", "npx prisma generate && node dist/server.js"]
