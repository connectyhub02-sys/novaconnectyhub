FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY services/ai-relay/package.json services/ai-relay/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY services/ai-relay/server.mjs ./server.mjs
COPY services/ai-relay/uploads.mjs ./uploads.mjs
RUN mkdir -p /app/state && chown node:node /app/state && chmod 700 /app/state
ENV AI_UPLOAD_STATE_DIR=/app/state
USER node
EXPOSE 3120
CMD ["node", "server.mjs"]
