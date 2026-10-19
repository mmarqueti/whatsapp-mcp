# syntax=docker/dockerfile:1

# Multi-stage build: dependencies and sources stay out of the final image,
# which ships only production node_modules and the compiled dist/.

FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# All dependencies (incl. dev) for the TypeScript build.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm run build

# Production dependencies only.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist

# Run as the non-root user bundled with the Node image.
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
