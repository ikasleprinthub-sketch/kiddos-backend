# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY tsconfig.json next.config.ts prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public

# Generate Prisma client (v7: outputs to src/generated/prisma)
RUN npx prisma generate

# Build the Next.js app
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

# Copy the built application files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
# Copy generated Prisma client (v7 generates to src/generated/prisma)
COPY --from=builder /app/src/generated ./src/generated
# Schema + migrations, applied on start (the prisma CLI is a production dependency for this)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# Uploaded images live here; mount a persistent volume on it (see docker-compose.yml).
# Created in the image so the app can write even before a volume is attached.
ENV UPLOAD_DIR=/app/uploads
RUN mkdir -p /app/uploads

EXPOSE 8000

# Apply pending migrations, then start. If a migration fails the container stops instead of serving
# code against an outdated schema. `npm start` pins port 5050 (local dev); here listen on $PORT (default 8000).
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node_modules/.bin/next start -p ${PORT:-8000}"]
