# Reviewed Linux/amd64 Node image metadata, 2026-09-15. Not built or deployed.
FROM node:22-alpine@sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c
WORKDIR /rehearsal
COPY services/managed-worker/ ./worker/
COPY services/managed-objects/ ./objects/
USER node
CMD ["node", "worker/worker.mjs"]
