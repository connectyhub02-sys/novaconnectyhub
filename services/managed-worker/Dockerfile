FROM node:22-alpine
WORKDIR /worker
COPY worker.mjs gateway.mjs ./
USER node
CMD ["node", "worker.mjs"]
