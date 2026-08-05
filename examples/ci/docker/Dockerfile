FROM node:22-bookworm-slim

WORKDIR /opt/aec-validator
COPY bin/aec-validator.mjs ./aec-validator.mjs
RUN chmod +x ./aec-validator.mjs

ENTRYPOINT ["node", "/opt/aec-validator/aec-validator.mjs"]
