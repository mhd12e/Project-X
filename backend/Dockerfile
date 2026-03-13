FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

# Claude Agent SDK requires the Claude Code CLI installed globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user — Claude Code CLI refuses bypass-permissions as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# su-exec for dropping privileges at runtime, script for pseudo-TTY (claude setup-token)
RUN apk add --no-cache su-exec util-linux

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

# ─── Debug stage ───
FROM base AS debug

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["entrypoint.sh"]
CMD ["pnpm", "start:dev"]

# ─── Build stage ───
FROM base AS build

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

RUN pnpm build

# ─── Production stage ───
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Claude Agent SDK requires the Claude Code CLI installed globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

RUN apk add --no-cache su-exec util-linux

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/main.js"]
