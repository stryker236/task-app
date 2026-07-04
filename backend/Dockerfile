FROM node:22-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --chown=node:node backend/ ./
COPY --chown=node:node shared/ ../shared/

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000

USER node

EXPOSE 8000

CMD ["npm", "start"]
