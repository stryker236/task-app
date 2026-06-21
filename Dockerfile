FROM node:22-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node backend/ ./

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000

USER node

EXPOSE 8000

CMD ["npm", "start"]
