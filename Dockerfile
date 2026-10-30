# Production multi-stage Dockerfile for PoCMS-Payload (Next.js 16 + Payload CMS 3).
# Sets `DOCKER_BUILD=true` so `next.config.ts` emits `.next/standalone` automatically.

FROM node:22.17.0-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DOCKER_BUILD=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV PAYLOAD_SECRET=docker-build-placeholder-secret-min-32-chars

RUN corepack enable pnpm && pnpm run generate:all && pnpm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir -p .next media && chown -R nextjs:nodejs .next media

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
