FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

# ─── Debug stage ───
FROM base AS debug

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

EXPOSE 5173

CMD ["pnpm", "dev"]

# ─── Build stage ───
FROM base AS build

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

RUN pnpm build

# ─── Production stage ───
FROM nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
