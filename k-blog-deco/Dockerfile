# K 블로그 꾸미기 — 단일 서버 배포용. DATABASE_URL·SUPABASE_* 가 없으면 /data 볼륨에 내장 Postgres(PGlite)와 이미지 저장
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
