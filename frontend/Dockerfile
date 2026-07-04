FROM node:22-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY frontend/ ./
COPY shared/ ../shared/
RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/

ENV PORT=8000 \
    BACKEND_URL=https://taskmanager-utzqe3ir.b4a.run \
    NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_URL)$"

EXPOSE 8000

CMD ["nginx", "-g", "daemon off;"]
