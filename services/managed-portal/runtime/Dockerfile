FROM node:22-alpine@sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node --chmod=0555 services/managed-portal/.next/standalone/ ./
COPY --chown=node:node --chmod=0555 services/managed-portal/.next/static/ ./services/managed-portal/.next/static/
COPY --chmod=0555 services/managed-portal/runtime/*.mjs ./runtime/
COPY --chmod=0555 services/managed-objects/*.mjs ./managed-objects/
COPY --chmod=0555 services/managed-worker/telemetry-gateway*.mjs ./worker/
USER node
CMD ["node","services/managed-portal/server.js"]
