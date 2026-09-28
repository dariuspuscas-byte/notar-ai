# notar-ai web UI: built with Vite, served by nginx.
# Build context: frontend/  (see root docker-compose.yml)
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the bundle at build time. The default relative base URL is
# proxied to the backend by nginx (see nginx.conf).
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_ENABLE_MOCKS=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_ENABLE_MOCKS=$VITE_ENABLE_MOCKS

RUN npm run build \
    # The MSW worker is only needed in mock mode.
    && if [ "$VITE_ENABLE_MOCKS" != "true" ]; then rm -f dist/mockServiceWorker.js; fi

FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
