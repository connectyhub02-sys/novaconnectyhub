# Preparation only; pin the approved image digest before deployment.
FROM node:22-alpine
WORKDIR /objects
COPY main.mjs server.mjs protocol.mjs disk-store.mjs ./
RUN mkdir -p /data/objects && chown node:node /data/objects
USER node
CMD ["node", "main.mjs"]
