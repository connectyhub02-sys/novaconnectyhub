FROM node:22-alpine
WORKDIR /worker
COPY worker.mjs gateway.mjs ./
COPY telemetry-gateway.mjs telemetry-gateway-main.mjs ./
USER node
CMD ["node", "worker.mjs"]
