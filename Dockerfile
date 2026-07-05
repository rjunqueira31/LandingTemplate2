FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application code
COPY server.js .
COPY lib/ ./lib/
COPY views/ ./views/
COPY public/ ./public/
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
COPY company-template/ ./company-template/

# Generate Prisma client
RUN npx prisma generate

# Company data is mounted at runtime via COMPANY_DATA_PATH
# Default: /data/company (override with env var)
ENV COMPANY_DATA_PATH=/data/company
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
