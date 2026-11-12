FROM node:24-bookworm-slim
WORKDIR /app
COPY bot/package.json bot/package-lock.json ./bot/
RUN cd bot && npm ci --omit=dev --ignore-scripts
COPY model.mjs ./
COPY bot/*.mjs ./bot/
WORKDIR /app/bot
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3978 POKER_DB_PATH=/data/poker.sqlite
USER node
EXPOSE 3978
CMD ["node", "server.mjs"]
