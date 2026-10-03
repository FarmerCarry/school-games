# Build from the repository root:
# docker build -f multiplayer-server/Dockerfile -t school-games-multiplayer .
FROM node:22-slim
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
WORKDIR /app/multiplayer-server
COPY multiplayer-server/package.json multiplayer-server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY multiplayer-server/server.mjs ./
COPY shared/board-rules.js /app/shared/board-rules.js
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
