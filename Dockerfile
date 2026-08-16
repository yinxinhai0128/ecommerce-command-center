FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV OLIST_DATA_DIR=/data/olist
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile && mkdir -p /data/olist && chown -R node:node /app /data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
USER node
EXPOSE 8787
VOLUME ["/data/olist"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--env-file-if-exists=.env", "--import", "tsx", "server/index.ts"]
