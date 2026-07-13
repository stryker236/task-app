FROM node:22-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY frontend/ ./
COPY shared/ ../shared/
ARG VITE_API_TIMEOUT_MS=30000
ENV VITE_API_TIMEOUT_MS=${VITE_API_TIMEOUT_MS}
RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/

ENV PORT=8000 \
    BACKEND_URL=https://taskmanager-utzqe3ir.b4a.run \
    VITE_API_TIMEOUT_MS=30000 \
    NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_URL)$"

EXPOSE 8000

CMD ["nginx", "-g", "daemon off;"]
