FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8000 \
    BACKEND_URL=https://taskmanager-utzqe3ir.b4a.run \
    NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_URL)$"

EXPOSE 8000

CMD ["nginx", "-g", "daemon off;"]
