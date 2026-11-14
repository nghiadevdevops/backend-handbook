# syntax=docker/dockerfile:1
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc && rm dist/*.test.js

FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The lab has no runtime dependency, so npm creates no node_modules: mkdir keeps the COPY below valid
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev && mkdir -p node_modules

FROM node:26-slim AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "dist/server.js", "--healthcheck"]
# exec form: node is PID 1 and receives SIGTERM directly (see chapter 2)
CMD ["node", "dist/server.js"]
